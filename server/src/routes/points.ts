import { Router, Request, Response } from 'express';
import pool from '../services/db';
import { authMiddleware } from '../middleware/auth';
import { recordEventSafe } from '../services/events';
import { applyPointDelta } from '../services/pointBalance';

/**
 * Point ledger — Phase 1 server promotion (docs/DATA_ARCHITECTURE.md §5.3).
 *
 * point_transactions is the single ledger; clients/coaches.current_points
 * are derived balances the server maintains transactionally. Top-up types
 * are rejected here — the payment-confirm flow (pointCredit) owns them, so
 * a client can never mint a top-up row.
 */

const router = Router();
router.use(authMiddleware);

// Self-service earn/spend rules for client tokens. The client UI awards
// fixed rule amounts (POINT_RULES in services/pointService.ts); the caps
// here just stop a tampered client from self-granting arbitrary points.
const CLIENT_TYPE_RULES: Record<string, { min: number; max: number }> = {
  HOMEWORK: { min: 1, max: 200 },
  LESSON_RECORD: { min: 1, max: 200 },
  ATTENDANCE: { min: 1, max: 100 },
  PURCHASE: { min: -1_000_000, max: -1 }, // spending is always negative
};

/** Ledger identities the requester may write/read rows under. */
async function getOwnIdentities(userId: string, role: string): Promise<string[] | null> {
  if (role === 'coach') return [`coach_${userId}`];
  if (role !== 'client') return null;
  const row = await pool.query('SELECT name, phone FROM clients WHERE id = $1', [userId]);
  if (row.rows.length === 0) return null;
  const { name, phone } = row.rows[0];
  const ids = [userId];
  if (name && phone) ids.push(`${name}_${phone}`);
  return ids;
}

/** Ledger row → client PointTransaction document. */
function mapTransaction(row: Record<string, unknown>): Record<string, unknown> {
  if (row.doc && typeof row.doc === 'object') return row.doc as Record<string, unknown>;
  // Legacy rows (payment audit) predate the doc column — reconstruct.
  return {
    id: row.id,
    clientId: row.client_id,
    amount: row.amount,
    type: row.type,
    description: row.description ?? '',
    ...(row.granted_by ? { grantedBy: row.granted_by } : {}),
    ...(row.recipient_type ? { recipientType: row.recipient_type } : {}),
    ...(row.memo ? { memo: row.memo } : {}),
    createdAt: Number(row.created_at),
  };
}

// GET /api/points/transactions — own ledger rows (admin: all rows)
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;

    if (userRole === 'admin') {
      const result = await pool.query(
        'SELECT * FROM point_transactions ORDER BY created_at DESC'
      );
      res.json({ transactions: result.rows.map(mapTransaction) });
      return;
    }

    const myIds = await getOwnIdentities(userId, userRole);
    if (!myIds) {
      res.status(userRole === 'client' ? 404 : 403).json({ error: 'Not allowed' });
      return;
    }
    const result = await pool.query(
      'SELECT * FROM point_transactions WHERE client_id = ANY($1) ORDER BY created_at DESC',
      [myIds]
    );
    res.json({ transactions: result.rows.map(mapTransaction) });
  } catch (err) {
    console.error('[points] GET /transactions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/points/transactions — append one ledger row and apply the balance
// atomically. The transaction id is the idempotency key: a re-send inserts
// nothing and applies nothing.
router.post('/transactions', async (req: Request, res: Response) => {
  const db = await pool.connect();
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const tx = (req.body as { transaction?: Record<string, unknown> })?.transaction;

    if (!tx || typeof tx !== 'object') {
      res.status(400).json({ error: 'transaction required' });
      return;
    }
    const id = typeof tx.id === 'string' && tx.id.length > 0 ? tx.id : null;
    const clientId = typeof tx.clientId === 'string' && tx.clientId.length > 0 ? tx.clientId : null;
    const amount = Number.isInteger(tx.amount) ? (tx.amount as number) : null;
    const type = typeof tx.type === 'string' ? tx.type : null;
    if (!id || !clientId || amount === null || amount === 0 || !type) {
      res.status(400).json({ error: 'transaction needs id, clientId, non-zero integer amount, type' });
      return;
    }
    if (type.startsWith('POINT_TOPUP')) {
      res.status(403).json({ error: 'Top-ups are credited by the payment flow' });
      return;
    }

    if (userRole === 'client') {
      const myIds = await getOwnIdentities(userId, userRole);
      if (!myIds) {
        res.status(404).json({ error: 'Client not found' });
        return;
      }
      if (!myIds.includes(clientId)) {
        res.status(403).json({ error: 'Not your ledger' });
        return;
      }
      const rule = CLIENT_TYPE_RULES[type];
      if (!rule) {
        res.status(403).json({ error: `Type not allowed for clients: ${type}` });
        return;
      }
      if (amount < rule.min || amount > rule.max) {
        res.status(400).json({ error: `Amount out of range for ${type}` });
        return;
      }
    } else if (userRole === 'coach') {
      // A coach's only self-service ledger write is spending their own
      // points (bay bookings): PURCHASE, negative, on their own identity.
      if (clientId !== `coach_${userId}`) {
        res.status(403).json({ error: 'Not your ledger' });
        return;
      }
      if (type !== 'PURCHASE' || amount >= 0 || amount < -1_000_000) {
        res.status(403).json({ error: 'Coaches can only spend their own points' });
        return;
      }
    } else if (userRole === 'branch_admin') {
      // Branch staff grant points to members/coaches at their branch.
      if (type !== 'BRANCH_ADMIN_GRANT' || amount <= 0 || amount > 1_000_000) {
        res.status(403).json({ error: 'Branch admins can only grant 1..1,000,000 points' });
        return;
      }
    } else if (userRole !== 'admin') {
      res.status(403).json({ error: 'Invalid role for ledger writes' });
      return;
    }

    await db.query('BEGIN');
    const inserted = await db.query(
      `INSERT INTO point_transactions
         (id, client_id, amount, type, description, order_id, granted_by, recipient_type, memo, doc, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        clientId,
        amount,
        type,
        typeof tx.description === 'string' ? tx.description : '',
        typeof tx.orderId === 'string' ? tx.orderId : null,
        typeof tx.grantedBy === 'string' ? tx.grantedBy : null,
        typeof tx.recipientType === 'string' ? tx.recipientType : null,
        typeof tx.memo === 'string' ? tx.memo : null,
        JSON.stringify(tx),
        typeof tx.createdAt === 'number' ? tx.createdAt : Date.now(),
      ]
    );

    let balance: number | null = null;
    if (inserted.rowCount && inserted.rowCount > 0) {
      balance = await applyPointDelta(clientId, amount, db);
    } else {
      // Idempotent replay: report the current balance without re-applying.
      balance = await applyPointDelta(clientId, 0, db);
    }
    await db.query('COMMIT');

    if (inserted.rowCount && inserted.rowCount > 0) {
      recordEventSafe({
        actorId: userId,
        actorRole: userRole,
        eventType: amount > 0 ? 'point.earned' : 'point.spent',
        entityType: 'point_transaction',
        entityId: id,
        studentUuid: userRole === 'client' ? userId : null,
        payload: { type, amount, ledgerId: clientId },
      });
    }

    res.status(201).json({ transaction: tx, balance });
  } catch (err) {
    await db.query('ROLLBACK').catch(() => { /* already failed */ });
    console.error('[points] POST /transactions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    db.release();
  }
});

// POST /api/points/transactions/import — audit-only backfill of device-local
// ledger history. Never touches balances: local balances already flowed into
// profiles via profile sync, so re-applying would double-count.
router.post('/transactions/import', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const list = (req.body as { transactions?: unknown[] })?.transactions;
    if (!Array.isArray(list)) {
      res.status(400).json({ error: 'transactions array required' });
      return;
    }
    if (list.length > 1000) {
      res.status(400).json({ error: 'import batch too large' });
      return;
    }

    const myIds = await getOwnIdentities(userId, userRole);
    if (!myIds) {
      res.status(403).json({ error: 'Not allowed' });
      return;
    }

    let imported = 0;
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const tx = item as Record<string, unknown>;
      if (
        typeof tx.id !== 'string' || tx.id.length === 0 ||
        typeof tx.clientId !== 'string' || !myIds.includes(tx.clientId) ||
        !Number.isInteger(tx.amount) || typeof tx.type !== 'string'
      ) {
        continue; // skip rows that aren't ours / aren't well-formed
      }
      const result = await pool.query(
        `INSERT INTO point_transactions
           (id, client_id, amount, type, description, granted_by, recipient_type, memo, doc, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO NOTHING`,
        [
          tx.id,
          tx.clientId,
          tx.amount,
          tx.type,
          typeof tx.description === 'string' ? tx.description : '',
          typeof tx.grantedBy === 'string' ? tx.grantedBy : null,
          typeof tx.recipientType === 'string' ? tx.recipientType : null,
          typeof tx.memo === 'string' ? tx.memo : null,
          JSON.stringify(tx),
          typeof tx.createdAt === 'number' ? tx.createdAt : Date.now(),
        ]
      );
      if (result.rowCount && result.rowCount > 0) imported += 1;
    }

    res.json({ imported });
  } catch (err) {
    console.error('[points] POST /transactions/import error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
