import { Router, Request, Response } from 'express';
import pool from '../services/db';
import { authMiddleware, AuthRole } from '../middleware/auth';
import { signMediaUrl, reSignIfMedia } from '../services/mediaAccess';
import { recordEventSafe } from '../services/events';

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
      // Coach: fetch every lesson the coach has ever owned — current
      // assignment (coach_id), original creator (original_coach_id), or
      // a previous owner from the handover chain (previous_coach_ids).
      //
      // 3-tier ownership (#309): the coach handover flow reassigns
      // coach_id to the new coach. Filtering on coach_id alone would
      // wipe the outgoing coach's teaching history from their own view
      // the moment a handover completes. Including the ownership chain
      // preserves that history as read-only — PUT/DELETE still require
      // the current coach_id via loadOwnedLesson.
      //
      // COALESCE guards against NULL previous_coach_ids (legacy rows
      // pre-#309) since $1 = ANY(NULL) is NULL, which fails a WHERE OR.
      result = await pool.query(
        `SELECT * FROM lessons
           WHERE coach_id = $1
              OR original_coach_id = $1
              OR $1 = ANY(COALESCE(previous_coach_ids, ARRAY[]::uuid[]))
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
        'shared', $38, $5,
        $39, $40
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
      visibility,
      approvalStatus, approvedAt, sharedToStudent, reviewSections,
    } = req.body as Record<string, unknown>;

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
      ]
    );

    const updated = result.rows[0];
    // Approval is the milestone the review workflow (8b) cares about — surface
    // it as its own event type when this PUT crossed the draft→approved line.
    const wasApproved =
      (existing.approval_status as string | null) !== 'approved' &&
      updated.approval_status === 'approved';
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
