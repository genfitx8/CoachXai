import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../services/db';
import { authMiddleware } from '../middleware/auth';
import { buildDefaultCurriculumParts } from '../seeds/curriculumParts';

const router = Router();
router.use(authMiddleware);

// Builds the 5 fixed parts for a newly created curriculum from the admin-editable
// templates table, falling back to the static seed if the table is unexpectedly empty.
async function buildPartsFromTemplates(curriculumId: string, now: number) {
  const result = await pool.query('SELECT * FROM curriculum_part_templates ORDER BY part_order ASC');
  if (result.rows.length === 0) {
    return buildDefaultCurriculumParts(curriculumId, now);
  }
  return result.rows.map((row) => ({
    id: uuidv4(),
    curriculumId,
    partKey: row.part_key as string,
    partOrder: row.part_order as number,
    title: row.title as string,
    content: row.content as string,
    keyPoints: (row.key_points ?? []) as string[],
    createdAt: now,
    updatedAt: now,
  }));
}

function mapCurriculum(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    coachId: row.coach_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPart(row: Record<string, unknown>) {
  return {
    id: row.id,
    curriculumId: row.curriculum_id,
    partKey: row.part_key,
    order: row.part_order,
    title: row.title,
    content: row.content,
    keyPoints: row.key_points ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Curriculum CRUD ───────────────────────────────────────────────────────

// GET /api/curriculums — list (coach: own; student: assigned)
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;

    let rows;
    if (role === 'coach') {
      const result = await pool.query(
        `SELECT * FROM curriculums WHERE coach_id = $1 ORDER BY created_at DESC`,
        [userId]
      );
      rows = result.rows;
    } else {
      const result = await pool.query(
        `SELECT c.* FROM curriculums c
         JOIN student_curriculums sc ON sc.curriculum_id = c.id
         WHERE sc.student_id = $1
         ORDER BY sc.assigned_at DESC`,
        [userId]
      );
      rows = result.rows;
    }

    res.json(rows.map(mapCurriculum));
  } catch (err) {
    console.error('[curriculums] list error:', err);
    res.status(500).json({ error: 'Failed to list curriculums' });
  }
});

// GET /api/curriculums/lesson-records?partId=...&studentId=...
router.get('/lesson-records', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const { partId, studentId } = req.query as { partId?: string; studentId?: string };

    let query = `SELECT * FROM part_lesson_records WHERE 1=1`;
    const params: unknown[] = [];

    if (role === 'coach') {
      params.push(userId);
      query += ` AND coach_id=$${params.length}`;
    } else {
      params.push(userId);
      query += ` AND student_id=$${params.length}`;
    }

    if (partId) { params.push(partId); query += ` AND part_id=$${params.length}`; }
    if (studentId && role === 'coach') { params.push(studentId); query += ` AND student_id=$${params.length}`; }

    query += ' ORDER BY lesson_date DESC, created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows.map((r) => ({
      id: r.id,
      partId: r.part_id,
      curriculumId: r.curriculum_id,
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
    console.error('[curriculums] get lesson-records error:', err);
    res.status(500).json({ error: 'Failed to get records' });
  }
});

// GET /api/curriculums/:id — get with parts
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const cResult = await pool.query('SELECT * FROM curriculums WHERE id = $1', [id]);
    if (cResult.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }

    const partsResult = await pool.query(
      'SELECT * FROM curriculum_parts WHERE curriculum_id = $1 ORDER BY part_order ASC',
      [id]
    );

    const curriculum = mapCurriculum(cResult.rows[0]);
    (curriculum as Record<string, unknown>).parts = partsResult.rows.map(mapPart);

    res.json(curriculum);
  } catch (err) {
    console.error('[curriculums] get error:', err);
    res.status(500).json({ error: 'Failed to get curriculum' });
  }
});

// POST /api/curriculums — create (coach only), auto-creates the 5 fixed parts
router.post('/', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'coach') { res.status(403).json({ error: 'Coach only' }); return; }
    const { title, description } = req.body;
    const now = Date.now();
    const id = uuidv4();

    const result = await pool.query(
      `INSERT INTO curriculums (id, title, description, coach_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, title, description ?? null, req.user!.id, now, now]
    );

    const parts = await buildPartsFromTemplates(id, now);
    for (const part of parts) {
      await pool.query(
        `INSERT INTO curriculum_parts (id, curriculum_id, part_key, part_order, title, content, key_points, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [part.id, part.curriculumId, part.partKey, part.partOrder, part.title, part.content, JSON.stringify(part.keyPoints), part.createdAt, part.updatedAt]
      );
    }

    const curriculum = mapCurriculum(result.rows[0]);
    (curriculum as Record<string, unknown>).parts = parts.map((p) => ({
      id: p.id,
      curriculumId: p.curriculumId,
      partKey: p.partKey,
      order: p.partOrder,
      title: p.title,
      content: p.content,
      keyPoints: p.keyPoints,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    res.status(201).json(curriculum);
  } catch (err) {
    console.error('[curriculums] create error:', err);
    res.status(500).json({ error: 'Failed to create curriculum' });
  }
});

// PUT /api/curriculums/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'coach') { res.status(403).json({ error: 'Coach only' }); return; }
    const { id } = req.params;
    const { title, description } = req.body;
    const now = Date.now();

    const result = await pool.query(
      `UPDATE curriculums SET title=$1, description=$2, updated_at=$3
       WHERE id=$4 AND coach_id=$5 RETURNING *`,
      [title, description ?? null, now, id, req.user!.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(mapCurriculum(result.rows[0]));
  } catch (err) {
    console.error('[curriculums] update error:', err);
    res.status(500).json({ error: 'Failed to update curriculum' });
  }
});

// DELETE /api/curriculums/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'coach') { res.status(403).json({ error: 'Coach only' }); return; }
    const { id } = req.params;
    await pool.query(`DELETE FROM curriculums WHERE id=$1 AND coach_id=$2`, [id, req.user!.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[curriculums] delete error:', err);
    res.status(500).json({ error: 'Failed to delete curriculum' });
  }
});

// ── Part content ──────────────────────────────────────────────────────────

// PUT /api/curriculums/:curriculumId/parts/:partId
router.put('/:curriculumId/parts/:partId', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'coach') { res.status(403).json({ error: 'Coach only' }); return; }
    const { partId } = req.params;
    const { title, content, keyPoints } = req.body;
    const now = Date.now();

    const result = await pool.query(
      `UPDATE curriculum_parts SET title=$1, content=$2, key_points=$3, updated_at=$4
       WHERE id=$5 RETURNING *`,
      [title, content ?? null, JSON.stringify(keyPoints ?? []), now, partId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(mapPart(result.rows[0]));
  } catch (err) {
    console.error('[curriculums] update part error:', err);
    res.status(500).json({ error: 'Failed to update part' });
  }
});

// ── Student assignment & progress ─────────────────────────────────────────

// POST /api/curriculums/:curriculumId/assign
router.post('/:curriculumId/assign', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'coach') { res.status(403).json({ error: 'Coach only' }); return; }
    const { curriculumId } = req.params;
    const { studentIds } = req.body as { studentIds: string[] };
    const now = Date.now();

    for (const studentId of studentIds) {
      await pool.query(
        `INSERT INTO student_curriculums (id, student_id, curriculum_id, coach_id, assigned_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (student_id, curriculum_id) DO NOTHING`,
        [uuidv4(), studentId, curriculumId, req.user!.id, now, now]
      );
      await pool.query(
        `INSERT INTO student_part_progress (id, student_id, curriculum_id, part_progress, overall_progress, assigned_at, updated_at)
         VALUES ($1,$2,$3,'{}',0,$4,$5) ON CONFLICT (student_id, curriculum_id) DO NOTHING`,
        [uuidv4(), studentId, curriculumId, now, now]
      );
    }

    res.json({ ok: true, assigned: studentIds.length });
  } catch (err) {
    console.error('[curriculums] assign error:', err);
    res.status(500).json({ error: 'Failed to assign' });
  }
});

// GET /api/curriculums/:curriculumId/progress — coach: all students; student: self
router.get('/:curriculumId/progress', async (req: Request, res: Response) => {
  try {
    const { curriculumId } = req.params;
    const userId = req.user!.id;
    const role = req.user!.role;

    let result;
    if (role === 'coach') {
      result = await pool.query(
        `SELECT * FROM student_part_progress WHERE curriculum_id=$1`,
        [curriculumId]
      );
    } else {
      result = await pool.query(
        `SELECT * FROM student_part_progress WHERE curriculum_id=$1 AND student_id=$2`,
        [curriculumId, userId]
      );
    }

    res.json(result.rows.map((r) => ({
      id: r.id,
      studentId: r.student_id,
      curriculumId: r.curriculum_id,
      partProgress: r.part_progress ?? {},
      overallProgress: r.overall_progress ?? 0,
      completedAt: r.completed_at,
      assignedAt: r.assigned_at,
      updatedAt: r.updated_at,
    })));
  } catch (err) {
    console.error('[curriculums] progress error:', err);
    res.status(500).json({ error: 'Failed to get progress' });
  }
});

// PUT /api/curriculums/:curriculumId/students/:studentId/parts/:partKey — mark part status (coach only)
router.put('/:curriculumId/students/:studentId/parts/:partKey', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'coach') { res.status(403).json({ error: 'Coach only' }); return; }
    const { curriculumId, studentId, partKey } = req.params;
    const { status } = req.body as { status: 'not_started' | 'in_progress' | 'completed' };
    const now = Date.now();

    const progressResult = await pool.query(
      `SELECT * FROM student_part_progress WHERE student_id=$1 AND curriculum_id=$2`,
      [studentId, curriculumId]
    );
    if (progressResult.rows.length === 0) { res.status(404).json({ error: 'Not assigned' }); return; }

    const existing = progressResult.rows[0].part_progress as Record<string, {
      status: string; completedAt?: number; lessonRecordIds: string[];
    }> ?? {};
    const prev = existing[partKey] ?? { status: 'not_started', lessonRecordIds: [] };
    existing[partKey] = {
      ...prev,
      status,
      completedAt: status === 'completed' ? (prev.completedAt ?? now) : undefined,
    };

    const partsCountResult = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM curriculum_parts WHERE curriculum_id=$1`,
      [curriculumId]
    );
    const totalParts = partsCountResult.rows[0]?.cnt || 5;
    const completedCount = Object.values(existing).filter((p) => p.status === 'completed').length;
    const overallProgress = Math.round((completedCount / totalParts) * 100);
    const completedAt = overallProgress === 100 ? now : null;

    await pool.query(
      `UPDATE student_part_progress SET part_progress=$1, overall_progress=$2, completed_at=$3, updated_at=$4
       WHERE student_id=$5 AND curriculum_id=$6`,
      [JSON.stringify(existing), overallProgress, completedAt, now, studentId, curriculumId]
    );

    res.json({ ok: true, partProgress: existing, overallProgress, completedAt });
  } catch (err) {
    console.error('[curriculums] set part status error:', err);
    res.status(500).json({ error: 'Failed to update part status' });
  }
});

// ── Part Lesson Records ───────────────────────────────────────────────────

// POST /api/curriculums/lesson-records
router.post('/lesson-records', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'coach') { res.status(403).json({ error: 'Coach only' }); return; }
    const {
      partId, curriculumId, studentId, studentName,
      lessonDate, textMemo, mediaFiles, checklist,
      linkedLessonId, coachFeedback,
    } = req.body;
    const now = Date.now();
    const id = uuidv4();

    await pool.query(
      `INSERT INTO part_lesson_records
       (id, part_id, curriculum_id, student_id, student_name, coach_id, lesson_date, text_memo, media_files, checklist, linked_lesson_id, coach_feedback, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        id, partId, curriculumId, studentId, studentName ?? null,
        req.user!.id, lessonDate ?? null, textMemo ?? null,
        JSON.stringify(mediaFiles ?? []), JSON.stringify(checklist ?? []),
        linkedLessonId ?? null, coachFeedback ?? null, now, now,
      ]
    );

    // Move part from not_started -> in_progress on first lesson record
    if (studentId && curriculumId && partId) {
      const progressResult = await pool.query(
        `SELECT part_progress FROM student_part_progress WHERE student_id=$1 AND curriculum_id=$2`,
        [studentId, curriculumId]
      );
      if (progressResult.rows.length > 0) {
        const existing = progressResult.rows[0].part_progress as Record<string, {
          status: string; lessonRecordIds: string[];
        }> ?? {};

        // part_progress is keyed by partKey; look up the part's key from partId
        const partRow = await pool.query(`SELECT part_key FROM curriculum_parts WHERE id=$1`, [partId]);
        const partKey = partRow.rows[0]?.part_key;
        if (partKey) {
          const prev = existing[partKey] ?? { status: 'not_started', lessonRecordIds: [] };
          existing[partKey] = {
            ...prev,
            status: prev.status === 'not_started' ? 'in_progress' : prev.status,
            lessonRecordIds: [...(prev.lessonRecordIds ?? []), id],
          };
          await pool.query(
            `UPDATE student_part_progress SET part_progress=$1, updated_at=$2 WHERE student_id=$3 AND curriculum_id=$4`,
            [JSON.stringify(existing), now, studentId, curriculumId]
          );
        }
      }
    }

    res.status(201).json({ id, ...req.body, coachId: req.user!.id, createdAt: now, updatedAt: now });
  } catch (err) {
    console.error('[curriculums] create lesson-record error:', err);
    res.status(500).json({ error: 'Failed to create record' });
  }
});

// PUT /api/curriculums/lesson-records/:id
router.put('/lesson-records/:id', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'coach') { res.status(403).json({ error: 'Coach only' }); return; }
    const { id } = req.params;
    const { lessonDate, textMemo, mediaFiles, checklist, linkedLessonId, coachFeedback } = req.body;
    const now = Date.now();

    const result = await pool.query(
      `UPDATE part_lesson_records SET lesson_date=$1, text_memo=$2, media_files=$3, checklist=$4,
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
    console.error('[curriculums] update lesson-record error:', err);
    res.status(500).json({ error: 'Failed to update record' });
  }
});

// DELETE /api/curriculums/lesson-records/:id
router.delete('/lesson-records/:id', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'coach') { res.status(403).json({ error: 'Coach only' }); return; }
    const { id } = req.params;
    await pool.query(`DELETE FROM part_lesson_records WHERE id=$1 AND coach_id=$2`, [id, req.user!.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[curriculums] delete lesson-record error:', err);
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

export default router;
