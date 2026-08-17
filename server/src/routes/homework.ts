import { Router, Request, Response } from 'express';
import pool from '../services/db';
import { authMiddleware } from '../middleware/auth';
import { recordEventSafe } from '../services/events';

/**
 * Homework — Phase 1 server promotion (docs/DATA_ARCHITECTURE.md §5.3).
 *
 * Client documents don't carry coachId today, so coach access is derived
 * from the roster: a coach may read/write homework whose client_id resolves
 * to one of their students (composite `${name}_${phone}` or UUID), and rows
 * a coach creates get coach_id stamped from the token.
 */

const router = Router();
router.use(authMiddleware);

/** Identities a client may appear under in homework rows (Phase 2 retires the composite). */
async function getClientIds(userId: string): Promise<string[] | null> {
  const row = await pool.query('SELECT name, phone FROM clients WHERE id = $1', [userId]);
  if (row.rows.length === 0) return null;
  const { name, phone } = row.rows[0];
  const ids = [userId];
  if (name && phone) ids.push(`${name}_${phone}`);
  return ids;
}

/** All identities of the coach's current students. */
async function getRosterClientIds(coachId: string): Promise<string[]> {
  const rows = await pool.query(
    'SELECT id, name, phone FROM clients WHERE coach_id = $1',
    [coachId]
  );
  const ids: string[] = [];
  for (const r of rows.rows) {
    ids.push(r.id);
    if (r.name && r.phone) ids.push(`${r.name}_${r.phone}`);
  }
  return ids;
}

// GET /api/homework?clientId=...
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const clientIdParam =
      typeof req.query.clientId === 'string' && req.query.clientId.trim().length > 0
        ? req.query.clientId.trim()
        : null;

    if (userRole === 'admin') {
      const result = await pool.query(
        clientIdParam
          ? 'SELECT doc FROM homework WHERE client_id = $1'
          : 'SELECT doc FROM homework',
        clientIdParam ? [clientIdParam] : []
      );
      res.json({ homework: result.rows.map((r) => r.doc) });
      return;
    }

    if (userRole === 'coach') {
      const roster = await getRosterClientIds(userId);
      const result = await pool.query(
        `SELECT doc FROM homework
           WHERE (coach_id = $1 OR client_id = ANY($2))
             AND ($3::text IS NULL OR client_id = $3)`,
        [userId, roster, clientIdParam]
      );
      res.json({ homework: result.rows.map((r) => r.doc) });
      return;
    }

    if (userRole === 'client') {
      const myIds = await getClientIds(userId);
      if (!myIds) {
        res.status(404).json({ error: 'Client not found' });
        return;
      }
      if (clientIdParam && !myIds.includes(clientIdParam)) {
        res.status(403).json({ error: 'Not your homework' });
        return;
      }
      const result = await pool.query(
        'SELECT doc FROM homework WHERE client_id = ANY($1)',
        [myIds]
      );
      res.json({ homework: result.rows.map((r) => r.doc) });
      return;
    }

    res.status(403).json({ error: 'Invalid user role' });
  } catch (err) {
    console.error('[homework] GET / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/homework — batch upsert { homework: Homework[] }. Row ids are the
// idempotency key, so offline re-sends and the local-data sync are safe.
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const list = (req.body as { homework?: unknown[] })?.homework;
    if (!Array.isArray(list) || list.length === 0) {
      res.status(400).json({ error: 'homework array required' });
      return;
    }
    if (list.length > 500) {
      res.status(400).json({ error: 'homework batch too large' });
      return;
    }

    const rows: Array<Record<string, unknown>> = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const h = item as Record<string, unknown>;
      if (
        typeof h.id !== 'string' || h.id.length === 0 ||
        typeof h.clientId !== 'string' || h.clientId.length === 0 ||
        typeof h.title !== 'string' || h.title.length === 0
      ) {
        res.status(400).json({ error: 'each homework needs id, clientId, title' });
        return;
      }
      rows.push(h);
    }

    // Authorization: coach → every row must target a roster student; client →
    // every row must target themselves. (Batches are per-student in the UI.)
    let stampCoachId: string | null = null;
    if (userRole === 'coach') {
      const roster = await getRosterClientIds(userId);
      const rosterSet = new Set(roster);
      for (const h of rows) {
        if (!rosterSet.has(h.clientId as string)) {
          res.status(403).json({ error: `Not your student: ${h.clientId}` });
          return;
        }
      }
      stampCoachId = userId;
    } else if (userRole === 'client') {
      const myIds = await getClientIds(userId);
      if (!myIds) {
        res.status(404).json({ error: 'Client not found' });
        return;
      }
      for (const h of rows) {
        if (!myIds.includes(h.clientId as string)) {
          res.status(403).json({ error: 'Not your homework' });
          return;
        }
      }
    } else {
      res.status(403).json({ error: 'Invalid user role' });
      return;
    }

    for (const h of rows) {
      await pool.query(
        `INSERT INTO homework (id, client_id, coach_id, title, due_date, is_completed, doc, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7, now())
         ON CONFLICT (id) DO UPDATE SET
           client_id = EXCLUDED.client_id,
           coach_id = COALESCE(homework.coach_id, EXCLUDED.coach_id),
           title = EXCLUDED.title,
           due_date = EXCLUDED.due_date,
           is_completed = EXCLUDED.is_completed,
           doc = EXCLUDED.doc,
           updated_at = now()`,
        [
          h.id,
          h.clientId,
          stampCoachId,
          h.title,
          typeof h.date === 'string' ? h.date : null,
          h.isCompleted === true,
          JSON.stringify(h),
        ]
      );
    }

    recordEventSafe({
      actorId: userId,
      actorRole: userRole,
      eventType: userRole === 'coach' ? 'homework.assigned' : 'homework.self_added',
      entityType: 'homework',
      studentUuid: userRole === 'client' ? userId : null,
      payload: {
        count: rows.length,
        clientCompositeId: rows[0]?.clientId ?? null,
      },
    });

    res.status(201).json({ saved: rows.length });
  } catch (err) {
    console.error('[homework] POST / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** Load a row if the requester may modify it, else null. */
async function loadOwnedHomework(
  id: string,
  userId: string,
  userRole: string
): Promise<Record<string, unknown> | null> {
  const row = await pool.query('SELECT * FROM homework WHERE id = $1', [id]);
  const existing = row.rows[0];
  if (!existing) return null;
  if (userRole === 'admin') return existing;
  if (userRole === 'coach') {
    if (existing.coach_id === userId) return existing;
    const roster = await getRosterClientIds(userId);
    return roster.includes(existing.client_id) ? existing : null;
  }
  if (userRole === 'client') {
    const myIds = await getClientIds(userId);
    return myIds && myIds.includes(existing.client_id) ? existing : null;
  }
  return null;
}

// PATCH /api/homework/:id — completion toggle
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const { id } = req.params;
    const { isCompleted } = req.body as { isCompleted?: unknown };
    if (typeof isCompleted !== 'boolean') {
      res.status(400).json({ error: 'isCompleted boolean required' });
      return;
    }

    const existing = await loadOwnedHomework(id, userId, userRole);
    if (!existing) {
      res.status(404).json({ error: 'Homework not found or access denied' });
      return;
    }

    const result = await pool.query(
      `UPDATE homework
         SET is_completed = $1,
             doc = jsonb_set(doc, '{isCompleted}', to_jsonb($1::boolean)),
             updated_at = now()
       WHERE id = $2
       RETURNING doc`,
      [isCompleted, id]
    );

    if (isCompleted && existing.is_completed !== true) {
      recordEventSafe({
        actorId: userId,
        actorRole: userRole,
        eventType: 'homework.completed',
        entityType: 'homework',
        entityId: id,
        studentUuid: userRole === 'client' ? userId : null,
        payload: { clientCompositeId: existing.client_id },
      });
    }

    res.json({ homework: result.rows[0].doc });
  } catch (err) {
    console.error('[homework] PATCH /:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/homework/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const { id } = req.params;

    const existing = await loadOwnedHomework(id, userId, userRole);
    if (!existing) {
      res.status(404).json({ error: 'Homework not found or access denied' });
      return;
    }

    await pool.query('DELETE FROM homework WHERE id = $1', [id]);
    recordEventSafe({
      actorId: userId,
      actorRole: userRole,
      eventType: 'homework.deleted',
      entityType: 'homework',
      entityId: id,
      payload: { clientCompositeId: existing.client_id },
    });
    res.json({ deleted: true, id });
  } catch (err) {
    console.error('[homework] DELETE /:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
