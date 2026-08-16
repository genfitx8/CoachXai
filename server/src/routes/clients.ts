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
    // Redesign 7a handover trail (#309): previous coaches the student has
    // worked with. Populated automatically when coach_id changes; the
    // client uses this to render the "코치 이력" block in the passport
    // (6f) and to feed the future 인수인계 요약 endpoint.
    previousCoachIds: (row.previous_coach_ids as string[] | null) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/clients/me — client fetches their own profile
router.get('/me', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'client') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const result = await pool.query('SELECT * FROM clients WHERE id = $1', [req.user!.id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    res.json({ client: mapClient(result.rows[0]) });
  } catch (err) {
    console.error('[clients] GET /me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/clients/me — client updates their own profile (including coach assignment)
router.put('/me', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'client') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const clientId = req.user!.id;

    const {
      name,
      email,
      phone,
      coachId,
      designatedCoach,
      pushToken,
    } = req.body as Record<string, unknown>;

    // If coachId is provided (and not null), validate that the coach exists
    // and resolve their name for `designated_coach` consistency.
    let resolvedCoachId: string | null | undefined = undefined;
    let resolvedDesignatedCoach: string | null | undefined = undefined;

    if (coachId === null) {
      // Client is un-assigning their coach.
      resolvedCoachId = null;
      resolvedDesignatedCoach = null;
    } else if (typeof coachId === 'string' && coachId.length > 0) {
      const coach = await pool.query(
        'SELECT id, name FROM coaches WHERE id = $1',
        [coachId]
      );
      if (coach.rows.length === 0) {
        res.status(400).json({ error: 'Coach not found' });
        return;
      }
      resolvedCoachId = coach.rows[0].id as string;
      resolvedDesignatedCoach =
        typeof designatedCoach === 'string' && designatedCoach.length > 0
          ? designatedCoach
          : (coach.rows[0].name as string);
    } else if (typeof designatedCoach === 'string') {
      // Coach name provided without a coachId — allow the caller to clear
      // the display name without touching coach_id.
      resolvedDesignatedCoach = designatedCoach;
    }

    const now = Date.now();

    const result = await pool.query(
      `UPDATE clients SET
        name             = COALESCE($1, name),
        email            = COALESCE($2, email),
        phone            = COALESCE($3, phone),
        coach_id         = CASE WHEN $4::boolean THEN $5::uuid ELSE coach_id END,
        designated_coach = CASE WHEN $6::boolean THEN $7 ELSE designated_coach END,
        -- 7a handover trail: when the student picks a new coach, push the
        -- outgoing coach_id onto previous_coach_ids. The CASE evaluates
        -- against the OLD coach_id (pre-update), and DISTINCT FROM guards
        -- against a no-op change appending a duplicate row.
        previous_coach_ids = CASE
          WHEN $4::boolean
            AND coach_id IS NOT NULL
            AND coach_id IS DISTINCT FROM $5::uuid
          THEN array_append(COALESCE(previous_coach_ids, ARRAY[]::uuid[]), coach_id)
          ELSE previous_coach_ids
        END,
        push_token       = COALESCE($8, push_token),
        updated_at       = $9
      WHERE id = $10
      RETURNING *`,
      [
        typeof name === 'string' ? name : null,
        typeof email === 'string' ? email : null,
        typeof phone === 'string' ? phone : null,
        resolvedCoachId !== undefined,
        resolvedCoachId ?? null,
        resolvedDesignatedCoach !== undefined,
        resolvedDesignatedCoach ?? null,
        typeof pushToken === 'string' ? pushToken : null,
        now,
        clientId,
      ]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    res.json({ client: mapClient(result.rows[0]) });
  } catch (err) {
    console.error('[clients] PUT /me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/clients
router.get('/', async (req: Request, res: Response) => {
  try {
    // Admin console reads the whole member table; coaches stay scoped to
    // the members assigned to them.
    const result =
      req.user!.role === 'admin'
        ? await pool.query('SELECT * FROM clients ORDER BY created_at DESC')
        : await pool.query(
            'SELECT * FROM clients WHERE coach_id = $1 ORDER BY created_at DESC',
            [req.user!.id]
          );
    res.json({ clients: result.rows.map(mapClient) });
  } catch (err) {
    console.error('[clients] GET / error:', err);
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
      coachId: newCoachId,
      designatedCoach,
      currentPoints,
      isSubscribed,
      subscriptionPlan,
      subscriptionEndDate,
      pushToken,
    } = req.body as Record<string, unknown>;

    const now = Date.now();

    // Only touch coach_id when the caller explicitly included it in the body,
    // so the common "coach edits a client" flow keeps ownership intact.
    const coachIdProvided = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'coachId');
    const nextCoachId =
      typeof newCoachId === 'string' && newCoachId.length > 0 ? newCoachId : null;

    const result = await pool.query(
      `UPDATE clients SET
        name = COALESCE($1, name),
        email = $2,
        phone = $3,
        coach_id = CASE WHEN $4::boolean THEN $5::uuid ELSE coach_id END,
        designated_coach = $6,
        current_points = COALESCE($7, current_points),
        is_subscribed = COALESCE($8, is_subscribed),
        subscription_plan = COALESCE($9, subscription_plan),
        subscription_end_date = $10,
        push_token = $11,
        updated_at = $12
      WHERE id = $13 AND coach_id = $14
      RETURNING *`,
      [
        name ?? null,
        email ?? null,
        phone ?? null,
        coachIdProvided,
        nextCoachId,
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
