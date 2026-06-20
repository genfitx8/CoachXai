import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../services/db';
import { authMiddleware } from '../middleware/auth';
import { buildJbGolfAcademyTextbook } from '../seeds/jbGolfAcademy';

const router = Router();
router.use(authMiddleware);

function mapTextbook(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    coverImage: row.cover_image,
    targetLevel: row.target_level,
    isOfficial: row.is_official,
    coachId: row.coach_id,
    chaptersCount: row.chapters_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChapter(row: Record<string, unknown>) {
  return {
    id: row.id,
    textbookId: row.textbook_id,
    partNumber: row.part_number,
    chapterNumber: row.chapter_number,
    partTitle: row.part_title,
    title: row.title,
    content: row.content,
    keyPoints: row.key_points ?? [],
    quiz: row.quiz ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Seed official JB Golf Academy textbook ────────────────────────────────

router.post('/seed-official', async (req: Request, res: Response) => {
  try {
    const { textbook, chapters } = buildJbGolfAcademyTextbook();

    await pool.query(
      `INSERT INTO textbooks (id, title, description, cover_image, target_level, is_official, coach_id, chapters_count, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET
         title=EXCLUDED.title, description=EXCLUDED.description,
         target_level=EXCLUDED.target_level, is_official=EXCLUDED.is_official,
         chapters_count=EXCLUDED.chapters_count, updated_at=EXCLUDED.updated_at`,
      [
        textbook.id, textbook.title, textbook.description, null,
        textbook.targetLevel, textbook.isOfficial, null,
        textbook.chaptersCount, textbook.createdAt, textbook.updatedAt,
      ]
    );

    for (const ch of chapters) {
      await pool.query(
        `INSERT INTO textbook_chapters (id, textbook_id, part_number, chapter_number, part_title, title, content, key_points, quiz, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET
           title=EXCLUDED.title, content=EXCLUDED.content,
           key_points=EXCLUDED.key_points, quiz=EXCLUDED.quiz,
           updated_at=EXCLUDED.updated_at`,
        [
          ch.id, ch.textbookId, ch.partNumber, ch.chapterNumber,
          ch.partTitle, ch.title, ch.content,
          JSON.stringify(ch.keyPoints), JSON.stringify(ch.quiz),
          ch.createdAt, ch.updatedAt,
        ]
      );
    }

    res.json({ ok: true, chaptersSeeded: chapters.length });
  } catch (err) {
    console.error('[textbooks] seed-official error:', err);
    res.status(500).json({ error: 'Seed failed' });
  }
});

// ── Textbook CRUD ─────────────────────────────────────────────────────────

// GET /api/textbooks — list (coach: own + official; student: assigned)
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;

    let rows;
    if (role === 'coach') {
      const result = await pool.query(
        `SELECT * FROM textbooks WHERE is_official = true OR coach_id = $1 ORDER BY is_official DESC, created_at DESC`,
        [userId]
      );
      rows = result.rows;
    } else {
      const result = await pool.query(
        `SELECT t.* FROM textbooks t
         JOIN student_textbooks st ON st.textbook_id = t.id
         WHERE st.student_id = $1
         ORDER BY st.assigned_at DESC`,
        [userId]
      );
      rows = result.rows;
    }

    res.json(rows.map(mapTextbook));
  } catch (err) {
    console.error('[textbooks] list error:', err);
    res.status(500).json({ error: 'Failed to list textbooks' });
  }
});

// GET /api/textbooks/:id — get with chapters
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tbResult = await pool.query('SELECT * FROM textbooks WHERE id = $1', [id]);
    if (tbResult.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }

    const chapResult = await pool.query(
      'SELECT * FROM textbook_chapters WHERE textbook_id = $1 ORDER BY chapter_number ASC',
      [id]
    );

    const textbook = mapTextbook(tbResult.rows[0]);
    (textbook as Record<string, unknown>).chapters = chapResult.rows.map(mapChapter);

    res.json(textbook);
  } catch (err) {
    console.error('[textbooks] get error:', err);
    res.status(500).json({ error: 'Failed to get textbook' });
  }
});

// POST /api/textbooks — create (coach only)
router.post('/', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'coach') { res.status(403).json({ error: 'Coach only' }); return; }
    const { title, description, targetLevel } = req.body;
    const now = Date.now();
    const id = uuidv4();

    const result = await pool.query(
      `INSERT INTO textbooks (id, title, description, target_level, is_official, coach_id, chapters_count, created_at, updated_at)
       VALUES ($1,$2,$3,$4,false,$5,0,$6,$7) RETURNING *`,
      [id, title, description ?? null, targetLevel ?? 'beginner', req.user!.id, now, now]
    );
    res.status(201).json(mapTextbook(result.rows[0]));
  } catch (err) {
    console.error('[textbooks] create error:', err);
    res.status(500).json({ error: 'Failed to create textbook' });
  }
});

// PUT /api/textbooks/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'coach') { res.status(403).json({ error: 'Coach only' }); return; }
    const { id } = req.params;
    const { title, description, targetLevel } = req.body;
    const now = Date.now();

    const result = await pool.query(
      `UPDATE textbooks SET title=$1, description=$2, target_level=$3, updated_at=$4
       WHERE id=$5 AND (coach_id=$6 OR is_official=true) RETURNING *`,
      [title, description ?? null, targetLevel ?? 'beginner', now, id, req.user!.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(mapTextbook(result.rows[0]));
  } catch (err) {
    console.error('[textbooks] update error:', err);
    res.status(500).json({ error: 'Failed to update textbook' });
  }
});

// DELETE /api/textbooks/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'coach') { res.status(403).json({ error: 'Coach only' }); return; }
    const { id } = req.params;
    await pool.query(`DELETE FROM textbooks WHERE id=$1 AND coach_id=$2`, [id, req.user!.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[textbooks] delete error:', err);
    res.status(500).json({ error: 'Failed to delete textbook' });
  }
});

// ── Chapter CRUD ──────────────────────────────────────────────────────────

// POST /api/textbooks/:textbookId/chapters
router.post('/:textbookId/chapters', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'coach') { res.status(403).json({ error: 'Coach only' }); return; }
    const { textbookId } = req.params;
    const { partNumber, chapterNumber, partTitle, title, content, keyPoints, quiz } = req.body;
    const now = Date.now();
    const id = uuidv4();

    const result = await pool.query(
      `INSERT INTO textbook_chapters (id, textbook_id, part_number, chapter_number, part_title, title, content, key_points, quiz, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        id, textbookId, partNumber ?? 1, chapterNumber ?? 1, partTitle ?? null,
        title, content ?? null, JSON.stringify(keyPoints ?? []),
        quiz ? JSON.stringify(quiz) : null, now, now,
      ]
    );

    await pool.query(
      `UPDATE textbooks SET chapters_count = (SELECT COUNT(*) FROM textbook_chapters WHERE textbook_id=$1), updated_at=$2 WHERE id=$1`,
      [textbookId, now]
    );

    res.status(201).json(mapChapter(result.rows[0]));
  } catch (err) {
    console.error('[textbooks] create chapter error:', err);
    res.status(500).json({ error: 'Failed to create chapter' });
  }
});

// PUT /api/textbooks/:textbookId/chapters/:chapterId
router.put('/:textbookId/chapters/:chapterId', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'coach') { res.status(403).json({ error: 'Coach only' }); return; }
    const { chapterId } = req.params;
    const { partNumber, chapterNumber, partTitle, title, content, keyPoints, quiz } = req.body;
    const now = Date.now();

    const result = await pool.query(
      `UPDATE textbook_chapters SET part_number=$1, chapter_number=$2, part_title=$3, title=$4,
       content=$5, key_points=$6, quiz=$7, updated_at=$8
       WHERE id=$9 RETURNING *`,
      [
        partNumber ?? 1, chapterNumber ?? 1, partTitle ?? null, title,
        content ?? null, JSON.stringify(keyPoints ?? []),
        quiz ? JSON.stringify(quiz) : null, now, chapterId,
      ]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(mapChapter(result.rows[0]));
  } catch (err) {
    console.error('[textbooks] update chapter error:', err);
    res.status(500).json({ error: 'Failed to update chapter' });
  }
});

// DELETE /api/textbooks/:textbookId/chapters/:chapterId
router.delete('/:textbookId/chapters/:chapterId', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'coach') { res.status(403).json({ error: 'Coach only' }); return; }
    const { textbookId, chapterId } = req.params;
    await pool.query(`DELETE FROM textbook_chapters WHERE id=$1`, [chapterId]);
    const now = Date.now();
    await pool.query(
      `UPDATE textbooks SET chapters_count=(SELECT COUNT(*) FROM textbook_chapters WHERE textbook_id=$1), updated_at=$2 WHERE id=$1`,
      [textbookId, now]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[textbooks] delete chapter error:', err);
    res.status(500).json({ error: 'Failed to delete chapter' });
  }
});

// ── Student assignment & progress ─────────────────────────────────────────

// POST /api/textbooks/:textbookId/assign
router.post('/:textbookId/assign', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'coach') { res.status(403).json({ error: 'Coach only' }); return; }
    const { textbookId } = req.params;
    const { studentIds } = req.body as { studentIds: string[] };
    const now = Date.now();

    for (const studentId of studentIds) {
      await pool.query(
        `INSERT INTO student_textbooks (id, student_id, textbook_id, coach_id, assigned_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (student_id, textbook_id) DO NOTHING`,
        [uuidv4(), studentId, textbookId, req.user!.id, now, now]
      );
      await pool.query(
        `INSERT INTO student_chapter_progress (id, student_id, textbook_id, chapter_progress, overall_progress, assigned_at, updated_at)
         VALUES ($1,$2,$3,'{}',0,$4,$5) ON CONFLICT (student_id, textbook_id) DO NOTHING`,
        [uuidv4(), studentId, textbookId, now, now]
      );
    }

    res.json({ ok: true, assigned: studentIds.length });
  } catch (err) {
    console.error('[textbooks] assign error:', err);
    res.status(500).json({ error: 'Failed to assign' });
  }
});

// GET /api/textbooks/:textbookId/progress — coach: all students; student: self
router.get('/:textbookId/progress', async (req: Request, res: Response) => {
  try {
    const { textbookId } = req.params;
    const userId = req.user!.id;
    const role = req.user!.role;

    let result;
    if (role === 'coach') {
      result = await pool.query(
        `SELECT * FROM student_chapter_progress WHERE textbook_id=$1`,
        [textbookId]
      );
    } else {
      result = await pool.query(
        `SELECT * FROM student_chapter_progress WHERE textbook_id=$1 AND student_id=$2`,
        [textbookId, userId]
      );
    }

    res.json(result.rows.map((r) => ({
      id: r.id,
      studentId: r.student_id,
      textbookId: r.textbook_id,
      chapterProgress: r.chapter_progress ?? {},
      overallProgress: r.overall_progress ?? 0,
      completedAt: r.completed_at,
      assignedAt: r.assigned_at,
      updatedAt: r.updated_at,
    })));
  } catch (err) {
    console.error('[textbooks] progress error:', err);
    res.status(500).json({ error: 'Failed to get progress' });
  }
});

// ── Quiz attempts ─────────────────────────────────────────────────────────

// POST /api/textbooks/attempts — submit quiz
router.post('/attempts', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { chapterId, textbookId, answers, score, passed } = req.body as {
      chapterId: string;
      textbookId: string;
      answers: unknown[];
      score: number;
      passed: boolean;
    };
    const now = Date.now();

    const prevResult = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM quiz_attempts WHERE student_id=$1 AND chapter_id=$2`,
      [userId, chapterId]
    );
    const attemptNumber = (prevResult.rows[0].cnt as number) + 1;

    const result = await pool.query(
      `INSERT INTO quiz_attempts (id, student_id, chapter_id, textbook_id, attempt_number, score, passed, answers, taken_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [uuidv4(), userId, chapterId, textbookId, attemptNumber, score, passed, JSON.stringify(answers), now]
    );

    // Update chapter progress
    const progressResult = await pool.query(
      `SELECT chapter_progress FROM student_chapter_progress WHERE student_id=$1 AND textbook_id=$2`,
      [userId, textbookId]
    );

    if (progressResult.rows.length > 0) {
      const existing = progressResult.rows[0].chapter_progress as Record<string, {
        status: string; bestScore: number; attempts: number; lastAttemptAt: number; completedAt?: number; lessonRecordIds: string[];
      }> ?? {};
      const prev = existing[chapterId] ?? { status: 'not_started', bestScore: 0, attempts: 0, lessonRecordIds: [] };
      const newBest = Math.max(prev.bestScore, score);
      const newStatus = passed ? 'passed' : (prev.status === 'passed' ? 'passed' : 'in_progress');
      existing[chapterId] = {
        ...prev,
        status: newStatus,
        bestScore: newBest,
        attempts: attemptNumber,
        lastAttemptAt: now,
        completedAt: passed && !prev.completedAt ? now : prev.completedAt,
      };

      const totalChapters = await pool.query(
        `SELECT chapters_count FROM textbooks WHERE id=$1`,
        [textbookId]
      );
      const total = totalChapters.rows[0]?.chapters_count ?? 1;
      const passedCount = Object.values(existing).filter((p) => p.status === 'passed').length;
      const overallProgress = Math.round((passedCount / total) * 100);
      const completedAt = overallProgress === 100 ? now : null;

      await pool.query(
        `UPDATE student_chapter_progress SET chapter_progress=$1, overall_progress=$2, completed_at=$3, updated_at=$4
         WHERE student_id=$5 AND textbook_id=$6`,
        [JSON.stringify(existing), overallProgress, completedAt, now, userId, textbookId]
      );
    }

    res.status(201).json({
      id: result.rows[0].id,
      attemptNumber,
      score,
      passed,
      takenAt: now,
    });
  } catch (err) {
    console.error('[textbooks] submit attempt error:', err);
    res.status(500).json({ error: 'Failed to submit attempt' });
  }
});

// GET /api/textbooks/attempts?chapterId=...
router.get('/attempts', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { chapterId } = req.query as { chapterId?: string };

    const result = await pool.query(
      `SELECT * FROM quiz_attempts WHERE student_id=$1 ${chapterId ? 'AND chapter_id=$2' : ''} ORDER BY taken_at DESC`,
      chapterId ? [userId, chapterId] : [userId]
    );

    res.json(result.rows.map((r) => ({
      id: r.id,
      studentId: r.student_id,
      chapterId: r.chapter_id,
      textbookId: r.textbook_id,
      attemptNumber: r.attempt_number,
      score: r.score,
      passed: r.passed,
      answers: r.answers ?? [],
      takenAt: r.taken_at,
    })));
  } catch (err) {
    console.error('[textbooks] get attempts error:', err);
    res.status(500).json({ error: 'Failed to get attempts' });
  }
});

// ── Chapter Lesson Records ─────────────────────────────────────────────────

// GET /api/textbooks/lesson-records?chapterId=...&studentId=...
router.get('/lesson-records', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const { chapterId, studentId } = req.query as { chapterId?: string; studentId?: string };

    let query = `SELECT * FROM chapter_lesson_records WHERE 1=1`;
    const params: unknown[] = [];

    if (role === 'coach') {
      params.push(userId);
      query += ` AND coach_id=$${params.length}`;
    } else {
      params.push(userId);
      query += ` AND student_id=$${params.length}`;
    }

    if (chapterId) { params.push(chapterId); query += ` AND chapter_id=$${params.length}`; }
    if (studentId && role === 'coach') { params.push(studentId); query += ` AND student_id=$${params.length}`; }

    query += ' ORDER BY lesson_date DESC, created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows.map((r) => ({
      id: r.id,
      chapterId: r.chapter_id,
      textbookId: r.textbook_id,
      studentId: r.student_id,
      studentName: r.student_name,
      coachId: r.coach_id,
      lessonDate: r.lesson_date,
      textMemo: r.text_memo,
      mediaFiles: r.media_files ?? [],
      checklist: r.checklist ?? [],
      linkedLessonId: r.linked_lesson_id,
      coachFeedback: r.coach_feedback,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })));
  } catch (err) {
    console.error('[textbooks] get lesson-records error:', err);
    res.status(500).json({ error: 'Failed to get records' });
  }
});

// POST /api/textbooks/lesson-records
router.post('/lesson-records', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'coach') { res.status(403).json({ error: 'Coach only' }); return; }
    const {
      chapterId, textbookId, studentId, studentName,
      lessonDate, textMemo, mediaFiles, checklist,
      linkedLessonId, coachFeedback,
    } = req.body;
    const now = Date.now();
    const id = uuidv4();

    const result = await pool.query(
      `INSERT INTO chapter_lesson_records
       (id, chapter_id, textbook_id, student_id, student_name, coach_id, lesson_date, text_memo, media_files, checklist, linked_lesson_id, coach_feedback, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        id, chapterId, textbookId, studentId, studentName ?? null,
        req.user!.id, lessonDate ?? null, textMemo ?? null,
        JSON.stringify(mediaFiles ?? []), JSON.stringify(checklist ?? []),
        linkedLessonId ?? null, coachFeedback ?? null, now, now,
      ]
    );

    // Link record id to student chapter progress
    if (studentId && textbookId && chapterId) {
      const progressResult = await pool.query(
        `SELECT chapter_progress FROM student_chapter_progress WHERE student_id=$1 AND textbook_id=$2`,
        [studentId, textbookId]
      );
      if (progressResult.rows.length > 0) {
        const existing = progressResult.rows[0].chapter_progress as Record<string, {
          status: string; bestScore: number; attempts: number; lessonRecordIds: string[];
        }> ?? {};
        const prev = existing[chapterId] ?? { status: 'not_started', bestScore: 0, attempts: 0, lessonRecordIds: [] };
        existing[chapterId] = {
          ...prev,
          status: prev.status === 'not_started' ? 'in_progress' : prev.status,
          lessonRecordIds: [...(prev.lessonRecordIds ?? []), id],
        };
        await pool.query(
          `UPDATE student_chapter_progress SET chapter_progress=$1, updated_at=$2 WHERE student_id=$3 AND textbook_id=$4`,
          [JSON.stringify(existing), now, studentId, textbookId]
        );
      }
    }

    res.status(201).json({ id, ...req.body, coachId: req.user!.id, createdAt: now, updatedAt: now });
  } catch (err) {
    console.error('[textbooks] create lesson-record error:', err);
    res.status(500).json({ error: 'Failed to create record' });
  }
});

// PUT /api/textbooks/lesson-records/:id
router.put('/lesson-records/:id', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'coach') { res.status(403).json({ error: 'Coach only' }); return; }
    const { id } = req.params;
    const { lessonDate, textMemo, mediaFiles, checklist, linkedLessonId, coachFeedback } = req.body;
    const now = Date.now();

    const result = await pool.query(
      `UPDATE chapter_lesson_records SET lesson_date=$1, text_memo=$2, media_files=$3, checklist=$4,
       linked_lesson_id=$5, coach_feedback=$6, updated_at=$7
       WHERE id=$8 AND coach_id=$9 RETURNING *`,
      [
        lessonDate ?? null, textMemo ?? null,
        JSON.stringify(mediaFiles ?? []), JSON.stringify(checklist ?? []),
        linkedLessonId ?? null, coachFeedback ?? null, now, id, req.user!.id,
      ]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ ok: true });
  } catch (err) {
    console.error('[textbooks] update lesson-record error:', err);
    res.status(500).json({ error: 'Failed to update record' });
  }
});

// DELETE /api/textbooks/lesson-records/:id
router.delete('/lesson-records/:id', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'coach') { res.status(403).json({ error: 'Coach only' }); return; }
    const { id } = req.params;
    await pool.query(`DELETE FROM chapter_lesson_records WHERE id=$1 AND coach_id=$2`, [id, req.user!.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[textbooks] delete lesson-record error:', err);
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

export default router;
