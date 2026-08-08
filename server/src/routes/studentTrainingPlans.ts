import { Router, Request, Response } from 'express';
import pool from '../services/db';
import { authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

type PlanRow = Record<string, unknown>;

function mapPlan(row: PlanRow) {
  return {
    id: row.id,
    studentId: row.student_id,
    horizon: row.horizon,
    title: row.title,
    config: row.config,
    generatedPlan: row.generated_plan,
    sourceLessonCount: row.source_lesson_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ALLOWED_HORIZONS = new Set(['1M', '3M', '6M', '1Y']);

/**
 * GET /api/student-training-plans
 * Student-only. Returns plans owned by the authenticated student, newest first.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'client') {
      res.status(403).json({ error: 'Only students can view training plans' });
      return;
    }
    const studentId = req.user!.id;
    const result = await pool.query(
      `SELECT * FROM student_training_plans
       WHERE student_id = $1
       ORDER BY created_at DESC`,
      [studentId]
    );
    res.json({ plans: result.rows.map(mapPlan) });
  } catch (err) {
    console.error('[studentTrainingPlans] GET / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/student-training-plans
 * Student-only. Saves an AI-generated plan for the authenticated student.
 * The AI text itself is generated on the client via the generic /api/ai/invoke
 * gateway – this endpoint just persists the result so the student can revisit
 * it and so we can track how much lesson data fed each plan.
 *
 * Body: { horizon: '1M', title?, config?, generatedPlan, sourceLessonCount? }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'client') {
      res.status(403).json({ error: 'Only students can save training plans' });
      return;
    }
    const studentId = req.user!.id;
    const {
      horizon,
      title,
      config,
      generatedPlan,
      sourceLessonCount,
    } = req.body as {
      horizon?: string;
      title?: string;
      config?: unknown;
      generatedPlan?: string;
      sourceLessonCount?: number;
    };

    if (!horizon || !ALLOWED_HORIZONS.has(horizon)) {
      res.status(400).json({
        error: `horizon must be one of ${Array.from(ALLOWED_HORIZONS).join(', ')}`,
      });
      return;
    }
    if (typeof generatedPlan !== 'string' || generatedPlan.trim().length === 0) {
      res.status(400).json({ error: 'generatedPlan is required' });
      return;
    }

    const now = Date.now();
    const inserted = await pool.query(
      `INSERT INTO student_training_plans (
        student_id, horizon, title, config, generated_plan,
        source_lesson_count, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        studentId,
        horizon,
        typeof title === 'string' ? title : null,
        config ? JSON.stringify(config) : null,
        generatedPlan,
        typeof sourceLessonCount === 'number' ? sourceLessonCount : 0,
        now,
        now,
      ]
    );
    res.status(201).json({ plan: mapPlan(inserted.rows[0]) });
  } catch (err) {
    console.error('[studentTrainingPlans] POST / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/student-training-plans/:id
 * Student-only. Deletes a plan owned by the authenticated student.
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'client') {
      res.status(403).json({ error: 'Only students can delete training plans' });
      return;
    }
    const studentId = req.user!.id;
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM student_training_plans WHERE id = $1 AND student_id = $2 RETURNING id',
      [id, studentId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Plan not found or access denied' });
      return;
    }
    res.json({ deleted: true, id });
  } catch (err) {
    console.error('[studentTrainingPlans] DELETE /:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
