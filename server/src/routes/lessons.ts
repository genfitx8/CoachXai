import { Router, Request, Response } from 'express';
import pool from '../services/db';
import { authMiddleware, AuthRole } from '../middleware/auth';
import { signMediaUrl, reSignIfMedia } from '../services/mediaAccess';
import { recordEventSafe } from '../services/events';
import { recordAiFeedbackSafe } from '../services/aiFeedback';
import { reviewSectionsToText } from '../services/reviewSections';
import { deleteObjectsByPrefix } from '../services/r2';

const router = Router();
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// All routes require authentication
router.use(authMiddleware);

/**
 * Recursively re-sign any /api/files/... URLs inside the arbitrary JSON
 * that additional_media / compare_video_metadata etc. can carry. Walks
 * strings only; objects and arrays are traversed structurally.
 */
function reSignMediaTree(value: unknown): unknown {
  if (typeof value === 'string') return reSignIfMedia(value);
  if (Array.isArray(value)) return value.map(reSignMediaTree);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = reSignMediaTree(v);
    }
    return out;
  }
  return value;
}

function mapLesson(row: Record<string, unknown>, viewerRole?: AuthRole) {
  // Prefer signing the stored key when available; fall back to re-signing
  // whatever's in video_url (covers legacy rows that only have the URL form).
  const videoKey = row.video_key as string | null;
  const videoUrl =
    videoKey
      ? signMediaUrl(videoKey).url
      : reSignIfMedia(row.video_url as string | null);

  // Redesign 8b: freeMemo is the coach's private note, never shipped to
  // the student. Strip it here so a future consumer bug can't accidentally
  // surface it — the client UI already hides it, but data-layer defense
  // in depth is worth the two lines.
  let reviewSections = reSignMediaTree(row.review_sections) as
    | Record<string, unknown>
    | null
    | undefined;
  if (viewerRole === 'client' && reviewSections && typeof reviewSections === 'object') {
    const { freeMemo: _freeMemo, ...rest } = reviewSections as Record<string, unknown>;
    void _freeMemo;
    reviewSections = rest;
  }

  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name,
    clientPhone: row.client_phone,
    coachId: row.coach_id,
    createdBy: row.created_by,
    recordType: row.record_type,
    title: row.title,
    date: row.date,
    club: row.club,
    targetDistance: row.target_distance,
    score: row.score,
    scorecardDetail: row.scorecard_detail,
    videoUrl,
    videoKey: row.video_key,
    mediaType: row.media_type,
    swingAngle: row.swing_angle,
    additionalMedia: reSignMediaTree(row.additional_media),
    thumbnailUrl: reSignIfMedia(row.thumbnail_url as string | null),
    coachNotes: row.coach_notes,
    aiAnalysis: row.ai_analysis,
    scorecard: row.scorecard,
    tags: row.tags,
    golfData: row.golf_data,
    swingSequence: row.swing_sequence,
    shareOption: row.share_option,
    clientFeedback: row.client_feedback,
    feedbackStatus: row.feedback_status,
    memberBodyAnalysis: row.member_body_analysis,
    assignedHomework: row.assigned_homework,
    editedVideoUrl: reSignIfMedia(row.edited_video_url as string | null),
    videoEditMetadata: reSignMediaTree(row.video_edit_metadata),
    compareVideoUrl: reSignIfMedia(row.compare_video_url as string | null),
    compareVideoMetadata: reSignMediaTree(row.compare_video_metadata),
    media: reSignMediaTree(row.media),
    lessonPackageId: row.lesson_package_id,
    sessionNumber: row.session_number,
    // 레슨 동반(LIVE_LESSON) 전용 자료 — 필기(transcript)와 요약본.
    liveLessonDetail: row.live_lesson_detail ?? undefined,
    // Data ownership 3-tier (#309). Defaults match the DB defaults so a
    // client that hasn't updated its types yet still sees sensible values.
    ownership: (row.ownership as string | null) ?? 'shared',
    visibility: (row.visibility as string | null) ?? 'coach',
    originalCoachId: row.original_coach_id,
    // Review workflow (redesign 8b). NULL approval_status means legacy
    // lesson from before the review flow — treated as visible.
    approvalStatus: row.approval_status ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    sharedToStudent: row.shared_to_student ?? undefined,
    reviewSections: reviewSections ?? undefined,
    // AI 초안(§6.1 가치 1위 페어의 왼쪽 항)은 코치의 작업 흔적이다 —
    // 학생에게는 보내지 않는다. 코치 UI는 "AI 원안 보기"에만 쓴다.
    reviewSectionsDraft:
      viewerRole === 'client'
        ? undefined
        : (reSignMediaTree(row.review_sections_draft) as
            | Record<string, unknown>
            | null) ?? undefined,
    reviewDraftAt: viewerRole === 'client' ? undefined : row.review_draft_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/lessons
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;

    let result;
    if (userRole === 'admin') {
      // Admin console shows platform-wide lesson stats.
      result = await pool.query('SELECT * FROM lessons ORDER BY created_at DESC');
    } else if (userRole === 'coach') {
      // Coach: every lesson this coach owns — the current assignment
      // (coach_id) plus the creator stamp (original_coach_id), which keeps a
      // coach's own teaching history visible if the record is ever reassigned.
      //
      // The handover trail (#309 `previous_coach_ids`) lives on `clients`,
      // NOT on `lessons`: a lesson row keeps the coach_id it was written with,
      // so there is no per-lesson chain to walk. An earlier version of this
      // query read `lessons.previous_coach_ids` — a column no migration
      // creates — and every coach's GET /api/lessons failed with a 500. The
      // app silently fell back to its device-local cache, so 전체 레슨기록
      // showed whatever the last account on that device had cached instead of
      // this coach's real records. Any column named here must exist in
      // server/migrations (see __tests__/lessonQueryColumns.test.ts).
      result = await pool.query(
        `SELECT * FROM lessons
           WHERE coach_id = $1
              OR original_coach_id = $1
           ORDER BY created_at DESC`,
        [userId]
      );
    } else if (userRole === 'client') {
      // Client: first get the client's name, phone, and coach linkage
      const clientResult = await pool.query(
        'SELECT name, phone, coach_id FROM clients WHERE id = $1',
        [userId]
      );

      if (clientResult.rows.length === 0) {
        res.status(404).json({ error: 'Client not found' });
        return;
      }

      const client = clientResult.rows[0];
      const clientCompositeId = `${client.name}_${client.phone}`;
      // Normalize phone to digits-only so format differences (010-1234-5678 vs
      // 01012345678) don't prevent lessons from being found.
      const normalizedPhone = client.phone
        ? client.phone.replace(/[^0-9]/g, '')
        : '';

      // Review gate (redesign 8b): a lesson in 'draft' approval status is
      // coach-only until the coach hits 승인. NULL approval_status keeps
      // legacy pre-8b lessons visible so this migration doesn't hide
      // existing history. Combined into the visibility filter below.
      const STUDENT_VISIBLE_FILTER = `
        COALESCE(ownership, 'shared') <> 'coach'
        AND (approval_status IS NULL OR approval_status = 'approved')
        AND (shared_to_student IS NULL OR shared_to_student = true)
      `;

      if (normalizedPhone) {
        // Search by client_id composite OR by normalized phone number.
        // The phone-based branch catches lessons created before the member
        // signed up, or when the coach stored the phone in a different format.
        //
        // Data ownership (#309): the phone branch is no longer gated by the
        // student's *current* coach_id. Lessons default to ownership='shared'
        // — the student keeps read access on handover — so a member who moved
        // coaches still sees their history. Coach-only rows (ownership='coach')
        // are excluded so private lesson notes never leak to the student.
        result = await pool.query(
          `SELECT * FROM (
            SELECT * FROM lessons
              WHERE client_id = $1 AND ${STUDENT_VISIBLE_FILTER}
            UNION
            SELECT * FROM lessons
              WHERE REGEXP_REPLACE(COALESCE(client_phone, ''), '[^0-9]', '', 'g') = $2
                AND ${STUDENT_VISIBLE_FILTER}
          ) AS combined ORDER BY created_at DESC`,
          [clientCompositeId, normalizedPhone]
        );
      } else {
        result = await pool.query(
          `SELECT * FROM lessons
             WHERE client_id = $1 AND ${STUDENT_VISIBLE_FILTER}
             ORDER BY created_at DESC`,
          [clientCompositeId]
        );
      }
    } else {
      res.status(403).json({ error: 'Invalid user role' });
      return;
    }

    res.json({ lessons: result.rows.map((r) => mapLesson(r, userRole)) });
  } catch (err) {
    console.error('[lessons] GET / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/lessons
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const {
      id,
      clientId, clientName, clientPhone,
      createdBy, recordType,
      title, date, club, targetDistance, score, scorecardDetail,
      videoUrl, videoKey, mediaType, swingAngle,
      additionalMedia, thumbnailUrl,
      coachNotes, aiAnalysis, scorecard,
      tags, golfData, swingSequence, shareOption,
      clientFeedback, feedbackStatus,
      memberBodyAnalysis, assignedHomework,
      editedVideoUrl, videoEditMetadata,
      compareVideoUrl, compareVideoMetadata,
      media, lessonPackageId, sessionNumber,
      liveLessonDetail,
      visibility,
    } = req.body as Record<string, unknown>;
    const lessonId =
      typeof id === 'string' && id.trim().length > 0 ? id.trim() : null;
    if (lessonId && !UUID_PATTERN.test(lessonId)) {
      res.status(400).json({ error: 'Invalid lesson id: must be a valid UUID format' });
      return;
    }
    // ownership is server-authoritative — lessons are always 'shared' at
    // creation, and only the internal handover flow may downgrade later.
    // visibility is client-selectable within a whitelist.
    const ALLOWED_VISIBILITY = new Set(['self', 'coach', 'branch']);
    const resolvedVisibility =
      typeof visibility === 'string' && ALLOWED_VISIBILITY.has(visibility)
        ? visibility
        : 'coach';

    // Resolve the coach_id and client_id server-side so client uploads can't
    // spoof another student's records or store their own auth id as coach_id.
    let resolvedCoachId: string | null = null;
    let resolvedClientId: string | null =
      typeof clientId === 'string' && clientId.trim().length > 0
        ? (clientId as string).trim()
        : null;
    let resolvedClientName: string | null =
      typeof clientName === 'string' ? (clientName as string).trim() : null;
    let resolvedClientPhone: string | null =
      typeof clientPhone === 'string' ? (clientPhone as string).trim() : null;

    if (userRole === 'coach') {
      resolvedCoachId = userId;
    } else if (userRole === 'client') {
      const clientRow = await pool.query(
        'SELECT name, phone, coach_id FROM clients WHERE id = $1',
        [userId]
      );
      if (clientRow.rows.length === 0) {
        res.status(404).json({ error: 'Client not found' });
        return;
      }
      const client = clientRow.rows[0];
      resolvedCoachId = client.coach_id ?? null;
      // Always trust the authenticated student's own identity for their own
      // uploads – prevents a student from writing lessons under another
      // student's name/phone.
      resolvedClientName = client.name ?? resolvedClientName;
      resolvedClientPhone = client.phone ?? resolvedClientPhone;
      resolvedClientId = `${resolvedClientName ?? ''}_${resolvedClientPhone ?? ''}`;
    } else {
      res.status(403).json({ error: 'Invalid user role' });
      return;
    }

    // Fall back to a composite key when the client didn't send one.
    if (!resolvedClientId && resolvedClientName && resolvedClientPhone) {
      resolvedClientId = `${resolvedClientName}_${resolvedClientPhone}`;
    }

    const now = Date.now();

    const result = await pool.query(
      `INSERT INTO lessons (
        id,
        client_id, client_name, client_phone, coach_id,
        created_by, record_type,
        title, date, club, target_distance, score, scorecard_detail,
        video_url, video_key, media_type, swing_angle,
        additional_media, thumbnail_url,
        coach_notes, ai_analysis, scorecard,
        tags, golf_data, swing_sequence, share_option,
        client_feedback, feedback_status,
        member_body_analysis, assigned_homework,
        edited_video_url, video_edit_metadata,
        compare_video_url, compare_video_metadata,
        media, lesson_package_id, session_number,
        live_lesson_detail,
        ownership, visibility, original_coach_id,
        created_at, updated_at
      ) VALUES (
        COALESCE($1::uuid, gen_random_uuid()),
        $2, $3, $4, $5,
        $6, $7,
        $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17,
        $18, $19,
        $20, $21, $22,
        $23, $24, $25, $26,
        $27, $28,
        $29, $30,
        $31, $32,
        $33, $34,
        $35, $36, $37,
        $38,
        'shared', $39, $5,
        $40, $41
      ) RETURNING *`,
      [
        lessonId,
        resolvedClientId, resolvedClientName, resolvedClientPhone, resolvedCoachId,
        createdBy ?? null, recordType ?? null,
        title ?? null, date ?? null, club ?? null,
        targetDistance ?? null, score ?? null,
        scorecardDetail ? JSON.stringify(scorecardDetail) : null,
        videoUrl ?? null, videoKey ?? null, mediaType ?? null, swingAngle ?? null,
        additionalMedia ? JSON.stringify(additionalMedia) : null, thumbnailUrl ?? null,
        coachNotes ?? null,
        aiAnalysis ? JSON.stringify(aiAnalysis) : null,
        scorecard ? JSON.stringify(scorecard) : null,
        tags ? JSON.stringify(tags) : null,
        golfData ? JSON.stringify(golfData) : null,
        swingSequence ? JSON.stringify(swingSequence) : null,
        shareOption ?? null,
        clientFeedback ? JSON.stringify(clientFeedback) : null,
        feedbackStatus ?? null,
        memberBodyAnalysis ? JSON.stringify(memberBodyAnalysis) : null,
        assignedHomework ? JSON.stringify(assignedHomework) : null,
        editedVideoUrl ?? null,
        videoEditMetadata ? JSON.stringify(videoEditMetadata) : null,
        compareVideoUrl ?? null,
        compareVideoMetadata ? JSON.stringify(compareVideoMetadata) : null,
        media ? JSON.stringify(media) : null,
        lessonPackageId ?? null, sessionNumber ?? null,
        liveLessonDetail ? JSON.stringify(liveLessonDetail) : null,
        resolvedVisibility,
        now, now,
      ]
    );

    const created = result.rows[0];
    recordEventSafe({
      actorId: userId,
      actorRole: userRole,
      eventType: 'lesson.created',
      entityType: 'lesson',
      entityId: created.id as string,
      // The authenticated client's own id is the canonical student UUID;
      // coach-created lessons only carry the legacy composite id (payload).
      studentUuid: userRole === 'client' ? userId : null,
      payload: {
        recordType: (created.record_type as string | null) ?? null,
        clientCompositeId: (created.client_id as string | null) ?? null,
        coachId: (created.coach_id as string | null) ?? null,
        hasVideo: Boolean(created.video_key || created.video_url),
        hasGolfData: created.golf_data != null,
      },
    });

    res.status(201).json({ lesson: mapLesson(created, userRole) });
  } catch (err) {
    console.error('[lessons] POST / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Verify the authenticated user is allowed to modify the given lesson.
 * A coach owns lessons whose coach_id matches. A client owns lessons whose
 * client_id composite matches their profile, or whose client_phone matches
 * their normalized phone (covers older records saved before client_id existed).
 * Returns the existing lesson row, or null if access should be denied.
 */
async function loadOwnedLesson(
  lessonId: string,
  userId: string,
  userRole: AuthRole
): Promise<Record<string, unknown> | null> {
  // The admin token is read-only: it can list lessons but owns none, so
  // every write path denies it here.
  if (userRole === 'admin') return null;
  if (userRole === 'coach') {
    const row = await pool.query(
      'SELECT * FROM lessons WHERE id = $1 AND coach_id = $2',
      [lessonId, userId]
    );
    return row.rows[0] ?? null;
  }
  const clientRow = await pool.query(
    'SELECT name, phone FROM clients WHERE id = $1',
    [userId]
  );
  if (clientRow.rows.length === 0) return null;
  const { name, phone } = clientRow.rows[0];
  const compositeId = `${name}_${phone}`;
  const normalizedPhone = phone ? String(phone).replace(/[^0-9]/g, '') : '';
  const row = await pool.query(
    `SELECT * FROM lessons
     WHERE id = $1
       AND (
         client_id = $2
         OR REGEXP_REPLACE(COALESCE(client_phone, ''), '[^0-9]', '', 'g') = $3
       )`,
    [lessonId, compositeId, normalizedPhone]
  );
  return row.rows[0] ?? null;
}

// PUT /api/lessons/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const { id } = req.params;

    const existing = await loadOwnedLesson(id, userId, userRole);
    if (!existing) {
      res.status(404).json({ error: 'Lesson not found or access denied' });
      return;
    }

    const {
      clientId, clientName, clientPhone,
      createdBy, recordType,
      title, date, club, targetDistance, score, scorecardDetail,
      videoUrl, videoKey, mediaType, swingAngle,
      additionalMedia, thumbnailUrl,
      coachNotes, aiAnalysis, scorecard,
      tags, golfData, swingSequence, shareOption,
      clientFeedback, feedbackStatus,
      memberBodyAnalysis, assignedHomework,
      editedVideoUrl, videoEditMetadata,
      compareVideoUrl, compareVideoMetadata,
      media, lessonPackageId, sessionNumber,
      liveLessonDetail,
      visibility,
      approvalStatus, approvedAt, sharedToStudent, reviewSections,
      reviewSectionsDraft,
    } = req.body as Record<string, unknown>;

    // 레슨 동반 자료(필기·요약본)는 폼이 통째로 되보내지 않는 부분 업데이트
    // 경로에서 유실되지 않도록 기존 값을 보존한다.
    const nextLiveLessonDetail =
      liveLessonDetail ?? existing.live_lesson_detail ?? null;

    // Visibility (#309): the student can downgrade to 'self' (본인만); the
    // coach can raise to 'branch' (지점까지) via UI. Both roles may set
    // 'coach' (담당 코치까지, the default). Unknown values keep the existing
    // level rather than corrupting the row.
    const ALLOWED_VISIBILITY = new Set(['self', 'coach', 'branch']);
    const nextVisibility =
      typeof visibility === 'string' && ALLOWED_VISIBILITY.has(visibility)
        ? visibility
        : (existing.visibility as string | null) ?? 'coach';

    // Review workflow (8b): only coaches may change approval state.
    // Students who PUT their own lessons (e.g. self-added quick logs)
    // can't flip approvalStatus — the field silently ignores their input.
    const isCoach = userRole === 'coach';
    const ALLOWED_APPROVAL = new Set(['draft', 'approved']);
    const nextApprovalStatus = isCoach
      ? typeof approvalStatus === 'string' && ALLOWED_APPROVAL.has(approvalStatus)
        ? approvalStatus
        : (existing.approval_status as string | null) ?? null
      : (existing.approval_status as string | null) ?? null;
    const nextApprovedAt = isCoach
      ? typeof approvedAt === 'number'
        ? approvedAt
        : nextApprovalStatus === 'approved'
          ? (existing.approved_at as number | null) ?? Date.now()
          : null
      : (existing.approved_at as number | null) ?? null;
    const nextSharedToStudent = isCoach
      ? typeof sharedToStudent === 'boolean'
        ? sharedToStudent
        : (existing.shared_to_student as boolean | null)
      : (existing.shared_to_student as boolean | null);
    const nextReviewSections = isCoach
      ? reviewSections ?? existing.review_sections ?? null
      : existing.review_sections ?? null;

    // AI 초안 보존 (docs/DATA_ARCHITECTURE.md §6.1 — 가치 1위 데이터).
    //
    // review_sections 한 칸만 두면 코치의 수정본이 AI 원안을 덮어써서
    // "초안 vs 최종본" 학습쌍이 매 레슨 사라진다. 초안은 **write-once**:
    // 한 번 적힌 뒤로는 어떤 PUT 도 이 칸을 건드리지 못한다.
    //
    // 클라이언트가 드래프터 출력을 명시적으로 보내주면 그것이 정확한
    // 원안('agent')이다. 아직 보내지 않는 경로를 위해, 초안이 비어 있는
    // 레슨에 처음 들어온 review_sections 를 초안으로 갈무리하되
    // 출처를 'first_save' 로 구분해 둔다 — 이쪽은 레거시 필드에서
    // 파생됐을 수 있어 추출 단계에서 따로 걸러야 한다.
    const existingDraft = existing.review_sections_draft ?? null;
    let nextDraft = existingDraft;
    let nextDraftSource = (existing.review_draft_source as string | null) ?? null;
    let nextDraftAt = (existing.review_draft_at as number | null) ?? null;
    if (isCoach && !existingDraft) {
      if (reviewSectionsDraft) {
        nextDraft = reviewSectionsDraft;
        nextDraftSource = 'agent';
        nextDraftAt = Date.now();
      } else if (!existing.review_sections && reviewSections) {
        nextDraft = reviewSections;
        nextDraftSource = 'first_save';
        nextDraftAt = Date.now();
      }
    }

    // Preserve immutable ownership fields — clients cannot reassign a lesson
    // to another student or change its coach linkage via PUT.
    const preservedClientId =
      userRole === 'client'
        ? (existing.client_id as string | null)
        : (typeof clientId === 'string' ? clientId : null) ??
          (existing.client_id as string | null);
    const preservedClientName =
      userRole === 'client'
        ? (existing.client_name as string | null)
        : (typeof clientName === 'string' ? clientName : null) ??
          (existing.client_name as string | null);
    const preservedClientPhone =
      userRole === 'client'
        ? (existing.client_phone as string | null)
        : (typeof clientPhone === 'string' ? clientPhone : null) ??
          (existing.client_phone as string | null);

    const now = Date.now();

    const result = await pool.query(
      `UPDATE lessons SET
        client_id = $1, client_name = $2, client_phone = $3,
        created_by = $4, record_type = $5,
        title = $6, date = $7, club = $8, target_distance = $9,
        score = $10, scorecard_detail = $11,
        video_url = $12, video_key = $13, media_type = $14, swing_angle = $15,
        additional_media = $16, thumbnail_url = $17,
        coach_notes = $18, ai_analysis = $19, scorecard = $20,
        tags = $21, golf_data = $22, swing_sequence = $23, share_option = $24,
        client_feedback = $25, feedback_status = $26,
        member_body_analysis = $27, assigned_homework = $28,
        edited_video_url = $29, video_edit_metadata = $30,
        compare_video_url = $31, compare_video_metadata = $32,
        media = $33, lesson_package_id = $34, session_number = $35,
        visibility = $36,
        approval_status = $39,
        approved_at = $40,
        shared_to_student = $41,
        review_sections = $42,
        live_lesson_detail = $43,
        review_sections_draft = $44,
        review_draft_source = $45,
        review_draft_at = $46,
        updated_at = $37
      WHERE id = $38
      RETURNING *`,
      [
        preservedClientId, preservedClientName, preservedClientPhone,
        createdBy ?? existing.created_by ?? null, recordType ?? null,
        title ?? null, date ?? null, club ?? null,
        targetDistance ?? null, score ?? null,
        scorecardDetail ? JSON.stringify(scorecardDetail) : null,
        videoUrl ?? null, videoKey ?? null, mediaType ?? null, swingAngle ?? null,
        additionalMedia ? JSON.stringify(additionalMedia) : null, thumbnailUrl ?? null,
        coachNotes ?? null,
        aiAnalysis ? JSON.stringify(aiAnalysis) : null,
        scorecard ? JSON.stringify(scorecard) : null,
        tags ? JSON.stringify(tags) : null,
        golfData ? JSON.stringify(golfData) : null,
        swingSequence ? JSON.stringify(swingSequence) : null,
        shareOption ?? null,
        clientFeedback ? JSON.stringify(clientFeedback) : null,
        feedbackStatus ?? null,
        memberBodyAnalysis ? JSON.stringify(memberBodyAnalysis) : null,
        assignedHomework ? JSON.stringify(assignedHomework) : null,
        editedVideoUrl ?? null,
        videoEditMetadata ? JSON.stringify(videoEditMetadata) : null,
        compareVideoUrl ?? null,
        compareVideoMetadata ? JSON.stringify(compareVideoMetadata) : null,
        media ? JSON.stringify(media) : null,
        lessonPackageId ?? null, sessionNumber ?? null,
        nextVisibility,
        now, id,
        nextApprovalStatus,
        nextApprovedAt,
        nextSharedToStudent,
        nextReviewSections ? JSON.stringify(nextReviewSections) : null,
        nextLiveLessonDetail ? JSON.stringify(nextLiveLessonDetail) : null,
        nextDraft ? JSON.stringify(nextDraft) : null,
        nextDraftSource,
        nextDraftAt,
      ]
    );

    const updated = result.rows[0];
    // Approval is the milestone the review workflow (8b) cares about — surface
    // it as its own event type when this PUT crossed the draft→approved line.
    const wasApproved =
      (existing.approval_status as string | null) !== 'approved' &&
      updated.approval_status === 'approved';

    // 승인 순간이 라벨이 확정되는 지점이다(§6.2 — 행동 자체를 라벨로).
    // AI 원안과 코치가 실제로 내보낸 최종본이 다르면, 그 두 문서가 그대로
    // 선호 학습쌍(rejected/chosen)이 된다. 클라이언트가 따로 보고하지
    // 않아도 서버가 상태 전이에서 알아채므로 구버전 앱에서도 새지 않는다.
    if (wasApproved) {
      const draftText = reviewSectionsToText(updated.review_sections_draft);
      const finalText = reviewSectionsToText(updated.review_sections);
      if (draftText && finalText && draftText !== finalText) {
        recordAiFeedbackSafe({
          userId,
          userRole,
          kind: 'edited',
          target: 'lesson_summary',
          entityType: 'lesson',
          entityId: id,
          originalOutput: draftText,
          finalOutput: finalText,
          // 코치가 AI 초안을 고쳐서 승인 = tier 2(암묵적 수용) 신호.
          tier: 2,
          note: `draft_source=${(updated.review_draft_source as string | null) ?? 'unknown'}`,
        });
      }
    }
    recordEventSafe({
      actorId: userId,
      actorRole: userRole,
      eventType: wasApproved ? 'lesson.approved' : 'lesson.updated',
      entityType: 'lesson',
      entityId: id,
      studentUuid: userRole === 'client' ? userId : null,
      payload: {
        clientCompositeId: (updated.client_id as string | null) ?? null,
        coachId: (updated.coach_id as string | null) ?? null,
        sharedToStudent: (updated.shared_to_student as boolean | null) ?? null,
      },
    });

    res.json({ lesson: mapLesson(updated, userRole) });
  } catch (err) {
    console.error('[lessons] PUT /:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/lessons/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const { id } = req.params;

    const existing = await loadOwnedLesson(id, userId, userRole);
    if (!existing) {
      res.status(404).json({ error: 'Lesson not found or access denied' });
      return;
    }

    await pool.query('DELETE FROM lessons WHERE id = $1', [id]);

    // The row is gone, so nothing can reference this lesson's media any more.
    // Drop the R2 objects too rather than leaving the video to sit in the
    // bucket forever. Deleted after the row, never before: a failed DB delete
    // must not destroy the media of a lesson that is still live.
    //
    // Storage cleanup failing must not turn a delete the caller already
    // completed into a 500, so it logs and moves on — the leftovers are the
    // same orphans this route used to leave behind every time.
    if (UUID_PATTERN.test(id)) {
      try {
        const removed = await deleteObjectsByPrefix(`lessons/${id}/`);
        console.log(`[lessons] Deleted ${removed} R2 object(s) for lesson ${id}`);
      } catch (err) {
        console.error(`[lessons] R2 cleanup failed for lesson ${id}:`, err);
      }
    }

    recordEventSafe({
      actorId: userId,
      actorRole: userRole,
      eventType: 'lesson.deleted',
      entityType: 'lesson',
      entityId: id,
      studentUuid: userRole === 'client' ? userId : null,
      payload: {
        clientCompositeId: (existing.client_id as string | null) ?? null,
        coachId: (existing.coach_id as string | null) ?? null,
      },
    });
    res.json({ deleted: true, id });
  } catch (err) {
    console.error('[lessons] DELETE /:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
