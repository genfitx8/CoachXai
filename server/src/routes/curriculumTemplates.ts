import { Router, Request, Response } from 'express';
import pool from '../services/db';
import { adminAuthMiddleware } from '../middleware/adminAuth';

const router = Router();
router.use(adminAuthMiddleware);

function mapTemplate(row: Record<string, unknown>) {
  return {
    partKey: row.part_key,
    order: row.part_order,
    title: row.title,
    content: row.content,
    keyPoints: row.key_points ?? [],
    updatedAt: row.updated_at,
  };
}

// GET /api/curriculum-templates
router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM curriculum_part_templates ORDER BY part_order ASC'
    );
    res.json(result.rows.map(mapTemplate));
  } catch (err) {
    console.error('[curriculum-templates] list error:', err);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

// PUT /api/curriculum-templates/:partKey
router.put('/:partKey', async (req: Request, res: Response) => {
  try {
    const { partKey } = req.params;
    const { title, content, keyPoints } = req.body;
    const now = Date.now();

    const result = await pool.query(
      `UPDATE curriculum_part_templates SET title=$1, content=$2, key_points=$3, updated_at=$4
       WHERE part_key=$5 RETURNING *`,
      [title, content ?? null, JSON.stringify(keyPoints ?? []), now, partKey]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(mapTemplate(result.rows[0]));
  } catch (err) {
    console.error('[curriculum-templates] update error:', err);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

export default router;
