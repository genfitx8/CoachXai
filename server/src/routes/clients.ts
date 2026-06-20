import { Router, Request, Response } from 'express';
import pool from '../services/db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

function mapClient(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    coachId: row.coach_id,
    designatedCoach: row.designated_coach,
    currentPoints: row.current_points,
    isSubscribed: row.is_subscribed,
    subscriptionPlan: row.subscription_plan,
    subscriptionEndDate: row.subscription_end_date,
    pushToken: row.push_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/clients — coaches only: returns clients assigned to this coach
router.get('/', async (req: Request, res: Response) => {
  if (req.user?.role !== 'coach') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  try {
    const coachId = req.user!.id;
    const result = await pool.query(
      'SELECT * FROM clients WHERE coach_id = $1 ORDER BY created_at DESC',
      [coachId]
    );
    res.json({ clients: result.rows.map(mapClient) });
  } catch (err) {
    console.error('[clients] GET / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/clients/me — client self-update: allows a student to update their own profile
// including designating a coach (sets coach_id)
router.put('/me', async (req: Request, res: Response) => {
  if (req.user?.role !== 'client') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  try {
    const clientId = req.user!.id;
    const {
      coachId,
      name,
      email,
      phone,
      pushToken,
    } = req.body as Record<string, unknown>;

    const now = Date.now();

    const result = await pool.query(
      `UPDATE clients SET
        coach_id = $1,
        name = COALESCE($2, name),
        email = COALESCE($3, email),
        phone = COALESCE($4, phone),
        push_token = $5,
        updated_at = $6
      WHERE id = $7
      RETURNING *`,
      [
        coachId ?? null,
        name ?? null,
        email ?? null,
        phone ?? null,
        pushToken ?? null,
        now,
        clientId,
      ]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    res.json(mapClient(result.rows[0]));
  } catch (err) {
    console.error('[clients] PUT /me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/clients
router.post('/', async (req: Request, res: Response) => {
  try {
    const coachId = req.user!.id;
    const {
      name,
      email,
      phone,
      designatedCoach,
      currentPoints,
      isSubscribed,
      subscriptionPlan,
      subscriptionEndDate,
      pushToken,
    } = req.body as Record<string, unknown>;

    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const now = Date.now();

    const result = await pool.query(
      `INSERT INTO clients (
        name, email, phone, coach_id, designated_coach,
        current_points, is_subscribed, subscription_plan,
        subscription_end_date, push_token, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        name,
        email ?? null,
        phone ?? null,
        coachId,
        designatedCoach ?? null,
        currentPoints ?? 0,
        isSubscribed ?? false,
        subscriptionPlan ?? 'FREE',
        subscriptionEndDate ?? null,
        pushToken ?? null,
        now,
        now,
      ]
    );

    res.status(201).json(mapClient(result.rows[0]));
  } catch (err) {
    console.error('[clients] POST / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/clients/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const coachId = req.user!.id;
    const { id } = req.params;

    const existing = await pool.query(
      'SELECT id FROM clients WHERE id = $1 AND coach_id = $2',
      [id, coachId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Client not found or access denied' });
      return;
    }

    const {
      name,
      email,
      phone,
      designatedCoach,
      currentPoints,
      isSubscribed,
      subscriptionPlan,
      subscriptionEndDate,
      pushToken,
    } = req.body as Record<string, unknown>;

    const now = Date.now();

    const result = await pool.query(
      `UPDATE clients SET
        name = COALESCE($1, name),
        email = $2,
        phone = $3,
        designated_coach = $4,
        current_points = COALESCE($5, current_points),
        is_subscribed = COALESCE($6, is_subscribed),
        subscription_plan = COALESCE($7, subscription_plan),
        subscription_end_date = $8,
        push_token = $9,
        updated_at = $10
      WHERE id = $11 AND coach_id = $12
      RETURNING *`,
      [
        name ?? null,
        email ?? null,
        phone ?? null,
        designatedCoach ?? null,
        currentPoints ?? null,
        isSubscribed ?? null,
        subscriptionPlan ?? null,
        subscriptionEndDate ?? null,
        pushToken ?? null,
        now,
        id,
        coachId,
      ]
    );

    res.json(mapClient(result.rows[0]));
  } catch (err) {
    console.error('[clients] PUT /:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/clients/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const coachId = req.user!.id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM clients WHERE id = $1 AND coach_id = $2 RETURNING id',
      [id, coachId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Client not found or access denied' });
      return;
    }

    res.json({ deleted: true, id });
  } catch (err) {
    console.error('[clients] DELETE /:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
