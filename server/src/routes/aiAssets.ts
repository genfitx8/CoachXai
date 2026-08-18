import { Router, Request, Response } from 'express';
import pool from '../services/db';
import { authMiddleware } from '../middleware/auth';
import { recordEventSafe } from '../services/events';
import { getClientIds, getRosterClientIds } from '../services/identity';

/**
 * AI asset storage — Phase 1 server promotion (docs/DATA_ARCHITECTURE.md §5.6).
 *
 *   student-context     per-student AI memory (derived, rebuildable)
 *   exemplars           coach-style exemplar pool (fine-tuning gold data, §6.1)
 *   chat                student AI chat transcripts (thread-per-client doc)
 *   weekly-insights     generated weekly summaries
 *   handover-summaries  coach-change handover packages
 */

const router = Router();
router.use(authMiddleware);

/** May this token read/write the given client identity's assets? */
async function resolveClientAccess(
  req: Request,
  clientId: string
): Promise<'self' | 'coach' | 'admin' | null> {
  const user = req.user!;
  if (user.role === 'admin') return 'admin';
  if (user.role === 'client') {
    const myIds = await getClientIds(user.id);
    return myIds && myIds.includes(clientId) ? 'self' : null;
  }
  if (user.role === 'coach') {
    const roster = await getRosterClientIds(user.id);
    return roster.includes(clientId) ? 'coach' : null;
  }
  return null;
}

// ── Student context (AI memory) ─────────────────────────────────────────────

router.get('/student-context/:clientId', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const access = await resolveClientAccess(req, clientId);
    if (!access) {
      res.status(403).json({ error: 'Not allowed' });
      return;
    }
    const row = await pool.query('SELECT doc FROM student_contexts WHERE client_id = $1', [
      clientId,
    ]);
    res.json({ context: row.rows[0]?.doc ?? null });
  } catch (err) {
    console.error('[ai-assets] GET student-context error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/student-context/:clientId', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const access = await resolveClientAccess(req, clientId);
    if (!access) {
      res.status(403).json({ error: 'Not allowed' });
      return;
    }
    const doc = req.body as Record<string, unknown>;
    if (!doc || doc.clientId !== clientId) {
      res.status(400).json({ error: 'Context document with matching clientId required' });
      return;
    }
    await pool.query(
      `INSERT INTO student_contexts (client_id, doc, updated_at)
       VALUES ($1,$2, now())
       ON CONFLICT (client_id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
      [clientId, JSON.stringify(doc)]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[ai-assets] PUT student-context error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Coach style exemplars (fine-tuning gold data) ───────────────────────────

// GET /exemplars — a coach sees global rows + their own; admin sees all.
router.get('/exemplars', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    if (user.role === 'admin') {
      const rows = await pool.query('SELECT doc FROM coach_style_exemplars');
      res.json({ exemplars: rows.rows.map((r) => r.doc) });
      return;
    }
    if (user.role !== 'coach') {
      res.status(403).json({ error: 'Coaches only' });
      return;
    }
    const rows = await pool.query(
      'SELECT doc FROM coach_style_exemplars WHERE coach_id IS NULL OR coach_id = $1',
      [user.id]
    );
    res.json({ exemplars: rows.rows.map((r) => r.doc) });
  } catch (err) {
    console.error('[ai-assets] GET exemplars error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/exemplars/:id', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const doc = req.body as Record<string, unknown>;
    if (!doc || doc.id !== id || typeof doc.target !== 'string') {
      res.status(400).json({ error: 'Exemplar document with matching id and target required' });
      return;
    }
    const coachId = typeof doc.coachId === 'string' && doc.coachId ? doc.coachId : null;

    if (user.role === 'coach') {
      // A coach writes only coach-scoped exemplars under their own id.
      if (coachId !== user.id) {
        res.status(403).json({ error: 'Coaches can only save their own exemplars' });
        return;
      }
    } else if (user.role !== 'admin') {
      res.status(403).json({ error: 'Coaches only' });
      return;
    }

    await pool.query(
      `INSERT INTO coach_style_exemplars (id, coach_id, target, tier, doc, updated_at)
       VALUES ($1,$2,$3,$4,$5, now())
       ON CONFLICT (id) DO UPDATE SET
         coach_id = EXCLUDED.coach_id,
         target = EXCLUDED.target,
         tier = EXCLUDED.tier,
         doc = EXCLUDED.doc,
         updated_at = now()`,
      [
        id,
        coachId,
        doc.target,
        typeof doc.tier === 'number' ? doc.tier : 3,
        JSON.stringify(doc),
      ]
    );
    recordEventSafe({
      actorId: user.id,
      actorRole: user.role,
      eventType: 'ai.exemplar_saved',
      entityType: 'coach_style_exemplar',
      entityId: id,
      payload: {
        target: doc.target,
        source: doc.source ?? null,
        tier: doc.tier ?? 3,
        coachId,
      },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[ai-assets] PUT exemplar error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/exemplars/:id', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const existing = await pool.query(
      'SELECT coach_id FROM coach_style_exemplars WHERE id = $1',
      [id]
    );
    const row = existing.rows[0];
    if (!row) {
      res.json({ deleted: true, id });
      return;
    }
    const allowed =
      user.role === 'admin' || (user.role === 'coach' && row.coach_id === user.id);
    if (!allowed) {
      res.status(403).json({ error: 'Not your exemplar' });
      return;
    }
    await pool.query('DELETE FROM coach_style_exemplars WHERE id = $1', [id]);
    recordEventSafe({
      actorId: user.id,
      actorRole: user.role,
      eventType: 'ai.exemplar_deleted',
      entityType: 'coach_style_exemplar',
      entityId: id,
      payload: { coachId: row.coach_id },
    });
    res.json({ deleted: true, id });
  } catch (err) {
    console.error('[ai-assets] DELETE exemplar error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Student AI chat transcripts ─────────────────────────────────────────────
// Private to the student (and platform admin) — a coach never reads these.

async function chatAccess(req: Request, clientId: string): Promise<boolean> {
  const user = req.user!;
  if (user.role === 'admin') return true;
  if (user.role !== 'client') return false;
  const myIds = await getClientIds(user.id);
  return !!myIds && myIds.includes(clientId);
}

router.get('/chat/:clientId', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    if (!(await chatAccess(req, clientId))) {
      res.status(403).json({ error: 'Not allowed' });
      return;
    }
    const row = await pool.query('SELECT doc FROM chat_threads WHERE client_id = $1', [
      clientId,
    ]);
    res.json({ thread: row.rows[0]?.doc ?? null });
  } catch (err) {
    console.error('[ai-assets] GET chat error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/chat/:clientId', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    if (!(await chatAccess(req, clientId))) {
      res.status(403).json({ error: 'Not allowed' });
      return;
    }
    const doc = req.body as { v?: unknown; messages?: unknown[] };
    if (!doc || !Array.isArray(doc.messages)) {
      res.status(400).json({ error: 'Thread document with messages array required' });
      return;
    }
    if (doc.messages.length > 500) {
      res.status(400).json({ error: 'Thread too large' });
      return;
    }
    await pool.query(
      `INSERT INTO chat_threads (client_id, doc, message_count, updated_at)
       VALUES ($1,$2,$3, now())
       ON CONFLICT (client_id) DO UPDATE SET
         doc = EXCLUDED.doc,
         message_count = EXCLUDED.message_count,
         updated_at = now()`,
      [clientId, JSON.stringify(doc), doc.messages.length]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[ai-assets] PUT chat error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/chat/:clientId', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    if (!(await chatAccess(req, clientId))) {
      res.status(403).json({ error: 'Not allowed' });
      return;
    }
    await pool.query('DELETE FROM chat_threads WHERE client_id = $1', [clientId]);
    res.json({ deleted: true });
  } catch (err) {
    console.error('[ai-assets] DELETE chat error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Weekly insights ─────────────────────────────────────────────────────────

router.get('/weekly-insights', async (req: Request, res: Response) => {
  try {
    const clientId =
      typeof req.query.clientId === 'string' && req.query.clientId ? req.query.clientId : null;
    if (!clientId) {
      res.status(400).json({ error: 'clientId required' });
      return;
    }
    const access = await resolveClientAccess(req, clientId);
    if (!access) {
      res.status(403).json({ error: 'Not allowed' });
      return;
    }
    const rows = await pool.query(
      'SELECT doc FROM weekly_insights WHERE client_id = $1',
      [clientId]
    );
    res.json({ insights: rows.rows.map((r) => r.doc) });
  } catch (err) {
    console.error('[ai-assets] GET weekly-insights error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/weekly-insights/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const doc = req.body as Record<string, unknown>;
    const clientId = typeof doc?.clientId === 'string' ? doc.clientId : null;
    if (!doc || doc.id !== id || !clientId) {
      res.status(400).json({ error: 'Insight document with matching id and clientId required' });
      return;
    }
    const access = await resolveClientAccess(req, clientId);
    if (!access) {
      res.status(403).json({ error: 'Not allowed' });
      return;
    }
    await pool.query(
      `INSERT INTO weekly_insights (id, client_id, doc, updated_at)
       VALUES ($1,$2,$3, now())
       ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
      [id, clientId, JSON.stringify(doc)]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[ai-assets] PUT weekly-insight error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Handover summaries ──────────────────────────────────────────────────────

router.get('/handover-summaries', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    if (user.role === 'admin') {
      const rows = await pool.query('SELECT doc FROM handover_summaries');
      res.json({ summaries: rows.rows.map((r) => r.doc) });
      return;
    }
    if (user.role === 'coach') {
      const rows = await pool.query(
        'SELECT doc FROM handover_summaries WHERE to_coach_id = $1 OR from_coach_id = $1',
        [user.id]
      );
      res.json({ summaries: rows.rows.map((r) => r.doc) });
      return;
    }
    if (user.role === 'client') {
      const myIds = await getClientIds(user.id);
      if (!myIds) {
        res.status(404).json({ error: 'Client not found' });
        return;
      }
      const rows = await pool.query(
        'SELECT doc FROM handover_summaries WHERE client_id = ANY($1)',
        [myIds]
      );
      res.json({ summaries: rows.rows.map((r) => r.doc) });
      return;
    }
    res.status(403).json({ error: 'Invalid user role' });
  } catch (err) {
    console.error('[ai-assets] GET handover-summaries error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/handover-summaries/:id', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const doc = req.body as Record<string, unknown>;
    const clientId = typeof doc?.clientId === 'string' ? doc.clientId : null;
    if (!doc || doc.id !== id || !clientId) {
      res.status(400).json({ error: 'Summary document with matching id and clientId required' });
      return;
    }
    const fromCoachId = typeof doc.fromCoachId === 'string' ? doc.fromCoachId : null;
    const toCoachId = typeof doc.toCoachId === 'string' ? doc.toCoachId : null;

    // Writable by the student it belongs to, either involved coach, or admin.
    let allowed = user.role === 'admin';
    if (!allowed && user.role === 'client') {
      const myIds = await getClientIds(user.id);
      allowed = !!myIds && myIds.includes(clientId);
    }
    if (!allowed && user.role === 'coach') {
      allowed = user.id === fromCoachId || user.id === toCoachId;
    }
    if (!allowed) {
      res.status(403).json({ error: 'Not allowed' });
      return;
    }

    await pool.query(
      `INSERT INTO handover_summaries (id, client_id, from_coach_id, to_coach_id, doc, updated_at)
       VALUES ($1,$2,$3,$4,$5, now())
       ON CONFLICT (id) DO UPDATE SET
         client_id = EXCLUDED.client_id,
         from_coach_id = EXCLUDED.from_coach_id,
         to_coach_id = EXCLUDED.to_coach_id,
         doc = EXCLUDED.doc,
         updated_at = now()`,
      [id, clientId, fromCoachId, toCoachId, JSON.stringify(doc)]
    );
    recordEventSafe({
      actorId: user.id,
      actorRole: user.role,
      eventType: 'handover.summary_saved',
      entityType: 'handover_summary',
      entityId: id,
      payload: { clientCompositeId: clientId, fromCoachId, toCoachId },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[ai-assets] PUT handover-summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
