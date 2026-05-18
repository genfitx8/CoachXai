import { Router, Request, Response } from 'express';
import {
  AgentRuntimeError,
  getAgentRuntimeStatus,
  invokeAgentRuntime,
} from '../services/agentRuntime';

const router = Router();

router.get('/status', (_req: Request, res: Response) => {
  res.json(getAgentRuntimeStatus());
});

router.post('/invoke', async (req: Request, res: Response) => {
  try {
    const { feature, payload } = req.body as {
      feature?: string;
      payload?: unknown;
    };

    if (!feature || typeof feature !== 'string') {
      res.status(400).json({ ok: false, error: 'feature is required' });
      return;
    }

    const result = await invokeAgentRuntime(feature, payload ?? {});
    res.json({ ok: true, result });
  } catch (error) {
    if (error instanceof AgentRuntimeError) {
      res
        .status(error.statusCode)
        .json({ ok: false, error: error.message, fallback: true });
      return;
    }

    console.error('[ai] POST /invoke error:', error);
    res
      .status(500)
      .json({ ok: false, error: 'Internal AI gateway error', fallback: true });
  }
});

export default router;
