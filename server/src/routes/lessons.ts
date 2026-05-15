import { Router, Request, Response } from 'express';
import pool from '../services/db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

function mapLesson(row: Record<string, unknown>) {
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name,
    clientPhone: row.client_phone,
    coachId: row.coach_id,
    title: row.title,
    date: row.date,
    videoUrl: row.video_url,
    videoKey: row.video_key,
    coachNotes: row.coach_notes,
    aiAnalysis: row.ai_analysis,
    scorecard: row.scorecard,
    memberBodyAnalysis: row.member_body_analysis,
    assignedHomework: row.assigned_homework,
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
    res.json(result.rows.map(mapLesson));
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
      clientId,
      clientName,
      clientPhone,
      title,
      date,
      videoUrl,
      videoKey,
      coachNotes,
      aiAnalysis,
      scorecard,
      memberBodyAnalysis,
      assignedHomework,
      media,
      lessonPackageId,
      sessionNumber,
    } = req.body as Record<string, unknown>;

    const now = Date.now();

    const result = await pool.query(
      `INSERT INTO lessons (
        client_id, client_name, client_phone, coach_id, title, date,
        video_url, video_key, coach_notes, ai_analysis, scorecard,
        member_body_analysis, assigned_homework, media,
        lesson_package_id, session_number, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14,
        $15, $16, $17, $18
      ) RETURNING *`,
      [
        clientId ?? null,
        clientName ?? null,
        clientPhone ?? null,
        coachId,
        title ?? null,
        date ?? null,
        videoUrl ?? null,
        videoKey ?? null,
        coachNotes ?? null,
        aiAnalysis ? JSON.stringify(aiAnalysis) : null,
        scorecard ? JSON.stringify(scorecard) : null,
        memberBodyAnalysis ? JSON.stringify(memberBodyAnalysis) : null,
        assignedHomework ? JSON.stringify(assignedHomework) : null,
        media ? JSON.stringify(media) : null,
        lessonPackageId ?? null,
        sessionNumber ?? null,
        now,
        now,
      ]
    );

    res.status(201).json(mapLesson(result.rows[0]));
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
      clientId,
      clientName,
      clientPhone,
      title,
      date,
      videoUrl,
      videoKey,
      coachNotes,
      aiAnalysis,
      scorecard,
      memberBodyAnalysis,
      assignedHomework,
      media,
      lessonPackageId,
      sessionNumber,
    } = req.body as Record<string, unknown>;

    const now = Date.now();

    const result = await pool.query(
      `UPDATE lessons SET
        client_id = $1, client_name = $2, client_phone = $3,
        title = $4, date = $5, video_url = $6, video_key = $7,
        coach_notes = $8, ai_analysis = $9, scorecard = $10,
        member_body_analysis = $11, assigned_homework = $12, media = $13,
        lesson_package_id = $14, session_number = $15, updated_at = $16
      WHERE id = $17 AND coach_id = $18
      RETURNING *`,
      [
        clientId ?? null,
        clientName ?? null,
        clientPhone ?? null,
        title ?? null,
        date ?? null,
        videoUrl ?? null,
        videoKey ?? null,
        coachNotes ?? null,
        aiAnalysis ? JSON.stringify(aiAnalysis) : null,
        scorecard ? JSON.stringify(scorecard) : null,
        memberBodyAnalysis ? JSON.stringify(memberBodyAnalysis) : null,
        assignedHomework ? JSON.stringify(assignedHomework) : null,
        media ? JSON.stringify(media) : null,
        lessonPackageId ?? null,
        sessionNumber ?? null,
        now,
        id,
        coachId,
      ]
    );

    res.json(mapLesson(result.rows[0]));
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
