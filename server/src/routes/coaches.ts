import { Router, Request, Response } from 'express';
import pool from '../services/db';
import { authMiddleware } from '../middleware/auth';
import { createUserLimiter } from '../middleware/rateLimit';

const router = Router();
// Keyed per account rather than per IP. These limits were written as
// per-user budgets, but an IP key behind the platform proxy turned them into
// a single bucket shared by every coach and student — 120 req/min across the
// whole user base, which a few dozen concurrent sessions exhaust on their own.
const listCoachesLimiter = createUserLimiter(60 * 1000, 120);
const coachSelfLimiter = createUserLimiter(60 * 1000, 180);
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
// The admin console needs the same directory reads a coach gets. Without this
// an admin session got 403 here, apiService fell back to /api/coaches/me
// (also 403), and the dashboard rendered the device's cached coach list.
const requireCoachOrAdminRole = (req: Request, res: Response, next: () => void) => {
  if (req.user?.role !== 'coach' && req.user?.role !== 'admin') {
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
router.get('/', authMiddleware, listCoachesLimiter, requireCoachOrAdminRole, async (_req: Request, res: Response) => {
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

// GET /api/coaches/search?q=<name>
// Accessible by any authenticated user (coaches and clients) so students
// can search for a coach to assign to their own profile.
router.get('/search', authMiddleware, listCoachesLimiter, async (req: Request, res: Response) => {
  try {
    const rawQuery = typeof req.query.q === 'string' ? req.query.q : '';
    const term = rawQuery.trim();
    if (term.length < 1) {
      res.json({ coaches: [] });
      return;
    }
    const like = `%${term.toLowerCase()}%`;
    const result = await pool.query(
      // created_at breaks ties so a name shared by several coach accounts
      // comes back in a stable order instead of shuffling between searches.
      `SELECT id, name, phone FROM coaches
        WHERE LOWER(name) LIKE $1
        ORDER BY name ASC, created_at ASC
        LIMIT 20`,
      [like]
    );
    res.json({
      coaches: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
      })),
    });
  } catch (err) {
    console.error('[coaches] GET /search error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/coaches/me
router.get('/me', authMiddleware, coachSelfLimiter, requireCoachRole, async (req: Request, res: Response) => {
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

// GET /api/coaches/:id - accessible by authenticated coaches and clients
router.get('/:id', authMiddleware, coachSelfLimiter, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT ${COACH_COLUMNS} FROM coaches WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Coach not found' });
      return;
    }

    const coach = mapCoach(result.rows[0]);
    // Clients only receive public-safe fields
    if (req.user?.role !== 'coach' && req.user?.role !== 'admin') {
      res.json({
        coach: {
          id: coach.id,
          name: coach.name,
          phone: coach.phone,
          email: coach.email,
          workingSchedule: coach.workingSchedule,
        },
      });
      return;
    }
    res.json({ coach });
  } catch (err) {
    console.error('[coaches] GET /:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/coaches/me
router.put('/me', authMiddleware, coachSelfLimiter, requireCoachRole, async (req: Request, res: Response) => {
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
