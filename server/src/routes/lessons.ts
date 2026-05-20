import { Router, Request, Response } from 'express';
import pool from '../services/db';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// All routes require authentication
router.use(authMiddleware);

function mapLesson(row: Record<string, unknown>) {
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
    score: row.score,
    scorecardDetail: row.scorecard_detail,
    videoUrl: row.video_url,
    videoKey: row.video_key,
    mediaType: row.media_type,
    swingAngle: row.swing_angle,
    additionalMedia: row.additional_media,
    thumbnailUrl: row.thumbnail_url,
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
    editedVideoUrl: row.edited_video_url,
    videoEditMetadata: row.video_edit_metadata,
    compareVideoUrl: row.compare_video_url,
    compareVideoMetadata: row.compare_video_metadata,
    media: row.media,
    lessonPackageId: row.lesson_package_id,
    sessionNumber: row.session_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/lessons
router.get('/', async (req: Request, res: Response) => {
  try {
    const coachId = req.user!.id;
    const result = await pool.query(
      'SELECT * FROM lessons WHERE coach_id = $1 ORDER BY created_at DESC',
      [coachId]
    );
    res.json({ lessons: result.rows.map(mapLesson) });
  } catch (err) {
    console.error('[lessons] GET / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/lessons
router.post('/', async (req: Request, res: Response) => {
  try {
    const coachId = req.user!.id;
    const {
      id,
      clientId, clientName, clientPhone,
      createdBy, recordType,
      title, date, club, score, scorecardDetail,
      videoUrl, videoKey, mediaType, swingAngle,
      additionalMedia, thumbnailUrl,
      coachNotes, aiAnalysis, scorecard,
      tags, golfData, swingSequence, shareOption,
      clientFeedback, feedbackStatus,
      memberBodyAnalysis, assignedHomework,
      editedVideoUrl, videoEditMetadata,
      compareVideoUrl, compareVideoMetadata,
      media, lessonPackageId, sessionNumber,
    } = req.body as Record<string, unknown>;
    const lessonId =
      typeof id === 'string' && id.trim().length > 0 ? id.trim() : null;
    if (lessonId && !UUID_PATTERN.test(lessonId)) {
      res.status(400).json({ error: 'Invalid lesson id: must be a valid UUID format' });
      return;
    }

    const now = Date.now();

    const result = await pool.query(
      `INSERT INTO lessons (
        id,
        client_id, client_name, client_phone, coach_id,
        created_by, record_type,
        title, date, club, score, scorecard_detail,
        video_url, video_key, media_type, swing_angle,
        additional_media, thumbnail_url,
        coach_notes, ai_analysis, scorecard,
        tags, golf_data, swing_sequence, share_option,
        client_feedback, feedback_status,
        member_body_analysis, assigned_homework,
        edited_video_url, video_edit_metadata,
        compare_video_url, compare_video_metadata,
        media, lesson_package_id, session_number,
        created_at, updated_at
      ) VALUES (
        COALESCE($1::uuid, gen_random_uuid()),
        $2, $3, $4, $5,
        $6, $7,
        $8, $9, $10, $11, $12,
        $13, $14, $15, $16,
        $17, $18,
        $19, $20, $21,
        $22, $23, $24, $25,
        $26, $27,
        $28, $29,
        $30, $31,
        $32, $33,
        $34, $35, $36,
        $37, $38
      ) RETURNING *`,
      [
        lessonId,
        clientId ?? null, clientName ?? null, clientPhone ?? null, coachId,
        createdBy ?? null, recordType ?? null,
        title ?? null, date ?? null, club ?? null, score ?? null,
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
        now, now,
      ]
    );

    res.status(201).json({ lesson: mapLesson(result.rows[0]) });
  } catch (err) {
    console.error('[lessons] POST / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/lessons/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const coachId = req.user!.id;
    const { id } = req.params;

    const existing = await pool.query(
      'SELECT id FROM lessons WHERE id = $1 AND coach_id = $2',
      [id, coachId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Lesson not found or access denied' });
      return;
    }

    const {
      clientId, clientName, clientPhone,
      createdBy, recordType,
      title, date, club, score, scorecardDetail,
      videoUrl, videoKey, mediaType, swingAngle,
      additionalMedia, thumbnailUrl,
      coachNotes, aiAnalysis, scorecard,
      tags, golfData, swingSequence, shareOption,
      clientFeedback, feedbackStatus,
      memberBodyAnalysis, assignedHomework,
      editedVideoUrl, videoEditMetadata,
      compareVideoUrl, compareVideoMetadata,
      media, lessonPackageId, sessionNumber,
    } = req.body as Record<string, unknown>;

    const now = Date.now();

    const result = await pool.query(
      `UPDATE lessons SET
        client_id = $1, client_name = $2, client_phone = $3,
        created_by = $4, record_type = $5,
        title = $6, date = $7, club = $8, score = $9, scorecard_detail = $10,
        video_url = $11, video_key = $12, media_type = $13, swing_angle = $14,
        additional_media = $15, thumbnail_url = $16,
        coach_notes = $17, ai_analysis = $18, scorecard = $19,
        tags = $20, golf_data = $21, swing_sequence = $22, share_option = $23,
        client_feedback = $24, feedback_status = $25,
        member_body_analysis = $26, assigned_homework = $27,
        edited_video_url = $28, video_edit_metadata = $29,
        compare_video_url = $30, compare_video_metadata = $31,
        media = $32, lesson_package_id = $33, session_number = $34,
        updated_at = $35
      WHERE id = $36 AND coach_id = $37
      RETURNING *`,
      [
        clientId ?? null, clientName ?? null, clientPhone ?? null,
        createdBy ?? null, recordType ?? null,
        title ?? null, date ?? null, club ?? null, score ?? null,
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
        now, id, coachId,
      ]
    );

    res.json({ lesson: mapLesson(result.rows[0]) });
  } catch (err) {
    console.error('[lessons] PUT /:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/lessons/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const coachId = req.user!.id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM lessons WHERE id = $1 AND coach_id = $2 RETURNING id',
      [id, coachId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Lesson not found or access denied' });
      return;
    }

    res.json({ deleted: true, id });
  } catch (err) {
    console.error('[lessons] DELETE /:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
