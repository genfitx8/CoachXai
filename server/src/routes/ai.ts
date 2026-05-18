import { Router, Request, Response } from 'express';
import {
  invokeAgentRuntime,
  isAgentRuntimeConfigured,
  AgentRuntimeInvokeRequest,
} from '../services/agentPlatformRuntime';

const router = Router();

router.get('/status', (_req: Request, res: Response) => {
  res.json({ configured: isAgentRuntimeConfigured() });
});

router.post('/invoke', async (req: Request, res: Response) => {
  if (!isAgentRuntimeConfigured()) {
    res.status(503).json({
      error:
        'Agent Platform runtime is not configured. Set AGENT_PLATFORM_RUNTIME_ENDPOINT or AGENT_PLATFORM_AGENT_RESOURCE.',
    });
    return;
  }

  const payload = req.body as Partial<AgentRuntimeInvokeRequest>;
  if (!payload?.operation || typeof payload.operation !== 'string') {
    res.status(400).json({ error: 'operation is required' });
    return;
  }

  try {
    const result = await invokeAgentRuntime({
      operation: payload.operation,
      prompt: typeof payload.prompt === 'string' ? payload.prompt : undefined,
      parts: Array.isArray(payload.parts)
        ? (payload.parts as AgentRuntimeInvokeRequest['parts'])
        : undefined,
      responseMimeType:
        typeof payload.responseMimeType === 'string'
          ? payload.responseMimeType
          : undefined,
      temperature:
        typeof payload.temperature === 'number' ? payload.temperature : undefined,
    });

    res.json(result);
  } catch (error) {
    console.error('[ai] invoke failed:', error);
    res.status(502).json({ error: (error as Error).message || 'AI invocation failed' });
  }
});

export default router;
