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
import { optionalAuth } from '../middleware/auth';
import {
  AiInteractionEntry,
  hashPrompt,
  logAiInteraction,
} from '../services/aiInteractionLog';

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

  // 레슨 오디오 세그먼트 전사+노트 추출 — 들리는 내용에 충실해야 하므로
  // OCR 수준으로 낮게 유지한다.
  lesson_audio_segment: 0.2,
  // ~10초 구간 받아쓰기(필기 노트) — 순수 전사라 최저 온도.
  lesson_audio_transcribe: 0.1,

  // Analytical / summarization — mostly deterministic with light phrasing.
  lesson_summary: 0.4,
  // 세그먼트 노트 → 최종 리포트 병합(map-reduce reduce 단계). 톤은
  // lesson_summary 와 동일하게 맞춘다.
  lesson_summary_merge: 0.4,
  // 레슨 진행 중 화면에 띄우는 롤링 요약 — 짧은 불릿 재생성이 잦으므로
  // 흔들림 없이 노트에 충실해야 한다.
  lesson_live_summary: 0.3,
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

// Best-effort response-text length for telemetry: runtimes return either a
// string or an object carrying a `text` field; anything else stays unmeasured.
const extractTextLength = (result: unknown): number | null => {
  if (typeof result === 'string') return result.length;
  if (result && typeof result === 'object') {
    const text = (result as Record<string, unknown>).text;
    if (typeof text === 'string') return text.length;
  }
  return null;
};

const router = Router();

// Attach the caller's identity to ai_interactions rows when a token is
// present, without turning the AI gateway into an auth wall.
router.use(optionalAuth);

router.get('/status', (_req: Request, res: Response) => {
  const legacy = getAgentRuntimeStatus();
  res.json({
    ...legacy,
    agentPlatformConfigured: isAgentRuntimeConfigured(),
    geminiApiConfigured: isGeminiApiConfigured(),
  });
});

router.post('/invoke', async (req: Request, res: Response) => {
  const startedAt = Date.now();
  // Telemetry base survives into the catch block; null until the request parses.
  let telemetry: Omit<AiInteractionEntry, 'latencyMs' | 'status'> | null = null;
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

    telemetry = {
      userId: req.user?.id ?? null,
      userRole: req.user?.role ?? null,
      feature,
      model: runtimeRequest.model ?? null,
      runtime: 'agent_legacy',
      promptChars:
        (runtimeRequest.prompt?.length ?? 0) +
        (runtimeRequest.systemInstruction?.length ?? 0),
      promptHash: hashPrompt(runtimeRequest.prompt),
      hasSchema: Boolean(runtimeRequest.responseSchema),
      mediaPartCount: validParts.length,
    };

    if (isGeminiApiConfigured()) {
      telemetry.runtime = 'gemini_api';
      const result = await invokeGeminiApi(runtimeRequest);
      logAiInteraction({
        ...telemetry,
        model: result.model ?? telemetry.model,
        responseChars: result.text.length,
        latencyMs: Date.now() - startedAt,
        status: 'success',
      });
      res.json({ ok: true, result });
      return;
    }

    if (isAgentRuntimeConfigured()) {
      telemetry.runtime = 'agent_platform';
      const result = await invokeAgentPlatformRuntime(runtimeRequest);
      logAiInteraction({
        ...telemetry,
        responseChars: extractTextLength(result),
        latencyMs: Date.now() - startedAt,
        status: 'success',
      });
      res.json({ ok: true, result });
      return;
    }

    const result = await invokeAgentRuntimeLegacy(feature, payload ?? {});
    logAiInteraction({
      ...telemetry,
      responseChars: extractTextLength(result),
      latencyMs: Date.now() - startedAt,
      status: 'success',
    });
    res.json({ ok: true, result });
  } catch (error) {
    if (telemetry) {
      logAiInteraction({
        ...telemetry,
        latencyMs: Date.now() - startedAt,
        status: error instanceof AgentRuntimeError ? 'fallback' : 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
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

  const startedAt = Date.now();
  let streamedModel: string | null = runtimeRequest.model ?? null;
  let responseChars = 0;
  const telemetry: Omit<AiInteractionEntry, 'latencyMs' | 'status'> = {
    userId: req.user?.id ?? null,
    userRole: req.user?.role ?? null,
    feature,
    model: streamedModel,
    runtime: 'gemini_api',
    promptChars:
      (runtimeRequest.prompt?.length ?? 0) +
      (runtimeRequest.systemInstruction?.length ?? 0),
    promptHash: hashPrompt(runtimeRequest.prompt),
    streamed: true,
    hasSchema: Boolean(runtimeRequest.responseSchema),
    mediaPartCount: validParts.length,
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
        streamedModel = item.model;
        writeEvent('meta', { model: item.model });
      } else {
        responseChars += item.text.length;
        writeEvent('chunk', { text: item.text });
      }
    }
    if (!clientClosed) writeEvent('done', { status: 'ok' });
    logAiInteraction({
      ...telemetry,
      model: streamedModel,
      responseChars,
      latencyMs: Date.now() - startedAt,
      status: 'success',
    });
  } catch (error) {
    logAiInteraction({
      ...telemetry,
      model: streamedModel,
      responseChars,
      latencyMs: Date.now() - startedAt,
      status: 'error',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
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
