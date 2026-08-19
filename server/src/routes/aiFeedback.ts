import { Router, Request, Response } from 'express';
import pool from '../services/db';
import { authMiddleware } from '../middleware/auth';
import { AiFeedbackKind, recordAiFeedback } from '../services/aiFeedback';

/**
 * AI 피드백 이벤트 (docs/DATA_ARCHITECTURE.md §5.5, §6.2).
 *
 * 별도 라벨링 UI를 만들지 않는다 — 코치가 이미 하는 행동(별표·수정·
 * 반려·재생성·승인 취소)을 그대로 라벨로 적는다. coach_style_exemplars가
 * "좋다고 한 것"만 남기는 데 비해, 이 표는 **원안과 최종본을 함께** 남겨
 * 선호 학습(DPO)의 chosen/rejected 페어가 되고, 부정 신호(regenerated,
 * dissent, approval_undo)는 하드 네거티브가 된다.
 */

const router = Router();
router.use(authMiddleware);

const ALLOWED_KINDS = new Set([
  'starred',
  'edited',
  'dissent',
  'regenerated',
  'approval_undo',
  'thumbs_up',
  'thumbs_down',
]);

// POST /api/ai-feedback — 라벨 한 건 기록.
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      kind,
      target,
      entityType,
      entityId,
      originalOutput,
      finalOutput,
      tier,
      note,
      interactionId,
    } = req.body as Record<string, unknown>;

    if (typeof kind !== 'string' || !ALLOWED_KINDS.has(kind)) {
      res.status(400).json({ error: 'Unknown feedback kind' });
      return;
    }

    const id = await recordAiFeedback({
      userId: req.user!.id,
      userRole: req.user!.role,
      kind: kind as AiFeedbackKind,
      target: typeof target === 'string' ? target : null,
      entityType: typeof entityType === 'string' ? entityType : null,
      entityId: typeof entityId === 'string' ? entityId : null,
      originalOutput: typeof originalOutput === 'string' ? originalOutput : null,
      finalOutput: typeof finalOutput === 'string' ? finalOutput : null,
      tier: typeof tier === 'number' ? tier : null,
      note: typeof note === 'string' ? note : null,
      interactionId: typeof interactionId === 'string' ? interactionId : null,
    });

    res.status(201).json({ id });
  } catch (err) {
    console.error('[ai-feedback] POST / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/ai-feedback/summary — 관리자 관측용 kind별 집계.
router.get('/summary', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Admin only' });
      return;
    }
    const rows = await pool.query(
      `SELECT kind,
              COUNT(*)::int AS count,
              COUNT(*) FILTER (WHERE original_output IS NOT NULL
                                 AND final_output IS NOT NULL)::int AS pair_count,
              MAX(created_at) AS last_at
         FROM ai_feedback_events
        GROUP BY kind
        ORDER BY count DESC`
    );
    res.json({
      summary: rows.rows.map((r) => ({
        kind: r.kind as string,
        count: r.count as number,
        /** 원안·최종본이 모두 있는 행 = 그대로 학습쌍이 되는 건수. */
        pairCount: r.pair_count as number,
        lastAt: r.last_at ? new Date(r.last_at).toISOString() : null,
      })),
    });
  } catch (err) {
    console.error('[ai-feedback] GET /summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
