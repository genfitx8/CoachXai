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
  streamGeminiApi,
} from '../services/geminiApiRuntime';
import { resolveModel } from '../services/modelRouter';

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

// Per-feature default temperatures.
// Applied only when the client did not send an explicit temperature.
// Rationale: JSON extraction / OCR-style features need low creativity for
// accurate readings; conversational / analytical features need higher.
const DEFAULT_TEMPERATURE_BY_FEATURE: Record<string, number> = {
  // OCR / structured data extraction — must read numbers accurately.
  extract_golf_data: 0.1,
  analyze_trackman_screen: 0.1,
  analyze_equipment_photo: 0.1,
  analyze_body_photos: 0.2,
  swing_phase_timestamps: 0.2,
  hole_voice_summary: 0.2,
  motion_capture_analysis: 0.3,

  // Analytical / summarization — mostly deterministic with light phrasing.
  lesson_summary: 0.4,
  compare_swings: 0.4,
  weekly_insight: 0.5,
  coachx_insights: 0.6,

  // Generative / conversational — needs warmth and variety.
  training_program: 0.7,
  golf_missions: 0.7,
  coachx_chat: 0.7,
  student_chat: 0.7,
  coachx_growth_profile: 0.7,

  // Meta-extraction — reading a coach's document to produce a systemPrompt.
  // Moderate temp: enough creativity to phrase well, low enough to stay faithful.
  generate_system_prompt: 0.4,

  // Interview mode — AI asks coach one question at a time to extract
  // methodology. Higher temp keeps the questions varied and probing.
  generate_interview_question: 0.7,

  // Shot data synthesis — data-heavy analytical report. Low temp keeps
  // numbers and conclusions faithful to the input data.
  shot_analysis: 0.3,

  // Swing coaching report — cross-references pose metrics with student
  // shot / lesson history. Must quote exact numbers back verbatim, so we
  // stay on the low side; a bit above OCR because the prose bits
  // (headline, recommendations) benefit from mild variety.
  swing_coaching_report: 0.35,
};

const resolveTemperature = (
  feature: string,
  explicit: number | undefined
): number | undefined => {
  if (explicit !== undefined) return explicit;
  return DEFAULT_TEMPERATURE_BY_FEATURE[feature];
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
      responseSchema:
        payloadObj.responseSchema && typeof payloadObj.responseSchema === 'object'
          ? payloadObj.responseSchema
          : undefined,
      systemInstruction:
        typeof payloadObj.systemInstruction === 'string'
          ? payloadObj.systemInstruction
          : undefined,
      temperature: resolveTemperature(
        feature,
        typeof payloadObj.temperature === 'number' ? payloadObj.temperature : undefined
      ),
      model: resolveModel(feature, {
        explicit: typeof payloadObj.model === 'string' ? payloadObj.model : undefined,
      }),
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

/**
 * Streaming variant of /invoke. Currently supports the Gemini API runtime
 * only — Agent Platform / legacy runtimes fall through with a 501 so the
 * client can gracefully fall back to the non-streaming path.
 *
 * Response is Server-Sent Events:
 *   event: chunk    data: {"text": "…"}
 *   event: done     data: {"status": "ok"}
 *   event: error    data: {"message": "…"}
 *
 * Chunks are yielded as they arrive from Gemini so the client can render
 * incrementally. The server never buffers the full response.
 */
router.post('/invoke-stream', async (req: Request, res: Response) => {
  const { feature, payload } = req.body as {
    feature?: string;
    payload?: unknown;
  };

  if (!feature || typeof feature !== 'string') {
    res.status(400).json({ ok: false, error: 'feature is required' });
    return;
  }

  if (!isGeminiApiConfigured()) {
    res
      .status(501)
      .json({ ok: false, error: 'streaming requires GEMINI_API_KEY runtime' });
    return;
  }

  const payloadObj =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
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
    responseSchema:
      payloadObj.responseSchema && typeof payloadObj.responseSchema === 'object'
        ? payloadObj.responseSchema
        : undefined,
    systemInstruction:
      typeof payloadObj.systemInstruction === 'string'
        ? payloadObj.systemInstruction
        : undefined,
    temperature: resolveTemperature(
      feature,
      typeof payloadObj.temperature === 'number' ? payloadObj.temperature : undefined
    ),
    model: resolveModel(feature, {
      explicit: typeof payloadObj.model === 'string' ? payloadObj.model : undefined,
    }),
  };

  // SSE headers — set before the first write so intermediaries flush per-event.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering (nginx)
  res.flushHeaders?.();

  const writeEvent = (event: string, data: unknown): void => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // If the client disconnects mid-stream we still finish reading the
  // upstream so we don't leak; but stop writing to the closed socket.
  let clientClosed = false;
  req.on('close', () => {
    clientClosed = true;
  });

  try {
    for await (const item of streamGeminiApi(runtimeRequest)) {
      if (clientClosed) break;
      if (item.type === 'meta') {
        writeEvent('meta', { model: item.model });
      } else {
        writeEvent('chunk', { text: item.text });
      }
    }
    if (!clientClosed) writeEvent('done', { status: 'ok' });
  } catch (error) {
    if (!clientClosed) {
      writeEvent('error', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    console.error('[ai] POST /invoke-stream error:', error);
  } finally {
    if (!clientClosed) res.end();
  }
});

export default router;
