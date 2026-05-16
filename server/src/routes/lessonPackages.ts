import { Router, Request, Response } from 'express';
import pool from '../services/db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

function mapPackage(row: Record<string, unknown>) {
  return {
    id: row.id,
    coachId: row.coach_id,
    clientId: row.client_id,
    clientName: row.client_name,
    totalSessions: row.total_sessions,
    usedSessions: row.used_sessions,
    remainingSessions: row.remaining_sessions,
    pricePerSession: row.price_per_session,
    description: row.description,
    expiryDate: row.expiry_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/lesson-packages
router.get('/', async (req: Request, res: Response) => {
  try {
    const coachId = (req.query.coachId as string | undefined) ?? req.user!.id;
    const result = await pool.query(
      'SELECT * FROM lesson_packages WHERE coach_id = $1 ORDER BY created_at DESC',
      [coachId]
    );
    res.json({ packages: result.rows.map(mapPackage) });
  } catch (err) {
    console.error('[lesson-packages] GET / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/lesson-packages
router.post('/', async (req: Request, res: Response) => {
  try {
    const coachId = req.user!.id;
    const {
      clientId,
      clientName,
      totalSessions,
      usedSessions,
      remainingSessions,
      pricePerSession,
      description,
      expiryDate,
    } = req.body as Record<string, unknown>;

    const now = Date.now();

    const result = await pool.query(
      `INSERT INTO lesson_packages (
        coach_id, client_id, client_name,
        total_sessions, used_sessions, remaining_sessions,
        price_per_session, description, expiry_date,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        coachId,
        clientId ?? null,
        clientName ?? null,
        totalSessions ?? 0,
        usedSessions ?? 0,
        remainingSessions ?? 0,
        pricePerSession ?? 0,
        description ?? null,
        expiryDate ?? null,
        now,
        now,
      ]
    );

    res.status(201).json(mapPackage(result.rows[0]));
  } catch (err) {
    console.error('[lesson-packages] POST / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/lesson-packages/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const coachId = req.user!.id;
    const { id } = req.params;

    const existing = await pool.query(
      'SELECT id FROM lesson_packages WHERE id = $1 AND coach_id = $2',
      [id, coachId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Lesson package not found or access denied' });
      return;
    }

    const {
      clientId,
      clientName,
      totalSessions,
      usedSessions,
      remainingSessions,
      pricePerSession,
      description,
      expiryDate,
    } = req.body as Record<string, unknown>;

    const now = Date.now();

    const result = await pool.query(
      `UPDATE lesson_packages SET
        client_id = $1,
        client_name = $2,
        total_sessions = COALESCE($3, total_sessions),
        used_sessions = COALESCE($4, used_sessions),
        remaining_sessions = COALESCE($5, remaining_sessions),
        price_per_session = COALESCE($6, price_per_session),
        description = $7,
        expiry_date = $8,
        updated_at = $9
      WHERE id = $10 AND coach_id = $11
      RETURNING *`,
      [
        clientId ?? null,
        clientName ?? null,
        totalSessions ?? null,
        usedSessions ?? null,
        remainingSessions ?? null,
        pricePerSession ?? null,
        description ?? null,
        expiryDate ?? null,
        now,
        id,
        coachId,
      ]
    );

    res.json(mapPackage(result.rows[0]));
  } catch (err) {
    console.error('[lesson-packages] PUT /:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/lesson-packages/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const coachId = req.user!.id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM lesson_packages WHERE id = $1 AND coach_id = $2 RETURNING id',
      [id, coachId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Lesson package not found or access denied' });
      return;
    }

    res.json({ deleted: true, id });
  } catch (err) {
    console.error('[lesson-packages] DELETE /:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
