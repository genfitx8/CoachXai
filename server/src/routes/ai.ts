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
  isModelFallbackError,
} from '../services/geminiApiRuntime';
import { getDefaultModel, resolveModel } from '../services/modelRouter';
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
  // 필기 줄마다 화자 역할(코치/학생/주변) 배정 — 분류 작업이라 최저 온도.
  lesson_speaker_label: 0.1,
  // 오인식된 골프 용어를 코칭 언어로 되돌리는 교정 — 정해진 어휘로
  // 되돌리는 작업이라 창의성이 곧 오류다. 전사와 같은 최저 온도.
  lesson_transcript_repair: 0.1,

  // Analytical / summarization — mostly deterministic with light phrasing.
  lesson_summary: 0.4,
  // 세그먼트 노트 → 최종 리포트 병합(map-reduce reduce 단계). 톤은
  // lesson_summary 와 동일하게 맞춘다.
  lesson_summary_merge: 0.4,
  // 레슨 진행 중 화면에 띄우는 롤링 요약 — 짧은 불릿 재생성이 잦으므로
  // 흔들림 없이 노트에 충실해야 한다.
  lesson_live_summary: 0.3,
  // 코치 요약 + 학생 요약 — 근거가 화자별 발화로 갈려 있어 롤링 요약과
  // 같은 수준으로 필기에 충실해야 한다.
  lesson_dual_summary: 0.3,
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

// Best-effort response text for telemetry: runtimes return either a string
// or an object carrying a `text` field; anything else stays unmeasured.
const extractText = (result: unknown): string | null => {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object') {
    const text = (result as Record<string, unknown>).text;
    if (typeof text === 'string') return text;
  }
  return null;
};

const extractTextLength = (result: unknown): number | null =>
  extractText(result)?.length ?? null;

/**
 * 학습 데이터로 쓰려면 모델이 실제로 본 입력 전체가 필요하다 — 시스템
 * 지시문 없이 프롬프트만 남기면 재현이 안 된다. 두 조각을 한 칸
 * (`prompt_text`)에 담되 경계를 표시해 나중에 다시 가를 수 있게 한다.
 * 저장 여부는 ai_training 동의 게이트가 결정한다(aiInteractionLog).
 */
const composePromptText = (
  systemInstruction: string | undefined,
  prompt: string | undefined
): string | null => {
  if (!systemInstruction && !prompt) return null;
  const parts: string[] = [];
  if (systemInstruction) parts.push(`[SYSTEM]\n${systemInstruction}`);
  if (prompt) parts.push(`[USER]\n${prompt}`);
  return parts.join('\n\n');
};

/** 스트리밍 응답을 텔레메트리용으로 모을 때의 상한. */
const MAX_STREAM_CAPTURE_CHARS = 100_000;

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
      promptText: composePromptText(
        runtimeRequest.systemInstruction,
        runtimeRequest.prompt
      ),
      hasSchema: Boolean(runtimeRequest.responseSchema),
      mediaPartCount: validParts.length,
    };

    if (isGeminiApiConfigured()) {
      telemetry.runtime = 'gemini_api';
      // 라우터가 고른 모델(특히 preview 티어)이 404(퇴역) 또는 429(preview
      // quota 소진, 런타임의 백오프 재시도 이후)로 실패하면 기본 모델로 딱
      // 한 번 폴백한다. 레슨 요약처럼 pro-preview 로 라우팅된 유료 경로가
      // 모델 사정으로 통째로 죽는 것보다 기본 모델 품질로라도 응답하는
      // 쪽이 낫다. 폴백 발동은 status='fallback' 텔레메트리로 남으므로
      // 관측 대시보드에서 preview 모델 이상을 바로 알 수 있다.
      let result: Awaited<ReturnType<typeof invokeGeminiApi>>;
      try {
        result = await invokeGeminiApi(runtimeRequest);
      } catch (error) {
        const fallbackModel = getDefaultModel();
        const routedModel = runtimeRequest.model ?? '';
        if (!isModelFallbackError(error) || routedModel === fallbackModel) {
          throw error;
        }
        logAiInteraction({
          ...telemetry,
          latencyMs: Date.now() - startedAt,
          status: 'fallback',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        result = await invokeGeminiApi({
          ...runtimeRequest,
          model: fallbackModel,
        });
      }
      logAiInteraction({
        ...telemetry,
        model: result.model ?? telemetry.model,
        responseChars: result.text.length,
        responseText: result.text,
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
        responseText: extractText(result),
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
      responseText: extractText(result),
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
  // 스트림 조각을 모아 완성본을 텔레메트리에 넘긴다. 저장 여부는 동의
  // 게이트가 정하므로 여기서는 상한만 두고 무조건 모은다.
  const responseParts: string[] = [];
  let responseTextChars = 0;
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
        if (responseTextChars < MAX_STREAM_CAPTURE_CHARS) {
          responseParts.push(item.text);
          responseTextChars += item.text.length;
        }
        writeEvent('chunk', { text: item.text });
      }
    }
    if (!clientClosed) writeEvent('done', { status: 'ok' });
    logAiInteraction({
      ...telemetry,
      model: streamedModel,
      responseChars,
      responseText: responseParts.join('') || null,
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
