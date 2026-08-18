import { Router, Request, Response } from 'express';
import pool from '../services/db';
import { authMiddleware } from '../middleware/auth';
import { recordEventSafe } from '../services/events';

/**
 * Bay reservations — Phase 1 server promotion (docs/DATA_ARCHITECTURE.md §5.3).
 *
 * The deterministic slot id (`${branchId}_${bayId}_${YYYYMMDD}_${HH}`) is the
 * PRIMARY KEY, so exact-slot double-booking is impossible at the DB level;
 * multi-hour overlaps are checked inside the insert transaction. Validation
 * of opening hours / prices / points stays in the client service for now —
 * this route replaces its storage backend and hardens the booking conflict.
 */

const router = Router();
router.use(authMiddleware);

const BLOCKING_STATUSES = ['CONFIRMED', 'CANCEL_REQUESTED'];

/** Ledger/booking identities of the requester (composite kept until Phase 2). */
async function getOwnIdentities(userId: string, role: string): Promise<string[]> {
  if (role === 'coach') return [userId];
  if (role !== 'client') return [];
  const row = await pool.query('SELECT name, phone FROM clients WHERE id = $1', [userId]);
  if (row.rows.length === 0) return [userId];
  const { name, phone } = row.rows[0];
  const ids = [userId];
  if (name && phone) ids.push(`${name}_${phone}`);
  return ids;
}

function canManageBranch(req: Request, branchId: string): boolean {
  const user = req.user!;
  if (user.role === 'admin') return true;
  return user.role === 'branch_admin' && user.branchId === branchId;
}

/** Strip other people's PII from rows a client/coach sees while booking. */
function sanitizeDoc(doc: Record<string, unknown>, myIds: string[]): Record<string, unknown> {
  const clientId = doc.clientId;
  if (typeof clientId === 'string' && myIds.includes(clientId)) return doc;
  const { clientName: _n, clientPhone: _p, ...rest } = doc;
  void _n; void _p;
  return { ...rest, clientName: '', clientPhone: '' };
}

/** Hour range [start, end) of a reservation row, mirroring the client logic. */
function hourRange(startTime: string, endTime: string): [number, number] {
  const start = parseInt(startTime.slice(11, 13), 10);
  let end = parseInt(endTime.slice(11, 13), 10);
  const endMin = parseInt(endTime.slice(14, 16), 10) || 0;
  if (endMin > 0) end += 1;
  if (end <= start) end = start + 1;
  return [start, end];
}

// GET /api/bay-reservations?branchId=&dateFrom=&dateTo=
//   branch_admin/admin → branch rows; client/coach → own rows, or a branch's
//   rows sanitized (needed for client-side conflict checks while booking).
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const branchId =
      typeof req.query.branchId === 'string' && req.query.branchId ? req.query.branchId : null;
    const dateFrom =
      typeof req.query.dateFrom === 'string' && req.query.dateFrom ? req.query.dateFrom : null;
    const dateTo =
      typeof req.query.dateTo === 'string' && req.query.dateTo ? req.query.dateTo : null;

    if (branchId) {
      const result = await pool.query(
        `SELECT doc FROM bay_reservations
          WHERE branch_id = $1
            AND ($2::text IS NULL OR slot_date >= $2)
            AND ($3::text IS NULL OR slot_date <= $3)`,
        [branchId, dateFrom, dateTo]
      );
      if (canManageBranch(req, branchId)) {
        res.json({ reservations: result.rows.map((r) => r.doc) });
        return;
      }
      if (userRole === 'client' || userRole === 'coach') {
        const myIds = await getOwnIdentities(userId, userRole);
        res.json({ reservations: result.rows.map((r) => sanitizeDoc(r.doc, myIds)) });
        return;
      }
      res.status(403).json({ error: 'Invalid user role' });
      return;
    }

    if (userRole === 'admin') {
      const result = await pool.query('SELECT doc FROM bay_reservations');
      res.json({ reservations: result.rows.map((r) => r.doc) });
      return;
    }
    if (userRole === 'branch_admin') {
      const result = await pool.query(
        'SELECT doc FROM bay_reservations WHERE branch_id = $1',
        [req.user!.branchId ?? '']
      );
      res.json({ reservations: result.rows.map((r) => r.doc) });
      return;
    }

    const myIds = await getOwnIdentities(userId, userRole);
    const result = await pool.query(
      'SELECT doc FROM bay_reservations WHERE client_id = ANY($1)',
      [myIds]
    );
    res.json({ reservations: result.rows.map((r) => r.doc) });
  } catch (err) {
    console.error('[bay-reservations] GET / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/bay-reservations — create a booking. 409 on any blocking overlap.
router.post('/', async (req: Request, res: Response) => {
  const db = await pool.connect();
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const doc = req.body as Record<string, unknown>;

    const id = typeof doc?.id === 'string' && doc.id ? doc.id : null;
    const branchId = typeof doc?.branchId === 'string' && doc.branchId ? doc.branchId : null;
    const bayId = typeof doc?.bayId === 'string' && doc.bayId ? doc.bayId : null;
    const clientId = typeof doc?.clientId === 'string' && doc.clientId ? doc.clientId : null;
    const status = typeof doc?.status === 'string' ? doc.status : null;
    const startTime = typeof doc?.startTime === 'string' ? doc.startTime : null;
    const endTime = typeof doc?.endTime === 'string' ? doc.endTime : null;
    if (!id || !branchId || !bayId || !clientId || !status || !startTime || !endTime) {
      res.status(400).json({
        error: 'Reservation needs id, branchId, bayId, clientId, status, startTime, endTime',
      });
      return;
    }

    // Authorization: clients/coaches book for themselves; branch staff and
    // the platform admin create lesson-linked blocks for anyone.
    if (userRole === 'client' || userRole === 'coach') {
      const myIds = await getOwnIdentities(userId, userRole);
      if (!myIds.includes(clientId)) {
        res.status(403).json({ error: 'Not your reservation' });
        return;
      }
    } else if (!canManageBranch(req, branchId)) {
      res.status(403).json({ error: 'Not allowed for this branch' });
      return;
    }

    const slotDate = startTime.slice(0, 10);
    const [reqStart, reqEnd] = hourRange(startTime, endTime);

    await db.query('BEGIN');
    // Serialize bookings per bay+date so two overlap checks can't interleave.
    await db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${bayId}_${slotDate}`]);

    const existingRows = await db.query(
      `SELECT id, status, start_time, end_time FROM bay_reservations
        WHERE bay_id = $1 AND slot_date = $2 AND status = ANY($3)`,
      [bayId, slotDate, BLOCKING_STATUSES]
    );
    const conflict = existingRows.rows.find((r) => {
      if (r.id === id) return true; // exact slot already actively booked
      const [s, e] = hourRange(r.start_time, r.end_time);
      return s < reqEnd && reqStart < e;
    });
    if (conflict) {
      await db.query('ROLLBACK');
      res.status(409).json({ error: '이미 예약된 타석입니다. 다른 타석을 선택해주세요.' });
      return;
    }

    // A CANCELLED row can share the deterministic id — rebooking overwrites it.
    const result = await db.query(
      `INSERT INTO bay_reservations
         (id, branch_id, bay_id, client_id, status, start_time, end_time, slot_date, doc, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
       ON CONFLICT (id) DO UPDATE SET
         branch_id = EXCLUDED.branch_id,
         bay_id = EXCLUDED.bay_id,
         client_id = EXCLUDED.client_id,
         status = EXCLUDED.status,
         start_time = EXCLUDED.start_time,
         end_time = EXCLUDED.end_time,
         slot_date = EXCLUDED.slot_date,
         doc = EXCLUDED.doc,
         updated_at = now()
       RETURNING doc`,
      [id, branchId, bayId, clientId, status, startTime, endTime, slotDate, JSON.stringify(doc)]
    );
    await db.query('COMMIT');

    recordEventSafe({
      actorId: userId,
      actorRole: userRole,
      eventType: 'bay_reservation.created',
      entityType: 'bay_reservation',
      entityId: id,
      studentUuid: userRole === 'client' ? userId : null,
      payload: {
        branchId,
        bayId,
        startTime,
        paidPoints: typeof doc.paidPoints === 'number' ? doc.paidPoints : 0,
        lessonReservationId: doc.lessonReservationId ?? null,
      },
    });

    res.status(201).json({ reservation: result.rows[0].doc });
  } catch (err) {
    await db.query('ROLLBACK').catch(() => { /* already failed */ });
    console.error('[bay-reservations] POST / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    db.release();
  }
});

// PATCH /api/bay-reservations/:id — status transitions (cancel request /
// approve / reject / rollback).
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const { id } = req.params;
    const fields = req.body as Record<string, unknown>;
    const status = typeof fields?.status === 'string' ? fields.status : null;
    if (!status) {
      res.status(400).json({ error: 'status required' });
      return;
    }

    const existingRow = await pool.query(
      'SELECT branch_id, client_id, status, doc FROM bay_reservations WHERE id = $1',
      [id]
    );
    const existing = existingRow.rows[0];
    if (!existing) {
      res.status(404).json({ error: 'Reservation not found' });
      return;
    }

    if (userRole === 'client' || userRole === 'coach') {
      const myIds = await getOwnIdentities(userId, userRole);
      if (!myIds.includes(existing.client_id)) {
        res.status(403).json({ error: 'Not your reservation' });
        return;
      }
      // Members may request cancellation or roll back their own booking.
      if (status !== 'CANCEL_REQUESTED' && status !== 'CANCELLED') {
        res.status(403).json({ error: 'Members can only cancel or request cancellation' });
        return;
      }
    } else if (!canManageBranch(req, existing.branch_id)) {
      res.status(403).json({ error: 'Not allowed for this branch' });
      return;
    }

    const mergedDoc = { ...existing.doc, ...fields, id };
    const result = await pool.query(
      `UPDATE bay_reservations
          SET status = $1, doc = $2, updated_at = now()
        WHERE id = $3
        RETURNING doc`,
      [status, JSON.stringify(mergedDoc), id]
    );

    recordEventSafe({
      actorId: userId,
      actorRole: userRole,
      eventType: 'bay_reservation.status_changed',
      entityType: 'bay_reservation',
      entityId: id,
      studentUuid: userRole === 'client' ? userId : null,
      payload: { fromStatus: existing.status, toStatus: status },
    });

    res.json({ reservation: result.rows[0].doc });
  } catch (err) {
    console.error('[bay-reservations] PATCH /:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
