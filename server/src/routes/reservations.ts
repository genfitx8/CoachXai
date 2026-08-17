import { Router, Request, Response } from 'express';
import pool from '../services/db';
import { authMiddleware } from '../middleware/auth';
import { recordEventSafe } from '../services/events';

/**
 * Lesson reservations — Phase 1 server promotion (docs/DATA_ARCHITECTURE.md).
 *
 * The reservation state machine still lives in the client
 * (services/reservationService.ts); this route replaces its storage backend.
 * The full client document round-trips through the `doc` JSONB column so no
 * field is ever silently dropped; coach_id / client_id / status / times are
 * extracted for scoping and queries.
 */

const router = Router();
router.use(authMiddleware);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_STATUSES = new Set([
  'AVAILABLE',
  'BLOCKED',
  'PENDING',
  'REQUESTED',
  'COACH_APPROVED',
  'ADMIN_BLOCK_PENDING',
  'CONFIRMED',
  'CHANGE_REQUESTED',
  'CANCEL_REQUESTED',
  'CANCELLED',
  'REJECTED',
  'COMPLETED',
]);

/**
 * Best-effort TIMESTAMPTZ for the analytics column. Client times are
 * timezone-naive local strings; assume KST until Phase 2 normalizes time
 * storage. The verbatim string in start_time stays authoritative.
 */
function parseNaiveKst(value: unknown): Date | null {
  if (typeof value !== 'string' || value.length < 10) return null;
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(value);
  const d = new Date(hasZone ? value : `${value}+09:00`);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * The identities a client may appear under in reservation rows: their auth
 * UUID and the legacy `${name}_${phone}` composite (Phase 2 retires the
 * latter). Returns null when the client row is missing.
 */
async function getClientIds(userId: string): Promise<string[] | null> {
  const row = await pool.query('SELECT name, phone FROM clients WHERE id = $1', [
    userId,
  ]);
  if (row.rows.length === 0) return null;
  const { name, phone } = row.rows[0];
  const ids = [userId];
  if (name && phone) ids.push(`${name}_${phone}`);
  return ids;
}

/**
 * Strip other students' PII from a reservation document before returning it
 * to a client who is browsing a coach's calendar. Slot geometry (times,
 * status, blockReason) survives so client-side overlap checks keep working.
 */
function sanitizeDocForClient(
  doc: Record<string, unknown>,
  myIds: string[]
): Record<string, unknown> {
  const clientId = doc.clientId;
  if (!clientId || (typeof clientId === 'string' && myIds.includes(clientId))) {
    return doc;
  }
  const {
    clientId: _clientId,
    clientName: _clientName,
    clientPhone: _clientPhone,
    notes: _notes,
    requestedChangeNote: _requestedChangeNote,
    ...rest
  } = doc;
  void _clientId; void _clientName; void _clientPhone; void _notes; void _requestedChangeNote;
  return rest;
}

// GET /api/reservations?coachId=...
//   coach  → own rows (coachId param must match, if given)
//   client → ?coachId=X: X's calendar (other students' rows sanitized)
//            otherwise: rows where they are the client
//   admin  → all rows
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const coachIdParam =
      typeof req.query.coachId === 'string' && req.query.coachId.trim().length > 0
        ? req.query.coachId.trim()
        : null;

    if (userRole === 'admin') {
      const result = await pool.query(
        coachIdParam
          ? 'SELECT doc FROM lesson_reservations WHERE coach_id = $1'
          : 'SELECT doc FROM lesson_reservations',
        coachIdParam ? [coachIdParam] : []
      );
      res.json({ reservations: result.rows.map((r) => r.doc) });
      return;
    }

    if (userRole === 'coach') {
      if (coachIdParam && coachIdParam !== userId) {
        res.status(403).json({ error: 'Coaches can only list their own reservations' });
        return;
      }
      const result = await pool.query(
        'SELECT doc FROM lesson_reservations WHERE coach_id = $1',
        [userId]
      );
      res.json({ reservations: result.rows.map((r) => r.doc) });
      return;
    }

    if (userRole === 'client') {
      const myIds = await getClientIds(userId);
      if (!myIds) {
        res.status(404).json({ error: 'Client not found' });
        return;
      }
      if (coachIdParam) {
        const result = await pool.query(
          'SELECT doc FROM lesson_reservations WHERE coach_id = $1',
          [coachIdParam]
        );
        res.json({
          reservations: result.rows.map((r) => sanitizeDocForClient(r.doc, myIds)),
        });
        return;
      }
      const result = await pool.query(
        'SELECT doc FROM lesson_reservations WHERE client_id = ANY($1)',
        [myIds]
      );
      res.json({ reservations: result.rows.map((r) => r.doc) });
      return;
    }

    res.status(403).json({ error: 'Invalid user role' });
  } catch (err) {
    console.error('[reservations] GET / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reservations/:id — single reservation. Clients see other students'
// rows sanitized (claiming an AVAILABLE slot needs the slot, not its PII).
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const { id } = req.params;

    const result = await pool.query(
      'SELECT coach_id, doc FROM lesson_reservations WHERE id = $1',
      [id]
    );
    const row = result.rows[0] ?? null;
    if (!row) {
      res.status(404).json({ error: 'Reservation not found' });
      return;
    }

    if (userRole === 'admin') {
      res.json({ reservation: row.doc });
      return;
    }
    if (userRole === 'coach') {
      if (row.coach_id !== userId) {
        res.status(403).json({ error: 'Not your reservation' });
        return;
      }
      res.json({ reservation: row.doc });
      return;
    }
    if (userRole === 'client') {
      const myIds = await getClientIds(userId);
      if (!myIds) {
        res.status(404).json({ error: 'Client not found' });
        return;
      }
      res.json({ reservation: sanitizeDocForClient(row.doc, myIds) });
      return;
    }
    res.status(403).json({ error: 'Invalid user role' });
  } catch (err) {
    console.error('[reservations] GET /:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/reservations/:id — full-document upsert (id is the idempotency key)
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const { id } = req.params;

    if (!UUID_PATTERN.test(id)) {
      res.status(400).json({ error: 'Reservation id must be a UUID' });
      return;
    }

    const doc = req.body as Record<string, unknown>;
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
      res.status(400).json({ error: 'Reservation document required' });
      return;
    }
    const coachId = typeof doc.coachId === 'string' ? doc.coachId : null;
    const status = typeof doc.status === 'string' ? doc.status : null;
    const startTime = typeof doc.startTime === 'string' ? doc.startTime : null;
    const endTime = typeof doc.endTime === 'string' ? doc.endTime : null;
    if (doc.id !== id || !coachId || !startTime || !endTime || !status) {
      res.status(400).json({
        error: 'Reservation must carry matching id, coachId, startTime, endTime, status',
      });
      return;
    }
    if (!VALID_STATUSES.has(status)) {
      res.status(400).json({ error: `Unknown reservation status: ${status}` });
      return;
    }
    const clientId = typeof doc.clientId === 'string' && doc.clientId ? doc.clientId : null;

    const existingRow = await pool.query(
      'SELECT coach_id, client_id, status, doc FROM lesson_reservations WHERE id = $1',
      [id]
    );
    const existing = existingRow.rows[0] ?? null;

    // Authorization. Coaches own their calendar; a client may claim an open
    // slot (existing row without client_id), write rows where they are the
    // client, or create new bookings for themselves. Admin tokens may write
    // (platform admin console); the coach linkage can never be reassigned by
    // a client.
    if (userRole === 'coach') {
      const owner = existing ? existing.coach_id : coachId;
      if (owner !== userId) {
        res.status(403).json({ error: 'Not your reservation' });
        return;
      }
    } else if (userRole === 'client') {
      const myIds = await getClientIds(userId);
      if (!myIds) {
        res.status(404).json({ error: 'Client not found' });
        return;
      }
      const claimable =
        !existing || !existing.client_id || myIds.includes(existing.client_id);
      const writesSelf = clientId !== null && myIds.includes(clientId);
      const keepsCoach = !existing || existing.coach_id === coachId;
      if (!claimable || !writesSelf || !keepsCoach) {
        res.status(403).json({ error: 'Not your reservation' });
        return;
      }
    } else if (userRole !== 'admin') {
      res.status(403).json({ error: 'Invalid user role' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO lesson_reservations (
         id, coach_id, client_id, status, start_time, end_time, starts_at, doc, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
       ON CONFLICT (id) DO UPDATE SET
         coach_id = EXCLUDED.coach_id,
         client_id = EXCLUDED.client_id,
         status = EXCLUDED.status,
         start_time = EXCLUDED.start_time,
         end_time = EXCLUDED.end_time,
         starts_at = EXCLUDED.starts_at,
         doc = EXCLUDED.doc,
         updated_at = now()
       RETURNING doc`,
      [id, coachId, clientId, status, startTime, endTime, parseNaiveKst(startTime), JSON.stringify(doc)]
    );

    recordEventSafe({
      actorId: userId,
      actorRole: userRole,
      eventType: !existing
        ? 'reservation.created'
        : existing.status !== status
          ? 'reservation.status_changed'
          : 'reservation.updated',
      entityType: 'lesson_reservation',
      entityId: id,
      studentUuid: userRole === 'client' ? userId : null,
      payload: {
        coachId,
        clientCompositeId: clientId,
        fromStatus: existing?.status ?? null,
        toStatus: status,
        startTime,
      },
    });

    res.json({ reservation: result.rows[0].doc });
  } catch (err) {
    console.error('[reservations] PUT /:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/reservations/:id — coaches remove their own AVAILABLE/BLOCKED
// slots; booked reservations are cancelled via status, not deletion.
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const { id } = req.params;

    const existingRow = await pool.query(
      'SELECT coach_id, client_id, status FROM lesson_reservations WHERE id = $1',
      [id]
    );
    const existing = existingRow.rows[0] ?? null;
    if (!existing) {
      res.json({ deleted: true, id });
      return;
    }

    const allowed =
      userRole === 'admin' || (userRole === 'coach' && existing.coach_id === userId);
    if (!allowed) {
      res.status(403).json({ error: 'Not your reservation' });
      return;
    }

    await pool.query('DELETE FROM lesson_reservations WHERE id = $1', [id]);
    recordEventSafe({
      actorId: userId,
      actorRole: userRole,
      eventType: 'reservation.deleted',
      entityType: 'lesson_reservation',
      entityId: id,
      payload: { coachId: existing.coach_id, fromStatus: existing.status },
    });
    res.json({ deleted: true, id });
  } catch (err) {
    console.error('[reservations] DELETE /:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
