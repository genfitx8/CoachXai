import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../services/db';
import { authMiddleware } from '../middleware/auth';
import { recordEventSafe } from '../services/events';

/**
 * Branch domain — Phase 1 server promotion (docs/DATA_ARCHITECTURE.md §5.1).
 *
 * branches / bays / bay_price_rules store the verbatim client documents
 * (doc JSONB) + extracted key columns. Writes are restricted to the platform
 * admin and to branch_admin tokens scoped to their own branch. Reads are
 * open to any authenticated user — students and coaches need branch/bay
 * data to book.
 *
 * Branch-admin accounts live in branch_admins with bcrypt hashes only; the
 * legacy plaintext-password client document is accepted on write but its
 * password field is hashed and discarded, never stored.
 */

const router = Router();
router.use(authMiddleware);

const BCRYPT_ROUNDS = 10;

function canManageBranch(req: Request, branchId: string): boolean {
  const user = req.user!;
  if (user.role === 'admin') return true;
  return user.role === 'branch_admin' && user.branchId === branchId;
}

// ── Branches ────────────────────────────────────────────────────────────────

// GET /api/branches — every authenticated role (clients filter isActive locally)
router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT doc FROM branches ORDER BY created_at');
    res.json({ branches: result.rows.map((r) => r.doc) });
  } catch (err) {
    console.error('[branches] GET / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/branches/:id — full-document upsert
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!canManageBranch(req, id)) {
      res.status(403).json({ error: 'Not allowed for this branch' });
      return;
    }
    const doc = req.body as Record<string, unknown>;
    if (!doc || doc.id !== id || typeof doc.name !== 'string' || doc.name.length === 0) {
      res.status(400).json({ error: 'Branch document with matching id and name required' });
      return;
    }
    const result = await pool.query(
      `INSERT INTO branches (id, name, is_active, doc, updated_at)
       VALUES ($1,$2,$3,$4, now())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         is_active = EXCLUDED.is_active,
         doc = EXCLUDED.doc,
         updated_at = now()
       RETURNING doc`,
      [id, doc.name, doc.isActive !== false, JSON.stringify(doc)]
    );
    recordEventSafe({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      eventType: 'branch.upserted',
      entityType: 'branch',
      entityId: id,
      payload: { name: doc.name, isActive: doc.isActive !== false },
    });
    res.json({ branch: result.rows[0].doc });
  } catch (err) {
    console.error('[branches] PUT /:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Bays ────────────────────────────────────────────────────────────────────

router.get('/:branchId/bays', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT doc FROM bays WHERE branch_id = $1 ORDER BY created_at',
      [req.params.branchId]
    );
    res.json({ bays: result.rows.map((r) => r.doc) });
  } catch (err) {
    console.error('[branches] GET /:branchId/bays error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:branchId/bays/:bayId', async (req: Request, res: Response) => {
  try {
    const { branchId, bayId } = req.params;
    if (!canManageBranch(req, branchId)) {
      res.status(403).json({ error: 'Not allowed for this branch' });
      return;
    }
    const doc = req.body as Record<string, unknown>;
    if (!doc || doc.id !== bayId || doc.branchId !== branchId) {
      res.status(400).json({ error: 'Bay document with matching id and branchId required' });
      return;
    }
    const result = await pool.query(
      `INSERT INTO bays (id, branch_id, is_active, doc, updated_at)
       VALUES ($1,$2,$3,$4, now())
       ON CONFLICT (id) DO UPDATE SET
         branch_id = EXCLUDED.branch_id,
         is_active = EXCLUDED.is_active,
         doc = EXCLUDED.doc,
         updated_at = now()
       RETURNING doc`,
      [bayId, branchId, doc.isActive !== false, JSON.stringify(doc)]
    );
    res.json({ bay: result.rows[0].doc });
  } catch (err) {
    console.error('[branches] PUT bay error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:branchId/bays/:bayId', async (req: Request, res: Response) => {
  try {
    const { branchId, bayId } = req.params;
    if (!canManageBranch(req, branchId)) {
      res.status(403).json({ error: 'Not allowed for this branch' });
      return;
    }
    await pool.query('DELETE FROM bays WHERE id = $1 AND branch_id = $2', [bayId, branchId]);
    res.json({ deleted: true, id: bayId });
  } catch (err) {
    console.error('[branches] DELETE bay error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Price rules ─────────────────────────────────────────────────────────────

router.get('/:branchId/price-rules', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT doc FROM bay_price_rules WHERE branch_id = $1 ORDER BY created_at',
      [req.params.branchId]
    );
    res.json({ priceRules: result.rows.map((r) => r.doc) });
  } catch (err) {
    console.error('[branches] GET price-rules error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:branchId/price-rules/:ruleId', async (req: Request, res: Response) => {
  try {
    const { branchId, ruleId } = req.params;
    if (!canManageBranch(req, branchId)) {
      res.status(403).json({ error: 'Not allowed for this branch' });
      return;
    }
    const doc = req.body as Record<string, unknown>;
    if (!doc || doc.id !== ruleId || doc.branchId !== branchId) {
      res.status(400).json({ error: 'Price rule document with matching id and branchId required' });
      return;
    }
    const result = await pool.query(
      `INSERT INTO bay_price_rules (id, branch_id, is_active, doc, updated_at)
       VALUES ($1,$2,$3,$4, now())
       ON CONFLICT (id) DO UPDATE SET
         branch_id = EXCLUDED.branch_id,
         is_active = EXCLUDED.is_active,
         doc = EXCLUDED.doc,
         updated_at = now()
       RETURNING doc`,
      [ruleId, branchId, doc.isActive !== false, JSON.stringify(doc)]
    );
    res.json({ priceRule: result.rows[0].doc });
  } catch (err) {
    console.error('[branches] PUT price-rule error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:branchId/price-rules/:ruleId', async (req: Request, res: Response) => {
  try {
    const { branchId, ruleId } = req.params;
    if (!canManageBranch(req, branchId)) {
      res.status(403).json({ error: 'Not allowed for this branch' });
      return;
    }
    await pool.query('DELETE FROM bay_price_rules WHERE id = $1 AND branch_id = $2', [
      ruleId,
      branchId,
    ]);
    res.json({ deleted: true, id: ruleId });
  } catch (err) {
    console.error('[branches] DELETE price-rule error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Branch-admin accounts (platform admin only) ─────────────────────────────

/** Sanitized account shape — the hash never leaves the server, and the
 * legacy client type's plaintext `password` field is returned empty. */
function mapAccount(row: Record<string, unknown>) {
  return {
    id: row.id,
    branchId: row.branch_id,
    username: row.username,
    password: '',
    isActive: row.is_active,
    createdAt: new Date(row.created_at as string).getTime(),
  };
}

router.get('/:branchId/admins', async (req: Request, res: Response) => {
  try {
    const { branchId } = req.params;
    if (req.user!.role !== 'admin' && !canManageBranch(req, branchId)) {
      res.status(403).json({ error: 'Admin only' });
      return;
    }
    const all = branchId === '_all' && req.user!.role === 'admin';
    const result = await pool.query(
      all
        ? 'SELECT * FROM branch_admins ORDER BY created_at'
        : 'SELECT * FROM branch_admins WHERE branch_id = $1 ORDER BY created_at',
      all ? [] : [branchId]
    );
    res.json({ accounts: result.rows.map(mapAccount) });
  } catch (err) {
    console.error('[branches] GET admins error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/branches/:branchId/admins/:username — create/update an account.
// Body may carry a plaintext `password` (legacy client shape); it is hashed
// here and never stored. Omitting it on update keeps the existing hash.
router.put('/:branchId/admins/:username', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Admin only' });
      return;
    }
    const { branchId, username } = req.params;
    const { password, isActive } = req.body as { password?: string; isActive?: boolean };
    const id = `${branchId}:${username}`;

    const existing = await pool.query('SELECT id FROM branch_admins WHERE id = $1', [id]);
    if (existing.rows.length === 0 && (!password || password.length < 4)) {
      res.status(400).json({ error: 'New accounts need a password of 4+ characters' });
      return;
    }

    const passwordHash = password ? await bcrypt.hash(password, BCRYPT_ROUNDS) : null;
    const result = await pool.query(
      `INSERT INTO branch_admins (id, branch_id, username, password_hash, is_active, updated_at)
       VALUES ($1,$2,$3,$4,$5, now())
       ON CONFLICT (id) DO UPDATE SET
         password_hash = COALESCE($4, branch_admins.password_hash),
         is_active = $5,
         updated_at = now()
       RETURNING *`,
      [id, branchId, username, passwordHash, isActive !== false]
    );
    recordEventSafe({
      actorId: req.user!.id,
      actorRole: 'admin',
      eventType: existing.rows.length === 0 ? 'branch_admin.created' : 'branch_admin.updated',
      entityType: 'branch_admin',
      entityId: id,
      payload: { branchId, username, isActive: isActive !== false },
    });
    res.json({ account: mapAccount(result.rows[0]) });
  } catch (err) {
    console.error('[branches] PUT admin error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:branchId/admins/:username', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Admin only' });
      return;
    }
    const { branchId, username } = req.params;
    const id = `${branchId}:${username}`;
    await pool.query('DELETE FROM branch_admins WHERE id = $1', [id]);
    recordEventSafe({
      actorId: req.user!.id,
      actorRole: 'admin',
      eventType: 'branch_admin.deleted',
      entityType: 'branch_admin',
      entityId: id,
      payload: { branchId, username },
    });
    res.json({ deleted: true, id });
  } catch (err) {
    console.error('[branches] DELETE admin error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
