import { Router, Request, Response } from 'express';
import {
  AgentRuntimeError,
  getAgentRuntimeStatus,
  invokeAgentRuntime as invokeAgentRuntimeLegacy,
} from '../services/agentRuntime';
import {
  isAgentRuntimeConfigured,
  invokeAgentRuntime as invokeAgentPlatformRuntime,
  AgentRuntimeInvokeRequest,
} from '../services/agentPlatformRuntime';
import {
  isGeminiApiConfigured,
  invokeGeminiApi,
} from '../services/geminiApiRuntime';

type RuntimePart =
  | { text: string }
  | { inlineData: { data: string; mimeType: string } };

const isValidRuntimePart = (part: unknown): part is RuntimePart => {
  if (!part || typeof part !== 'object') return false;
  const p = part as Record<string, unknown>;
  if (typeof p.text === 'string') return true;
  if (
    p.inlineData &&
    typeof p.inlineData === 'object' &&
    typeof (p.inlineData as Record<string, unknown>).data === 'string' &&
    typeof (p.inlineData as Record<string, unknown>).mimeType === 'string'
  ) {
    return true;
  }
  return false;
};

const router = Router();

router.get('/status', (_req: Request, res: Response) => {
  const legacy = getAgentRuntimeStatus();
  res.json({
    ...legacy,
    agentPlatformConfigured: isAgentRuntimeConfigured(),
    geminiApiConfigured: isGeminiApiConfigured(),
  });
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

    const payloadObj =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};

    // Priority: Gemini API (AI Studio) > Agent Platform (Vertex) > legacy Agent Runtime.
    const rawParts = Array.isArray(payloadObj.mediaParts) ? payloadObj.mediaParts : [];
    const validParts = rawParts.filter(isValidRuntimePart);

    const runtimeRequest: AgentRuntimeInvokeRequest = {
      operation: feature,
      prompt: typeof payloadObj.prompt === 'string' ? payloadObj.prompt : undefined,
      parts: validParts.length > 0 ? validParts : undefined,
      responseMimeType:
        typeof payloadObj.responseMimeType === 'string'
          ? payloadObj.responseMimeType
          : undefined,
      temperature:
        typeof payloadObj.temperature === 'number'
          ? payloadObj.temperature
          : undefined,
    };

    if (isGeminiApiConfigured()) {
      const result = await invokeGeminiApi(runtimeRequest);
      res.json({ ok: true, result });
      return;
    }

    if (isAgentRuntimeConfigured()) {
      const result = await invokeAgentPlatformRuntime(runtimeRequest);
      res.json({ ok: true, result });
      return;
    }

    const result = await invokeAgentRuntimeLegacy(feature, payload ?? {});
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
