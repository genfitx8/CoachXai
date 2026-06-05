import { Router, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import pool from '../services/db';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const listCoachesLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
const coachSelfLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 180,
  standardHeaders: true,
  legacyHeaders: false,
});
const COACH_COLUMNS = `
  id, name, email, phone,
  is_subscribed, subscription_plan, subscription_end_date,
  current_points, push_token, working_schedule,
  created_at, updated_at
`;
const requireCoachRole = (req: Request, res: Response, next: () => void) => {
  if (req.user?.role !== 'coach') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
};

function mapCoach(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    isSubscribed: row.is_subscribed,
    subscriptionPlan: row.subscription_plan,
    subscriptionEndDate: row.subscription_end_date,
    currentPoints: row.current_points,
    pushToken: row.push_token,
    workingSchedule: row.working_schedule,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/coaches
router.get('/', listCoachesLimiter, authMiddleware, requireCoachRole, async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT ${COACH_COLUMNS} FROM coaches ORDER BY created_at DESC`
    );
    res.json({ coaches: result.rows.map(mapCoach) });
  } catch (err) {
    console.error('[coaches] GET / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/coaches/me
router.get('/me', coachSelfLimiter, authMiddleware, requireCoachRole, async (req: Request, res: Response) => {
  try {
    const coachId = req.user!.id;
    const result = await pool.query(
      `SELECT ${COACH_COLUMNS} FROM coaches WHERE id = $1`,
      [coachId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Coach not found' });
      return;
    }

    res.json({ coach: mapCoach(result.rows[0]) });
  } catch (err) {
    console.error('[coaches] GET /me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/coaches/me
router.put('/me', coachSelfLimiter, authMiddleware, requireCoachRole, async (req: Request, res: Response) => {
  try {
    const coachId = req.user!.id;
    const {
      name,
      phone,
      isSubscribed,
      subscriptionPlan,
      subscriptionEndDate,
      pushToken,
      workingSchedule,
    } = req.body as Record<string, unknown>;

    const now = Date.now();

    const result = await pool.query(
      `UPDATE coaches SET
        name = COALESCE($1, name),
        phone = $2,
        is_subscribed = COALESCE($3, is_subscribed),
        subscription_plan = COALESCE($4, subscription_plan),
        subscription_end_date = $5,
        push_token = $6,
        working_schedule = COALESCE($7, working_schedule),
        updated_at = $8
      WHERE id = $9
      RETURNING ${COACH_COLUMNS}`,
      [
        name ?? null,
        phone ?? null,
        isSubscribed ?? null,
        subscriptionPlan ?? null,
        subscriptionEndDate ?? null,
        pushToken ?? null,
        workingSchedule ? JSON.stringify(workingSchedule) : null,
        now,
        coachId,
      ]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Coach not found' });
      return;
    }

    res.json(mapCoach(result.rows[0]));
  } catch (err) {
    console.error('[coaches] PUT /me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
