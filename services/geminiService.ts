import { classifyBodyType, BodyShapePatternScores } from './bodyAnalysisService';
import {
  ComparisonResult,
  GolfData,
  ClientProfile,
  Lesson,
  Homework,
  ShotMetrics,
  TrainingProgramConfig,
  QuickLogEntry,
  WeeklyInsight,
  MotionCaptureData,
  CoachProfile,
  WeeklySchedule,
  TrainingCategory,
  TrainingDiagnosis,
  ScheduleSession,
  CategoryAllocation,
} from '../types';
import {
  CoachXLanguage,
  CoachXInsight,
  CoachGrowthProfile,
  generateHeuristicResponse,
  generateCoachInsights,
  generateCoachGrowthProfile,
} from './coachXService';
import { promptService } from './promptService';
import { firebaseService } from './firebase';
import { createLogger } from '../utils/logger';
import {
  coachXGrowthProfileSchema,
  coachXInsightsSchema,
  extractGolfDataSchema,
  generateSystemPromptFromDocumentSchema,
  interviewQuestionSchema,
  motionCaptureSchema,
  trackmanScreenSchema,
  weeklyInsightSchema,
} from './geminiSchemas';
import {
  buildMemberActivityOverview,
  formatLessonEntry,
} from './lessonContext';
import { resolveApiBaseUrl } from './apiBase';
import { recordAiCall, hashPrompt } from './aiCallLogger';
import {
  CACHEABLE_FEATURES,
  getCachedResponse,
  setCachedResponse,
} from './aiResponseCache';
import { invokeBackendAIStream, StreamNotSupportedError } from './aiStream';
import { scanForInjection } from './promptSafety';
import { buildPhysicsReferenceBlock } from './physicsGrounding';
import { buildFewShotBlock, coachStyleService } from './coachStyleService';

const log = createLogger('gemini');

const API_BASE = resolveApiBaseUrl();

const getAiApiEndpoint = (): string => {
  if (API_BASE) return `${API_BASE}/api/ai/invoke`;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/ai/invoke`;
  }
  return '/api/ai/invoke';
};

interface InlineDataPart {
  inlineData: {
    data: string;
    mimeType: string;
  };
}

/**
 * Pull the fields the observability layer wants out of a payload without
 * caring about the payload's exact shape. All extraction is defensive so a
 * malformed payload never breaks the AI call itself.
 */
const inspectPayload = (payload: unknown): {
  prompt: string;
  coachId?: string;
  hasExemplars: boolean;
  hasSchema: boolean;
  /**
   * The subset of the prompt that came from the user (chat message, voice
   * transcript, etc.). Populated only when the caller explicitly set
   * `userMessage` in the payload — required to run injection detection.
   */
  userMessage?: string;
} => {
  if (!payload || typeof payload !== 'object') {
    return { prompt: '', hasExemplars: false, hasSchema: false };
  }
  const rec = payload as Record<string, unknown>;
  const prompt = typeof rec.prompt === 'string' ? rec.prompt : '';
  const coachId = typeof rec.coachId === 'string' ? rec.coachId : undefined;
  const systemInstruction = typeof rec.systemInstruction === 'string' ? rec.systemInstruction : '';
  const userMessage = typeof rec.userMessage === 'string' ? rec.userMessage : undefined;
  // Exemplars can appear in either the prompt or the system instruction —
  // check both so few-shot injection is detected regardless of where it lives.
  const hasExemplars =
    prompt.includes('참고 예시') || systemInstruction.includes('참고 예시');
  const hasSchema = 'responseSchema' in rec && rec.responseSchema != null;
  return { prompt, coachId, hasExemplars, hasSchema, userMessage };
};

/**
 * Wrap a scan result into the two AiCallLog fields the logger accepts.
 * Returns { undefined, undefined } when there is no user message to scan
 * so we don't pollute the log with irrelevant false negatives.
 */
const buildInjectionSignal = (
  userMessage: string | undefined
): { injectionSuspected?: boolean; injectionMatches?: string } => {
  if (!userMessage) return {};
  const scan = scanForInjection(userMessage);
  if (!scan.suspicious) return { injectionSuspected: false };
  return {
    injectionSuspected: true,
    injectionMatches: scan.matches.join(','),
  };
};

const extractResponseText = (result: unknown): string => {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return '';
  const rec = result as Record<string, unknown>;
  if (typeof rec.text === 'string') return rec.text;
  if (typeof rec.response === 'string') return rec.response;
  if (typeof rec.output === 'string') return rec.output;
  try {
    return JSON.stringify(result);
  } catch {
    return '';
  }
};

/**
 * Read the model id the server reported on a response, if any. Older
 * backends may omit it; that's fine — the logger records `undefined`
 * and the dashboard shows "unknown" for those calls.
 */
const extractModel = (result: unknown): string | undefined => {
  if (!result || typeof result !== 'object') return undefined;
  const rec = result as Record<string, unknown>;
  return typeof rec.model === 'string' && rec.model.trim() ? rec.model : undefined;
};

export const invokeBackendAI = async <T>(feature: string, payload: unknown): Promise<T> => {
  const startedAt = Date.now();
  const meta = inspectPayload(payload);
  const injection = buildInjectionSignal(meta.userMessage);

  // Cache lookup — only for allowlisted deterministic features. Skip when
  // the prompt carries few-shot exemplars because the exemplar pool can
  // shift as coaches star new outputs; a stale cache would defeat that.
  if (
    CACHEABLE_FEATURES.has(feature) &&
    meta.prompt &&
    !meta.hasExemplars
  ) {
    try {
      const promptHash = await hashPrompt(meta.prompt);
      const cached = getCachedResponse(feature, promptHash);
      if (cached != null) {
        void recordAiCall({
          feature,
          coachId: meta.coachId,
          prompt: meta.prompt,
          responseText: cached,
          latencyMs: Date.now() - startedAt,
          status: 'success',
          hasExemplars: meta.hasExemplars,
          hasSchema: meta.hasSchema,
          cached: true,
          ...injection,
        });
        // The cached response is always a string. Callers that expect a
        // richer object should still receive the JSON-parseable text they
        // originally produced — invokeBackendAI's <T> is nominal.
        return cached as unknown as T;
      }
    } catch {
      // Cache path is best-effort — any failure here just falls through
      // to the real network call.
    }
  }

  try {
    const response = await fetch(getAiApiEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature, payload }),
    });

    let body: { ok?: boolean; result?: T; error?: string } | null = null;
    try {
      body = await response.json() as { ok?: boolean; result?: T; error?: string };
    } catch {
      if (response.ok) {
        throw new Error('Failed to parse AI backend response.');
      }
    }

    if (!response.ok || !body?.ok) {
      const message = body?.error || `AI backend request failed (HTTP ${response.status})`;
      throw new Error(message);
    }

    const responseText = extractResponseText(body.result);
    const modelId = extractModel(body.result);

    // Fire-and-forget success log. Do NOT await — telemetry must never
    // add latency to the response the caller returns to the user.
    void recordAiCall({
      feature,
      coachId: meta.coachId,
      prompt: meta.prompt,
      responseText,
      latencyMs: Date.now() - startedAt,
      status: 'success',
      hasExemplars: meta.hasExemplars,
      hasSchema: meta.hasSchema,
      model: modelId,
      ...injection,
    });

    // Cache write for the eligible features. Same exemplar guard as the
    // read side so we never poison the cache with an exemplar-conditioned
    // response and serve it back after the exemplars have changed.
    if (
      CACHEABLE_FEATURES.has(feature) &&
      meta.prompt &&
      !meta.hasExemplars &&
      responseText
    ) {
      hashPrompt(meta.prompt)
        .then((promptHash) =>
          setCachedResponse(feature, promptHash, responseText)
        )
        .catch(() => {
          /* best-effort — cache write failure is silent */
        });
    }

    return body.result as T;
  } catch (err) {
    void recordAiCall({
      feature,
      coachId: meta.coachId,
      prompt: meta.prompt,
      responseText: '',
      latencyMs: Date.now() - startedAt,
      status: 'error',
      errorMessage: err instanceof Error ? err.message : String(err),
      hasExemplars: meta.hasExemplars,
      hasSchema: meta.hasSchema,
      ...injection,
    });
    throw err;
  }
};

/**
 * Callers that catch an invokeBackendAI failure and swap in a heuristic
 * response should call this so the dashboard sees the fallback event
 * (the error branch above already logged the underlying failure — this
 * annotates that the user still got an answer via the fallback path).
 */
export const recordAiFallback = (
  feature: string,
  opts: { coachId?: string; prompt?: string; errorMessage?: string; hasExemplars?: boolean; hasSchema?: boolean } = {}
): void => {
  void recordAiCall({
    feature,
    coachId: opts.coachId,
    prompt: opts.prompt ?? '',
    responseText: '',
    latencyMs: 0,
    status: 'fallback',
    errorMessage: opts.errorMessage,
    hasExemplars: !!opts.hasExemplars,
    hasSchema: !!opts.hasSchema,
  });
};

export const getResponseText = (result: unknown): string | null => {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return null;

  const record = result as Record<string, unknown>;
  if (typeof record.text === 'string') return record.text;
  if (typeof record.response === 'string') return record.response;
  if (typeof record.output === 'string') return record.output;

  return null;
};

const getJsonTextFromResult = (result: unknown): string => {
  const text = getResponseText(result);
  if (text) return text;
  return typeof result === 'object' ? JSON.stringify(result) : '';
};

const parseJsonObjectFromText = (text: string): Record<string, unknown> | null => {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const parseJsonArrayFromText = (text: string): unknown[] | null => {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * Fetches a blob from a local blob URL
 */
const getBlobFromUrl = async (url: string): Promise<Blob> => {
  const response = await fetch(url);
  return await response.blob();
};

const toMediaPart = async (blob: Blob, mimeType: string): Promise<InlineDataPart> =>
  fileToGenerativePart(blob, mimeType);

/**
 * Converts a File object or Blob to a Base64 string for backend Agent Runtime calls.
 */
const fileToGenerativePart = async (
  file: Blob,
  mimeType: string
): Promise<InlineDataPart> => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove the Data URL prefix (e.g., "data:video/mp4;base64,")
      resolve(result.split(',')[1]);
    };
    reader.readAsDataURL(file);
  });

  return {
    inlineData: {
      data: await base64EncodedDataPromise,
      mimeType: mimeType,
    },
  };
};

export interface AnalysisInput {
  data: File | string; // File object or URL string
  mimeType: string;
}

export interface BodyPhotoAnalysisResult {
  bodyType:
    | '이상체형'
    | '삼각체형'
    | '역삼각체형'
    | '사각체형'
    | '모래시계형'
    | '마름모꼴체형'
    | '둥근체형'
    | '튜브체형';
  structuralInput: {
    frontAxisTiltDeg?: number;
    headTiltDeg?: number;
    shoulderTiltDeg?: number;
    pelvisTiltDeg?: number;
    kneeTiltDeg?: number;
  };
  patternScores?: BodyShapePatternScores;
  coachComment: string;
}

export interface EquipmentPhotoAnalysisResult {
  driverModel?: string;
  ironModel?: string;
  shaftFlex?: string;
  ballBrand?: string;
  summary: string;
}

const LESSON_BODY_TYPES: BodyPhotoAnalysisResult['bodyType'][] = [
  '이상체형',
  '삼각체형',
  '역삼각체형',
  '사각체형',
  '모래시계형',
  '마름모꼴체형',
  '둥근체형',
  '튜브체형',
];

const toOptionalNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Number(value.toFixed(1));
};

const toOptionalTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const parsePatternScores = (value: unknown): BodyShapePatternScores | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const parsed: BodyShapePatternScores = {
    이상체형: toOptionalNumber(source.이상체형),
    삼각체형: toOptionalNumber(source.삼각체형),
    역삼각체형: toOptionalNumber(source.역삼각체형),
    사각체형: toOptionalNumber(source.사각체형),
    모래시계형: toOptionalNumber(source.모래시계형),
    마름모꼴체형: toOptionalNumber(source.마름모꼴체형),
    둥근체형: toOptionalNumber(source.둥근체형),
    튜브체형: toOptionalNumber(source.튜브체형),
  };

  const hasScore = Object.values(parsed).some((score) => score !== undefined);
  return hasScore ? parsed : undefined;
};

export const parseBodyPhotoAnalysisResponse = (
  text: string
): BodyPhotoAnalysisResult => {
  const parsed = JSON.parse(text);
  const rawBodyType = String(parsed?.bodyType ?? '사각체형');
  const fallbackBodyType = LESSON_BODY_TYPES.includes(
    rawBodyType as BodyPhotoAnalysisResult['bodyType']
  )
    ? (rawBodyType as BodyPhotoAnalysisResult['bodyType'])
    : '사각체형';
  const patternScores = parsePatternScores(parsed?.patternScores);
  const bodyType = patternScores ? classifyBodyType(patternScores) : fallbackBodyType;

  return {
    bodyType,
    patternScores,
    structuralInput: {
      frontAxisTiltDeg: toOptionalNumber(parsed?.structuralInput?.frontAxisTiltDeg),
      headTiltDeg: toOptionalNumber(parsed?.structuralInput?.headTiltDeg),
      shoulderTiltDeg: toOptionalNumber(parsed?.structuralInput?.shoulderTiltDeg),
      pelvisTiltDeg: toOptionalNumber(parsed?.structuralInput?.pelvisTiltDeg),
      kneeTiltDeg: toOptionalNumber(parsed?.structuralInput?.kneeTiltDeg),
    },
    coachComment:
      typeof parsed?.coachComment === 'string' && parsed.coachComment.trim()
        ? parsed.coachComment.trim()
        : '정면/측면 전신 사진 기반 자동 분석 결과입니다.',
  };
};

export const parseEquipmentPhotoAnalysisResponse = (
  text: string
): EquipmentPhotoAnalysisResult => {
  const parsed = JSON.parse(text);

  return {
    driverModel: toOptionalTrimmedString(parsed?.driverModel),
    ironModel: toOptionalTrimmedString(parsed?.ironModel),
    shaftFlex: toOptionalTrimmedString(parsed?.shaftFlex),
    ballBrand: toOptionalTrimmedString(parsed?.ballBrand),
    summary:
      toOptionalTrimmedString(parsed?.summary) ??
      '장비 사진 기반 자동 분석 결과입니다.',
  };
};

/**
 * Summarizes multiple golf lesson assets (videos, images, audio) via backend Agent Runtime.
 * Generates a member-facing lesson summary report from coach feedback and media context.
 */
export const analyzeSwingVideo = async (
  mediaInputs: AnalysisInput[],
  userNotes: string,
  swingAngle?: 'FRONT' | 'SIDE',
  coachId?: string
): Promise<string> => {
  const fallback = () => {
    const note = userNotes?.trim();
    return `## 📝 오늘의 레슨 요약\n\n${
      note ? note : '레슨 요약을 자동 생성하지 못해 코치 메모를 기준으로 저장합니다.'
    }\n\n## 🎯 핵심 코칭 포인트\n- 업로드된 자료를 다시 확인해 핵심 포인트를 정리해 주세요.\n- AI 연동이 설정되면 보다 상세한 리포트를 자동 생성할 수 있습니다.`;
  };

  try {
    // Convert all inputs to generative parts, skipping any that fail to load
    const settled = await Promise.allSettled(
      mediaInputs.map(async (input) => {
        let blob: Blob;
        if (typeof input.data === 'string') {
          blob = await getBlobFromUrl(input.data);
        } else {
          blob = input.data;
        }
        return toMediaPart(blob, input.mimeType);
      })
    );
    const mediaParts = settled
      .filter((r): r is PromiseFulfilledResult<InlineDataPart> => r.status === 'fulfilled')
      .map((r) => r.value);
    settled
      .filter((r) => r.status === 'rejected')
      .forEach((r) => log.error('미디어 로드 실패 (건너뜀):', (r as PromiseRejectedResult).reason));

    const angleText =
      swingAngle === 'FRONT'
        ? '정면(Front View)'
        : swingAngle === 'SIDE'
        ? '측면(Side View)'
        : '알 수 없음(자동 감지)';

    const isFirebaseMode = firebaseService.isInitialized();
    const systemInstruction = await promptService.getActiveSystemPrompt(
      'lesson_summary',
      isFirebaseMode,
      coachId
    );

    const prompt = `**리포트 참고 자료:**
- **촬영 앵글**: ${angleText}
- **오디오 데이터**: 레슨 현장의 대화 및 타구음
- **비주얼 데이터**: 스윙 영상 및 이미지
- **추가 메모**: "${userNotes}"`;

    const result = await invokeBackendAI<unknown>('lesson_summary', {
      prompt,
      systemInstruction,
      mediaParts,
    });

    const text = getResponseText(result);
    if (text) return text;
    throw new Error('레슨 요약을 생성하지 못했습니다.');
  } catch (error) {
    log.error('AI Lesson Summary Error:', error);
    return fallback();
  }
};

/**
 * Extracts golf metrics from an image (Launch monitor screen like GDR, Trackman)
 * OR extracts Score from a Scorecard image for a specific user.
 */
export const extractGolfData = async (
  imageInput: AnalysisInput,
  clientName?: string // Name to search for in scorecard
): Promise<{
  textAnalysis: string;
  golfData: GolfData | null;
  score?: number;
}> => {
  try {
    let blob: Blob;
    if (typeof imageInput.data === 'string') {
      blob = await getBlobFromUrl(imageInput.data);
    } else {
      blob = imageInput.data;
    }
    const mediaPart = await fileToGenerativePart(blob, imageInput.mimeType);

    const prompt = `
      이 이미지는 두 가지 중 하나입니다:
      1. **골프 시뮬레이터/런치모니터(GDR, 카카오VX, 트랙맨, GC Quad, Foresight 등)의 데이터 화면**
      2. **골프 스코어카드(필드 또는 스크린 게임 결과)**

      이미지를 분석하여 다음 작업을 수행하고 JSON으로 응답해주세요.

      **Case 1: 스코어카드인 경우**
      - 여러 사람의 이름과 점수가 있을 수 있습니다.
      - **대상 사용자 이름**: "${clientName || '사용자'}"
      - 위 이름과 일치하거나 가장 유사한 이름을 찾으세요. (예: "${clientName}" -> "김철수")
      - 그 사람의 **Total Score(총 타수)**를 추출하여 'score' 필드에 넣으세요.
      - 찾을 수 없다면 가장 눈에 띄는(주인공인) 점수를 추출하세요.
      - golfData의 수치들은 null로 두세요.

      **Case 2: 시뮬레이터/런치모니터 데이터인 경우**
      - 화면에 있는 비거리, 스피드 등 수치를 추출하여 'metrics' 객체에 넣으세요.
      - score는 null로 두세요.
      - **여러 샷이 표(테이블) 형태로 나열되어 있고 'Average'(평균) 행이 있다면, 반드시 그 Average 행의 값을 사용하세요.** 개별 샷 번호(1, 2, 3...) 행의 값을 쓰지 마세요.
      - 눈 아이콘이 꺼져있거나(hidden), 취소선이 그어져 회색으로 표시된 행은 분석에서 제외된 샷이므로 무시하고, 이미 계산되어 있는 Average 행 값을 그대로 신뢰하세요.
      - 'Consistency'(일관성) 행은 사용하지 마세요.
      - 컬럼 이름은 장비/화면마다 다르게 표기될 수 있으니 아래 매핑을 참고해 유사한 의미의 컬럼을 찾아 매핑하세요.

      **추출해야 할 데이터 필드 (반드시 아래 영문 Key 사용, 단위 무시, 숫자만. 부호(+/-)가 있는 값은 부호를 유지):**
      - score (스코어카드일 때 총 타수)
      - carryDistance (Carry, 캐리 거리)
      - totalDistance (Total, 총 거리)
      - ballSpeed (Ball Speed, 볼 스피드)
      - clubHeadSpeed (Club Speed, 클럽(헤드) 스피드)
      - launchAngle (Launch Angle, 발사각 — 없다면 생략, Attack Angle과 혼동하지 말 것)
      - attackAngle (Attack Ang./Attack Angle, 어택 앵글)
      - backSpin (Back Spin, 백스핀 — Spin Rate가 백/사이드로 분리되어 있을 때만)
      - sideSpin (Side Spin, 사이드스핀 — Spin Rate가 백/사이드로 분리되어 있을 때만)
      - spinRate (Spin Rate, 스핀량 — 백/사이드 분리 없이 총 스핀량 하나만 있을 때)
      - smashFactor (Smash Factor, 정타율/스매시팩터)
      - clubPath (Club Path, 클럽 패스)
      - dynamicLoft (Dyn. Loft/Dynamic Loft, 다이나믹 로프트)
      - spinLoft (Spin Loft, 스핀 로프트)
      - faceAngle (Face Angle, 페이스 앵글)
      - sideTotal (Side Tot./Side Total, 사이드 토탈 거리 — 오른쪽(R)이면 양수(+), 왼쪽(L)이면 음수(-)로 변환)

      **응답 형식 (JSON, 필드는 이미지에서 확인 가능한 것만 포함):**
      \`\`\`json
      {
        "isScorecard": boolean,
        "score": 85,
        "metrics": {
          "carryDistance": 150.5,
          "totalDistance": 160.2,
          "ballSpeed": 65.0,
          "clubHeadSpeed": 45.0,
          "smashFactor": 1.45,
          "attackAngle": -0.8,
          "spinRate": 4195,
          "clubPath": -0.1,
          "dynamicLoft": 21.7,
          "spinLoft": 22.7,
          "sideTotal": 12.7,
          ...
        },
        "comment": "스코어카드: 김철수님의 기록은 85타입니다. / 시뮬레이터: 볼 스피드가 아주 훌륭합니다."
      }
      \`\`\`
    `;

    const result = await invokeBackendAI<unknown>('extract_golf_data', {
      prompt,
      mediaParts: [mediaPart],
      responseMimeType: 'application/json',
      responseSchema: extractGolfDataSchema,
    });
    const text = getJsonTextFromResult(result);
    if (!text) throw new Error('분석 실패');

    const parsedResult = JSON.parse(text);
    return {
      textAnalysis: parsedResult.comment,
      golfData: parsedResult.metrics,
      score: parsedResult.score,
    };
  } catch (error) {
    log.error('Golf Data Extraction Error:', error);
    return {
      textAnalysis: '데이터 분석 중 오류가 발생했습니다.',
      golfData: null,
    };
  }
};

/**
 * Summarizes audio feedback for a specific golf hole AND extracts structured metrics.
 */
export const summarizeHoleVoice = async (
  audioBlob: Blob,
  holeNumber: number,
  par: number,
  score: number,
  putts: number
): Promise<{ summary: string; metrics: ShotMetrics }> => {
  try {
    const mediaPart = await fileToGenerativePart(audioBlob, audioBlob.type);

    const prompt = `
      당신은 전문적인 골프 캐디입니다.
      ${holeNumber}번 홀(Par ${par})에서 플레이어가 기록한 음성 메모를 분석해주세요.
      
      **기록 정보:**
      - 타수: ${score}
      - 퍼팅 수: ${putts}
      
      **요청사항:**
      1. 음성 내용을 듣고 해당 홀의 플레이 내용(티샷, 세컨샷, 어프로치, 퍼팅 등)을 시간 순서대로 요약해주세요.
      2. **중요:** 음성 내용에서 다음 데이터가 언급되었다면 추출하여 JSON으로 반환해주세요.
         - 티샷 비거리 (미터 단위)
         - 티샷 방향 (페어웨이 중앙/센터, 좌측/왼쪽, 우측/오른쪽, OB, 해저드 중 하나)
         - 세컨샷 남은 거리 (미터 단위)
         - 파온(GIR) 여부 (true/false, 언급 없으면 타수와 퍼팅 수로 추정)
         - (파온 실패 시) 어프로치 남은 거리 (미터 단위)
         - 첫번째 퍼팅 남은 거리 (미터 단위)

      **응답 형식 (JSON):**
      \`\`\`json
      {
        "summary": "티샷은 230m 페어웨이 중앙으로 잘 갔습니다. 세컨샷 140m 남은 상황에서 7번 아이언으로 온그린에 성공했습니다. 5m 버디 퍼팅이 조금 짧아서 파로 마무리했습니다.",
        "metrics": {
          "teeDistance": 230,
          "teeDirection": "CENTER", // CENTER, LEFT, RIGHT, OB, HAZARD
          "secondShotDistance": 140,
          "parOn": true,
          "approachDistance": null, // GIR 성공 시 null
          "firstPuttDistance": 5
        }
      }
      \`\`\`
    `;

    const result = await invokeBackendAI<unknown>('hole_voice_summary', {
      prompt,
      mediaParts: [mediaPart],
      responseMimeType: 'application/json',
    });
    const text = getJsonTextFromResult(result);
    if (!text) throw new Error('No response');

    return JSON.parse(text);
  } catch (error) {
    log.error('Hole Summary Error:', error);
    return { summary: '분석 실패', metrics: {} };
  }
};

/**
 * Compares two swing videos, images, or audio records to analyze progress.
 */
export const compareSwings = async (
  oldVideoUrl: string,
  newVideoUrl: string,
  oldDate: string,
  newDate: string,
  coachId?: string
): Promise<ComparisonResult> => {
  const fallback = (): ComparisonResult => ({
    improvementScore: 50,
    summary: 'AI 비교 분석을 사용할 수 없어 기본 비교 결과를 제공합니다.',
    keyChanges: ['비교 대상 레슨의 핵심 포인트를 수동으로 확인해 주세요.'],
    coachComment: '현재 AI 백엔드 연결이 없어 자동 비교 분석을 생성하지 못했습니다.',
  });

  try {
    const oldBlob = await getBlobFromUrl(oldVideoUrl);
    const newBlob = await getBlobFromUrl(newVideoUrl);

    // Detect mime type directly from blob
    const oldMime = oldBlob.type;
    const newMime = newBlob.type;

    const oldMediaPart = await fileToGenerativePart(oldBlob, oldMime);
    const newMediaPart = await fileToGenerativePart(newBlob, newMime);

    const isAudioComparison =
      oldMime.startsWith('audio/') || newMime.startsWith('audio/');

    const dataDescription = isAudioComparison
      ? '두 개의 레슨 데이터(하나 또는 둘 다 음성 녹음). 코치의 피드백 변화 등을 비교하여 회원이 어떤 부분에서 발전했거나 변화했는지 분석하세요.'
      : '두 개의 골프 스윙 데이터(영상 또는 사진). 시각적으로 비교하여 회원이 얼마나 발전했는지 분석하세요.';

    const isFirebaseMode = firebaseService.isInitialized();
    const systemInstruction = await promptService.getActiveSystemPrompt(
      'compare_swings',
      isFirebaseMode,
      coachId
    );

    const prompt = `${dataDescription}
- 첫 번째 데이터: ${oldDate} (과거)
- 두 번째 데이터: ${newDate} (최근)

다음 JSON 형식으로 정확하게 출력하세요 (마크다운 코드 블록 없이 순수 JSON만 출력):
{
  "improvementScore": 0에서 100 사이의 숫자 (발전 정도),
  "summary": "발전 사항에 대한 한 줄 요약",
  "keyChanges": ["변경점1", "변경점2", "변경점3"],
  "coachComment": "격려와 구체적인 피드백이 담긴 긴 코멘트 (마크다운 지원)"
}`;

    const result = await invokeBackendAI<unknown>('compare_swings', {
      prompt,
      systemInstruction,
      mediaParts: [
        oldMediaPart,
        newMediaPart,
      ],
      metadata: { oldDate, newDate },
      responseMimeType: 'application/json',
    });
    const text = getJsonTextFromResult(result);
    if (!text) throw new Error('No response from AI');

    return JSON.parse(text) as ComparisonResult;
  } catch (error) {
    log.error('AI Compare Analysis Error:', error);
    return fallback();
  }
};

/**
 * 정면/측면 전신 사진 2장을 분석해 신체분석 입력값을 자동 생성합니다.
 */
export const analyzeBodyPhotos = async (params: {
  frontImage: AnalysisInput;
  sideImage: AnalysisInput;
}): Promise<BodyPhotoAnalysisResult> => {
  const toBlob = async (input: AnalysisInput): Promise<Blob> => {
    if (typeof input.data === 'string') {
      return getBlobFromUrl(input.data);
    }
    return input.data;
  };

  try {
    const [frontBlob, sideBlob] = await Promise.all([
      toBlob(params.frontImage),
      toBlob(params.sideImage),
    ]);

    const [frontPart, sidePart] = await Promise.all([
      fileToGenerativePart(frontBlob, params.frontImage.mimeType),
      fileToGenerativePart(sideBlob, params.sideImage.mimeType),
    ]);

    const prompt = `
      너는 체형/정렬 분석 보조 AI다.
      입력된 두 이미지는 각각
      - 첫 번째: 정면 전신 사진
      - 두 번째: 측면 전신 사진
      이다.

      아래 JSON만 출력해라.
      - bodyType: 다음 중 1개 [이상체형, 삼각체형, 역삼각체형, 사각체형, 모래시계형, 마름모꼴체형, 둥근체형, 튜브체형]
      - patternScores: 각 체형별 구성비(%) 추정치
        {
          "이상체형": number | null,
          "삼각체형": number | null,
          "역삼각체형": number | null,
          "사각체형": number | null,
          "모래시계형": number | null,
          "마름모꼴체형": number | null,
          "둥근체형": number | null,
          "튜브체형": number | null
        }
      - structuralInput.frontAxisTiltDeg: number | null
      - structuralInput.headTiltDeg: number | null
      - structuralInput.shoulderTiltDeg: number | null
      - structuralInput.pelvisTiltDeg: number | null
      - structuralInput.kneeTiltDeg: number | null
      - coachComment: 한국어 1~2문장 요약

      제약:
      - 단위는 모두 degree(°) 기준 수치로 반환
      - 추정이 어려운 값은 null
      - bodyType은 patternScores 중 가장 큰 값을 가진 체형과 일치시켜라.
      - 코드블록 없이 순수 JSON만 반환
    `;

    const result = await invokeBackendAI<unknown>('analyze_body_photos', {
      prompt,
      mediaParts: [frontPart, sidePart],
      responseMimeType: 'application/json',
    });
    const text = getJsonTextFromResult(result);
    if (!text) {
      throw new Error('신체 사진 분석 결과를 생성하지 못했습니다.');
    }

    return parseBodyPhotoAnalysisResponse(text);
  } catch (error) {
    log.error('AI body photo analysis failed:', error);
    throw error;
  }
};

export const analyzeEquipmentPhoto = async (
  imageInput: AnalysisInput
): Promise<EquipmentPhotoAnalysisResult> => {
  try {
    const blob =
      typeof imageInput.data === 'string'
        ? await getBlobFromUrl(imageInput.data)
        : imageInput.data;
    const mediaPart = await fileToGenerativePart(blob, imageInput.mimeType);

    const prompt = `
      너는 골프 장비 식별 보조 AI다.
      입력된 이미지는 골퍼의 장비 사진이다.

      이미지에서 확인 가능한 정보만 바탕으로 아래 JSON만 출력해라.
      {
        "driverModel": string | null,
        "ironModel": string | null,
        "shaftFlex": string | null,
        "ballBrand": string | null,
        "summary": string
      }

      규칙:
      - driverModel: 드라이버 헤드/커버/라벨에서 식별 가능한 모델명
      - ironModel: 아이언 세트 또는 아이언 헤드에서 식별 가능한 모델명
      - shaftFlex: 샤프트 강도 표기 (예: L, A, R, SR, S, X)
      - ballBrand: 골프공 브랜드/라인명
      - 식별이 어렵거나 보이지 않으면 null
      - summary는 한국어 1~2문장으로, 어떤 항목을 식별했는지 간단히 설명
      - 추정이 불확실하면 단정하지 말고 "확인 필요"처럼 표현
      - 코드블록 없이 순수 JSON만 반환
    `;

    const result = await invokeBackendAI<unknown>('analyze_equipment_photo', {
      prompt,
      mediaParts: [mediaPart],
      responseMimeType: 'application/json',
    });
    const text = getJsonTextFromResult(result);
    if (!text) {
      throw new Error('장비 사진 분석 결과를 생성하지 못했습니다.');
    }

    return parseEquipmentPhotoAnalysisResponse(text);
  } catch (error) {
    log.error('AI equipment photo analysis failed:', error);
    throw error;
  }
};

/**
 * Identifies the timestamps for 8 key swing phases using backend AI runtime.
 */
export const getSwingPhaseTimestamps = async (
  videoBlob: Blob
): Promise<{ label: string; time: number }[]> => {
  try {
    const mediaPart = await fileToGenerativePart(videoBlob, videoBlob.type);

    const prompt = `
      Analyze this golf swing video. Identify the exact timestamp (in seconds, as a floating point number) for the following 8 key phases:
      
      1. Address (Setup)
      2. Takeaway (Start of backswing)
      3. Half Swing (Backswing arm parallel to ground)
      4. Top of Swing
      5. Downswing (Mid-downswing, arm parallel to ground)
      6. Impact (Club hits ball)
      7. Follow Through (Arm parallel to ground after impact)
      8. Finish (End of swing)

      Return ONLY a JSON object where the keys are exactly these English labels: "Address", "Takeaway", "HalfSwing", "Top", "Downswing", "Impact", "FollowThrough", "Finish".
      The values must be the time in seconds (e.g., 1.5).

      Example JSON format:
      {
        "Address": 0.0,
        "Takeaway": 0.5,
        "HalfSwing": 1.1,
        "Top": 1.8,
        "Downswing": 2.1,
        "Impact": 2.3,
        "FollowThrough": 2.8,
        "Finish": 3.5
      }
    `;

    const result = await invokeBackendAI<unknown>('swing_phase_timestamps', {
      prompt,
      mediaParts: [mediaPart],
      responseMimeType: 'application/json',
    });
    const text = getJsonTextFromResult(result);
    if (!text) throw new Error('AI analysis failed');

    const parsedResult = JSON.parse(text);

    // Map English keys to Korean labels expected by the UI
    const mapping: { [key: string]: string } = {
      Address: '어드레스',
      Takeaway: '테이크어웨이',
      HalfSwing: '하프스윙',
      Top: '탑',
      Downswing: '다운스윙',
      Impact: '임팩트',
      FollowThrough: '팔로우스루',
      Finish: '피니쉬',
    };

    const timestamps = Object.keys(parsedResult)
      .map((key) => ({
        label: mapping[key] || key,
        time: parseFloat(parsedResult[key]),
      }))
      .filter((item) => !isNaN(item.time));

    return timestamps;
  } catch (error) {
    log.error('Swing Sequence Timestamp Error:', error);
    throw error;
  }
};

/**
 * Generates personalized daily mission suggestions for the client
 * based on their profile, stats, and recent lesson feedback.
 */
export const generateGolfMissions = async (
  profile: ClientProfile,
  recentLessons: Lesson[]
): Promise<string[]> => {
  try {
    // 1. Gather Context
    const handicapInfo = profile.handicap
      ? `핸디캡: ${profile.handicap}`
      : '핸디캡 정보 없음 (초보자 가정)';
    const goalInfo = profile.memo
      ? `사용자 목표: ${profile.memo}`
      : '특별한 목표 없음 (기본기 향상)';
    const bestScoreInfo = profile.bestScore ? `라베: ${profile.bestScore}` : '';

    // Get recent 3 lessons context (Coach notes + AI Analysis)
    const recentContext = recentLessons
      .slice(0, 3)
      .map((l, i) => {
        return `레슨 ${i + 1} (${l.date}): 코치메모-[${
          l.coachNotes
        }], AI분석-[${l.aiAnalysis || '없음'}]`;
      })
      .join('\n');

    const prompt = `
      당신은 회원의 골프 실력 향상을 돕는 AI 전담 코치입니다.
      아래 회원의 정보를 바탕으로 **오늘 수행하면 좋을 맞춤형 연습 과제(미션) 3가지**를 추천해주세요.

      **회원 정보:**
      - ${handicapInfo}
      - ${bestScoreInfo}
      - ${goalInfo}

      **최근 레슨 및 연습 기록:**
      ${
        recentContext ||
        '최근 기록이 없습니다. 일반적인 기초 연습을 추천해주세요.'
      }

      **요청사항:**
      1. 회원의 약점이나 최근 코치에게 지적받은 내용을 보완할 수 있는 구체적인 연습법이어야 합니다.
      2. 각 미션은 "드라이버 빈스윙 20회", "퍼팅 거리감 연습 10분" 처럼 명확한 행동 지침이어야 합니다.
      3. 너무 길지 않게(20자 내외) 작성해주세요.
      4. JSON 배열 형태로 출력해주세요.

      Example JSON:
      ["아이언 어드레스 척추각 유지하며 빈스윙 30회", "퍼팅 3m 거리감 익히기 20분", "드라이버 헤드 던지기 연습"]
    `;

    const result = await invokeBackendAI<unknown>('golf_missions', {
      prompt,
      responseMimeType: 'application/json',
    });
    const text = getJsonTextFromResult(result);
    if (!text) throw new Error('Mission generation failed');

    return JSON.parse(text) as string[];
  } catch (error) {
    log.error('Generate Missions Error:', error);
    // Fallback missions
    return [
      '빈 스윙 50회 하며 리듬 익히기',
      '퍼팅 스트로크 연습 10분',
      '스트레칭 5분으로 유연성 기르기',
    ];
  }
};

/**
 * Generates a structured training program for a member based on their lesson-record
 * history and the user-supplied program configuration.
 *
 * @param profile - The client's profile (handicap, experience, goals, etc.)
 * @param lessons - The client's accumulated lesson records to analyse.
 * @param config  - User-entered program settings (dates, frequency, duration, goal).
 * @returns Markdown-formatted week-by-week training program.
 */
export const generateTrainingProgram = async (
  profile: ClientProfile,
  lessons: Lesson[],
  config: TrainingProgramConfig,
  coachId?: string
): Promise<string> => {
  // Fallback plan used when AI runtime is unavailable or when there are too few lesson records.
  const fallbackPlan = (goal: string) => `## 훈련 프로그램 (기본 플랜)

> 레슨 기록 데이터 또는 AI 서비스가 부족하여 기본 플랜을 제공합니다.

### 목표: ${goal}

**1주차** – 기초 점검
- 어드레스·그립·스탠스 교정
- 빈스윙 50회 (리듬·템포 확인)
- 퍼팅 직선 스트로크 20분

**2주차** – 반복 훈련
- 7번 아이언 50볼 집중 연습
- 숏게임 칩샷 30분
- 피니시 자세 유지 연습

**3주차** – 응용 훈련
- 필드 또는 스크린 라운드 1회
- 부족한 클럽 집중 연습 30분
- 멘탈·루틴 점검

**4주차** – 점검 및 정리
- 전체 스윙 영상 셀프 촬영 후 비교
- 코치 피드백 반영 교정 집중
- 목표 재설정
`;

  try {
    const handicapInfo = profile.handicap
      ? `핸디캡: ${profile.handicap}`
      : '핸디캡 정보 없음 (초보자 가정)';
    const bestScoreInfo = profile.bestScore ? `라베: ${profile.bestScore}` : '';
    const goalInfo = profile.memo
      ? `사용자 메모/목표: ${profile.memo}`
      : '';

    // Summarise up to 10 most recent lesson records for context
    const lessonContext = lessons.length === 0
      ? '레슨 기록 없음 (기본기 중심으로 구성해 주세요)'
      : lessons
          .slice(0, 10)
          .map((l, i) => {
            const parts: string[] = [
              `레슨 ${i + 1} (${l.date}, ${l.title})`,
            ];
            if (l.coachNotes) parts.push(`코치메모: ${l.coachNotes}`);
            if (l.aiAnalysis) parts.push(`AI분석: ${l.aiAnalysis}`);
            if (l.golfData?.carryDistance)
              parts.push(`캐리거리: ${l.golfData.carryDistance}m`);
            if (l.tags?.length) parts.push(`태그: ${l.tags.join(', ')}`);
            return parts.join(' | ');
          })
          .join('\n');

    // Calculate approximate number of weeks
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const start = new Date(config.startDate).getTime();
    const end = new Date(config.endDate).getTime();
    const weeks = Math.max(1, Math.round((end - start) / msPerWeek));

    const isFirebaseMode = firebaseService.isInitialized();
    const systemInstruction = await promptService.getActiveSystemPrompt(
      'training_program',
      isFirebaseMode,
      coachId
    );

    const prompt = `**회원 정보:**
- 이름: ${profile.name}
- ${handicapInfo}
${bestScoreInfo ? `- ${bestScoreInfo}` : ''}
${goalInfo ? `- ${goalInfo}` : ''}

**프로그램 설정:**
- 기간: ${config.startDate} ~ ${config.endDate} (약 ${weeks}주)
- 주간 훈련 빈도: 주 ${config.frequencyPerWeek}회
- 회당 훈련 시간: ${config.sessionDurationMinutes}분
- 향상 목표: ${config.performanceGoal}

**최근 레슨 기록 요약:**
${lessonContext}

주차별로(1주차, 2주차, …) 구체적 훈련 계획을 마크다운으로 작성해 주세요. ${config.sessionDurationMinutes}분 세션 기준으로 현실적인 훈련량을 유지하세요.`;

    const result = await invokeBackendAI<unknown>('training_program', {
      prompt,
      systemInstruction,
    });
    const text = getResponseText(result);
    if (!text) throw new Error('Training program generation failed');
    return text;
  } catch (error) {
    log.error('Generate Training Program Error:', error);
    return fallbackPlan(config.performanceGoal);
  }
};

// ── Weekly Schedule Generator ────────────────────────────────────────────────

const CATEGORY_LABELS: Record<TrainingCategory, string> = {
  SHORT_GAME: '숏게임',
  PUTTING: '퍼팅',
  CONTROL_SHOT: '컨트롤 샷',
  SWING: '스윙',
  TARGETING: '타겟팅',
  BALL_FLIGHT: '구질 구현',
  REST: '휴식',
};

const CATEGORY_KEYS: TrainingCategory[] = [
  'SHORT_GAME',
  'PUTTING',
  'CONTROL_SHOT',
  'SWING',
  'TARGETING',
  'BALL_FLIGHT',
  'REST',
];

const isTrainingCategory = (value: unknown): value is TrainingCategory =>
  typeof value === 'string' && (CATEGORY_KEYS as string[]).includes(value);

const roundToHalfHour = (minutes: number): number =>
  Math.max(30, Math.round(minutes / 30) * 30);

const summariseAllocations = (sessions: ScheduleSession[]): CategoryAllocation[] => {
  const totals = new Map<TrainingCategory, number>();
  for (const s of sessions) {
    totals.set(s.category, (totals.get(s.category) ?? 0) + s.durationMinutes);
  }
  const total = Array.from(totals.values()).reduce((a, b) => a + b, 0) || 1;
  return Array.from(totals.entries())
    .map(([category, minutes]) => ({
      category,
      minutes,
      ratio: minutes / total,
    }))
    .sort((a, b) => b.minutes - a.minutes);
};

/** Simple heuristic diagnosis used when the AI backend is unavailable. */
const buildHeuristicDiagnosis = (
  lessons: Lesson[],
  quickLogs: QuickLogEntry[],
): TrainingDiagnosis => {
  const areaCounts = new Map<TrainingCategory, number>();
  const bump = (cat: TrainingCategory) =>
    areaCounts.set(cat, (areaCounts.get(cat) ?? 0) + 1);

  for (const l of lessons.slice(0, 20)) {
    const text = `${l.title ?? ''} ${l.coachNotes ?? ''} ${l.aiAnalysis ?? ''} ${(l.tags ?? []).join(' ')}`;
    if (/퍼팅|putt/i.test(text)) bump('PUTTING');
    if (/어프로치|칩|피치|숏게임|웨지/.test(text)) bump('SHORT_GAME');
    if (/드라이버|스윙|톱|다운스윙|피니시/.test(text)) bump('SWING');
    if (/방향|타겟|얼라인|정확/.test(text)) bump('TARGETING');
    if (/슬라이스|훅|드로|페이드|구질|페이스|패스/.test(text)) bump('BALL_FLIGHT');
    if (/거리|컨트롤/.test(text)) bump('CONTROL_SHOT');
  }
  for (const q of quickLogs.slice(0, 30)) {
    if (q.practiceArea === 'PUTTING') bump('PUTTING');
    if (q.practiceArea === 'SHORT_GAME') bump('SHORT_GAME');
    if (q.practiceArea === 'DRIVER' || q.practiceArea === 'IRON') bump('SWING');
    if (/슬라이스|훅|드로|페이드/.test(q.problemPoint ?? '')) bump('BALL_FLIGHT');
  }

  const max = Math.max(1, ...Array.from(areaCounts.values()));
  const weakAreas = Array.from(areaCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category, count]) => ({
      category,
      reason: `최근 기록에서 ${CATEGORY_LABELS[category]} 관련 언급 ${count}회`,
      severity: count / max,
    }));

  return {
    summary:
      lessons.length + quickLogs.length === 0
        ? '분석할 기록이 부족합니다. 기본 밸런스 프로그램을 제안합니다.'
        : `최근 레슨 ${lessons.length}건, 빠른기록 ${quickLogs.length}건을 기반으로 진단했습니다.`,
    weakAreas,
    strengths: [],
  };
};

/** Build a default weekly grid modelled on the reference document (short 70% / long 30%). */
const buildFallbackSchedule = (config: TrainingProgramConfig): WeeklySchedule => {
  const totalMinutesTarget = config.frequencyPerWeek * config.sessionDurationMinutes;
  // Reference blueprint: 40h/week distribution used as ratios.
  const referenceRatios: Record<TrainingCategory, number> = {
    PUTTING: 6 / 40,
    SHORT_GAME: 20 / 40,
    CONTROL_SHOT: 2 / 40,
    SWING: 5 / 40,
    TARGETING: 5 / 40,
    BALL_FLIGHT: 2 / 40,
    REST: 0,
  };

  const days = Math.min(config.frequencyPerWeek, 6);
  const sessions: ScheduleSession[] = [];
  const order: TrainingCategory[] = [
    'SHORT_GAME',
    'PUTTING',
    'SWING',
    'TARGETING',
    'CONTROL_SHOT',
    'BALL_FLIGHT',
  ];

  let cursor = 0;
  for (let day = 0; day < days; day++) {
    const category = order[cursor % order.length];
    cursor++;
    sessions.push({
      id: `sess_${day}_${cursor}`,
      dayOfWeek: day,
      startTime: '10:00',
      durationMinutes: config.sessionDurationMinutes,
      category,
      label: CATEGORY_LABELS[category],
    });
  }

  const allocations = CATEGORY_KEYS.filter((c) => c !== 'REST').map((category) => {
    const minutes = Math.round(referenceRatios[category] * totalMinutesTarget);
    return {
      category,
      minutes,
      ratio: totalMinutesTarget > 0 ? minutes / totalMinutesTarget : 0,
    };
  });

  return {
    totalMinutes: sessions.reduce((sum, s) => sum + s.durationMinutes, 0),
    allocations,
    sessions,
    overview: '기록이 부족하여 기본 밸런스 스케줄을 제안합니다. 코치가 편집해 주세요.',
  };
};

const summariseLessonsForSchedule = (lessons: Lesson[]): string => {
  if (!lessons.length) return '레슨 기록 없음';
  return lessons
    .slice(0, 12)
    .map((l, i) => {
      const parts: string[] = [`#${i + 1} ${l.date} · ${l.title ?? ''}`];
      if (l.coachNotes) parts.push(`코치메모: ${l.coachNotes.slice(0, 140)}`);
      if (l.aiAnalysis) parts.push(`AI: ${l.aiAnalysis.slice(0, 140)}`);
      if (l.golfData?.carryDistance) parts.push(`캐리 ${l.golfData.carryDistance}m`);
      if (l.tags?.length) parts.push(`태그: ${l.tags.join(',')}`);
      return parts.join(' | ');
    })
    .join('\n');
};

const summariseQuickLogs = (logs: QuickLogEntry[]): string => {
  if (!logs.length) return '빠른기록 없음';
  return logs
    .slice(0, 15)
    .map(
      (q) =>
        `${q.logDate} [${q.mood}] 잘된점: ${q.goodPoint} / 문제점: ${q.problemPoint}${
          q.practiceArea ? ` (연습:${q.practiceArea})` : ''
        }`,
    )
    .join('\n');
};

/** Parse whatever the AI returns into a WeeklySchedule, tolerating small shape drift. */
const coerceWeeklySchedule = (
  raw: Record<string, unknown> | null,
  config: TrainingProgramConfig,
): WeeklySchedule | null => {
  if (!raw) return null;
  const sessionsRaw = Array.isArray(raw.sessions) ? raw.sessions : null;
  if (!sessionsRaw) return null;

  const sessions: ScheduleSession[] = [];
  sessionsRaw.forEach((entry, idx) => {
    if (!entry || typeof entry !== 'object') return;
    const rec = entry as Record<string, unknown>;
    const dayOfWeek = Number(rec.dayOfWeek);
    const durationMinutes = roundToHalfHour(Number(rec.durationMinutes) || config.sessionDurationMinutes);
    const startTime =
      typeof rec.startTime === 'string' && /^\d{2}:\d{2}$/.test(rec.startTime)
        ? rec.startTime
        : '10:00';
    const category: TrainingCategory = isTrainingCategory(rec.category)
      ? rec.category
      : 'SHORT_GAME';
    if (Number.isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return;

    sessions.push({
      id: typeof rec.id === 'string' ? rec.id : `sess_${idx}_${Date.now()}`,
      dayOfWeek,
      startTime,
      durationMinutes,
      category,
      label: typeof rec.label === 'string' && rec.label ? rec.label : CATEGORY_LABELS[category],
      note: typeof rec.note === 'string' ? rec.note : undefined,
    });
  });

  if (!sessions.length) return null;

  const allocations = summariseAllocations(sessions);
  return {
    totalMinutes: sessions.reduce((sum, s) => sum + s.durationMinutes, 0),
    allocations,
    sessions,
    overview: typeof raw.overview === 'string' ? raw.overview : undefined,
  };
};

const coerceDiagnosis = (raw: Record<string, unknown> | null): TrainingDiagnosis | null => {
  if (!raw) return null;
  const summary = typeof raw.summary === 'string' ? raw.summary : '';
  const weakRaw = Array.isArray(raw.weakAreas) ? raw.weakAreas : [];
  const strengthsRaw = Array.isArray(raw.strengths) ? raw.strengths : [];
  const weakAreas = weakRaw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const rec = entry as Record<string, unknown>;
      if (!isTrainingCategory(rec.category)) return null;
      const severityNum = Number(rec.severity);
      return {
        category: rec.category,
        reason: typeof rec.reason === 'string' ? rec.reason : '',
        severity: Number.isFinite(severityNum) ? Math.max(0, Math.min(1, severityNum)) : 0.5,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
  const strengths = strengthsRaw
    .map((s) => (typeof s === 'string' ? s : ''))
    .filter((s) => s.length > 0);
  if (!summary && !weakAreas.length) return null;
  return { summary, weakAreas, strengths };
};

export interface WeeklyScheduleResult {
  schedule: WeeklySchedule;
  diagnosis: TrainingDiagnosis;
}

/**
 * Analyses a student's records (lessons + quick logs) and produces a
 * data-driven weekly training schedule the coach can edit.
 */
export const generateWeeklySchedule = async (
  profile: ClientProfile,
  lessons: Lesson[],
  quickLogs: QuickLogEntry[],
  config: TrainingProgramConfig,
): Promise<WeeklyScheduleResult> => {
  const fallback = (): WeeklyScheduleResult => ({
    schedule: buildFallbackSchedule(config),
    diagnosis: buildHeuristicDiagnosis(lessons, quickLogs),
  });

  try {
    const totalWeeklyMinutes = config.frequencyPerWeek * config.sessionDurationMinutes;
    const lessonContext = summariseLessonsForSchedule(lessons);
    const quickContext = summariseQuickLogs(quickLogs);
    const profileInfo = [
      `이름: ${profile.name}`,
      profile.handicap != null ? `핸디캡: ${profile.handicap}` : '핸디캡 정보 없음',
      profile.bestScore != null ? `라베: ${profile.bestScore}` : '',
      profile.memo ? `메모: ${profile.memo}` : '',
    ]
      .filter(Boolean)
      .join('\n- ');

    const prompt = `당신은 골프 코치 AI입니다. 학생의 기록을 분석해 데이터 기반의 주간 훈련 스케줄을 JSON으로 생성합니다.

**핵심 원칙:**
- 참고 훈련 비율: 숏게임 70% / 롱게임 30% (숏게임 = SHORT_GAME + PUTTING + CONTROL_SHOT).
- 학생의 약점이 뚜렷하면 해당 카테고리 시간을 15~30% 늘려 균형을 조정합니다.
- 사이클: 분석 → 피드백 → 솔루션 → 재분석.

**회원 정보:**
- ${profileInfo}

**프로그램 설정:**
- 기간: ${config.startDate} ~ ${config.endDate}
- 주간 훈련 빈도: ${config.frequencyPerWeek}회
- 회당 훈련 시간: ${config.sessionDurationMinutes}분 (총 주간 ${totalWeeklyMinutes}분)
- 향상 목표: ${config.performanceGoal}

**최근 레슨 기록:**
${lessonContext}

**최근 학생 빠른기록:**
${quickContext}

**출력 형식:** 아래 JSON 스키마만 반환하세요. 다른 텍스트/마크다운 금지.
{
  "diagnosis": {
    "summary": "학생의 현재 상태 요약 (한국어, 2~3문장)",
    "weakAreas": [
      { "category": "SHORT_GAME | PUTTING | CONTROL_SHOT | SWING | TARGETING | BALL_FLIGHT", "reason": "근거 (한국어)", "severity": 0.0~1.0 }
    ],
    "strengths": ["유지할 강점 (한국어)"]
  },
  "schedule": {
    "overview": "이번 주 전체 방향 (한국어)",
    "sessions": [
      {
        "dayOfWeek": 0~6 (0=월,6=일),
        "startTime": "HH:MM",
        "durationMinutes": 30 단위 정수,
        "category": "SHORT_GAME | PUTTING | CONTROL_SHOT | SWING | TARGETING | BALL_FLIGHT",
        "label": "셀에 표시할 짧은 이름 (한국어)",
        "note": "코치 참고용 상세 (한국어, 옵션)"
      }
    ]
  }
}

**세션 생성 지침:**
- 총 세션 수 ≒ ${config.frequencyPerWeek} (허용범위 ±1).
- 각 세션 duration ≒ ${config.sessionDurationMinutes}분 (30/60/90 등).
- 약점 카테고리는 최소 1회 이상 등장.
- 참고 스케줄 예시 (오전 10-12시 숏게임, 12-13시 퍼팅, 14-15시 스윙, 15-16시 타겟팅 등)를 참고하되 학생 기록에 맞게 조정.
`;

    const result = await invokeBackendAI<unknown>('training_program', { prompt });
    const text = getJsonTextFromResult(result);
    const parsed = parseJsonObjectFromText(text);
    if (!parsed) throw new Error('Weekly schedule JSON parse failed');

    const diagnosis =
      coerceDiagnosis(parsed.diagnosis as Record<string, unknown> | null) ??
      buildHeuristicDiagnosis(lessons, quickLogs);
    const schedule =
      coerceWeeklySchedule(parsed.schedule as Record<string, unknown> | null, config) ??
      buildFallbackSchedule(config);

    return { schedule, diagnosis };
  } catch (error) {
    log.error('generateWeeklySchedule error:', error);
    return fallback();
  }
};

/** Recompute the allocation summary — used after a coach edits the grid. */
export const recomputeScheduleAllocations = (schedule: WeeklySchedule): WeeklySchedule => {
  const allocations = summariseAllocations(schedule.sessions);
  return {
    ...schedule,
    totalMinutes: schedule.sessions.reduce((sum, s) => sum + s.durationMinutes, 0),
    allocations,
  };
};

const MOOD_LABELS: Record<string, string> = {
  GREAT: '매우 좋음',
  GOOD: '좋음',
  OKAY: '보통',
  BAD: '나쁨',
  TERRIBLE: '매우 나쁨',
};

const AREA_LABELS: Record<string, string> = {
  DRIVER: '드라이버',
  IRON: '아이언',
  SHORT_GAME: '숏게임',
  PUTTING: '퍼팅',
  ROUND: '라운드',
  OTHER: '기타',
};

/**
 * Generates a weekly AI insight summary from a client's recent quick log entries.
 * Returns a structured WeeklyInsight (without id/clientId/coachId/weekStart/weekEnd/generatedAt,
 * those are set by the caller).
 */
export const generateWeeklyInsight = async (
  logs: QuickLogEntry[],
  recentLessons: Lesson[] = [],
  clientProfile?: ClientProfile
): Promise<Pick<WeeklyInsight, 'summary' | 'keyPatterns' | 'recommendedFocus'>> => {
  const fallback = (): Pick<WeeklyInsight, 'summary' | 'keyPatterns' | 'recommendedFocus'> => {
    const goodPoints = logs.map((l) => l.goodPoint).filter(Boolean);
    const problems = logs.map((l) => l.problemPoint).filter(Boolean);
    return {
      summary: `이번 주 ${logs.length}건의 기록을 바탕으로 분석한 결과입니다.`,
      keyPatterns: [
        goodPoints.length > 0 ? `잘된 점: ${goodPoints[0]}` : '',
        problems.length > 0 ? `개선 필요: ${problems[0]}` : '',
      ].filter(Boolean),
      recommendedFocus: problems.length > 0
        ? `${problems[0]} 개선에 집중하세요.`
        : '꾸준한 기록과 연습을 이어가세요.',
    };
  };

  if (logs.length === 0) return fallback();

  try {
    const logSummaries = logs.map((l, i) => {
      const parts = [
        `기록 ${i + 1} (${l.logDate})`,
        `컨디션: ${MOOD_LABELS[l.mood] ?? l.mood}`,
        `잘된 점: ${l.goodPoint}`,
        `문제점: ${l.problemPoint}`,
      ];
      if (l.practiceArea) parts.push(`연습 영역: ${AREA_LABELS[l.practiceArea] ?? l.practiceArea}`);
      if (l.notes) parts.push(`메모: ${l.notes}`);
      return parts.join(' | ');
    }).join('\n');

    const lessonContext = recentLessons.length === 0
      ? ''
      : '\n\n**최근 레슨 기록 (참고용):**\n' + recentLessons.slice(0, 5).map((l, i) => {
          const parts = [`레슨 ${i + 1} (${l.date}): ${l.title}`];
          if (l.coachNotes) parts.push(`코치노트: ${l.coachNotes}`);
          return parts.join(' | ');
        }).join('\n');

    const profileContext = clientProfile
      ? `\n회원: ${clientProfile.name}${clientProfile.handicap ? `, 핸디캡 ${clientProfile.handicap}` : ''}`
      : '';

    const prompt = `당신은 전문 골프 코치 AI입니다. 아래 회원의 이번 주 빠른 기록 ${logs.length}건을 분석해 주간 인사이트를 작성해주세요.${profileContext}

**이번 주 빠른 기록:**
${logSummaries}${lessonContext}

**작성 지침:**
- summary: 이번 주 전반적인 흐름을 2~3문장으로 요약 (한국어)
- keyPatterns: 반복되는 패턴이나 두드러진 이슈 2~4개를 배열로 (각 항목 한 문장)
- recommendedFocus: 다음 주 핵심 집중 포인트 1~2개를 포함한 실용적 제안 (2~3문장)

반드시 아래 JSON 형식으로만 응답하세요:
{
  "summary": "...",
  "keyPatterns": ["...", "..."],
  "recommendedFocus": "..."
}`;

    const result = await invokeBackendAI<unknown>('weekly_insight', {
      prompt,
      responseMimeType: 'application/json',
      responseSchema: weeklyInsightSchema,
    });
    const text = getResponseText(result);
    const parsed = (text ? parseJsonObjectFromText(text) : result) as Record<string, unknown> | null;
    if (!parsed || !parsed.summary || !Array.isArray(parsed.keyPatterns) || !parsed.recommendedFocus) {
      throw new Error('Invalid JSON structure');
    }
    return {
      summary: parsed.summary as string,
      keyPatterns: parsed.keyPatterns as string[],
      recommendedFocus: parsed.recommendedFocus as string,
    };
  } catch (error) {
    log.error('Generate Weekly Insight Error:', error);
    return fallback();
  }
};

// ─── CoachX runtime-backed intelligence ────────────────────────────────────────

// ─── CoachX module-level constants ──────────────────────────────────────────

const COACHX_TOPIC_KEYWORDS = [
  '슬라이스','훅','어드레스','그립','백스윙','임팩트','체중이동','퍼팅','어프로치','드라이버','아이언',
  'slice','hook','address','grip','backswing','impact','putting','driver',
];

const COACHX_VALID_INSIGHT_TYPES = new Set(['pattern', 'attention', 'curriculum', 'coach_growth', 'stagnation']);

const COACHX_INSIGHT_ICON_MAP: Record<string, string> = {
  pattern: '🔄',
  attention: '⭐',
  curriculum: '🗓️',
  coach_growth: '📈',
  stagnation: '⏸️',
};

/**
 * Generates a runtime-backed CoachX chat response for a coach's question.
 *
 * Builds a structured prompt from the coach's lesson history and client data,
 * then calls backend Agent Runtime for a supportive, data-driven coaching reply.
 * Falls back to the heuristic response if runtime is unavailable or the call fails.
 *
 * @param userMessage      The coach's question or request
 * @param allLessons       Full lesson history for this coach
 * @param clients          Registered client profiles for this coach
 * @param language         Output language (ko | en | ja)
 * @param conversationHistory  Prior chat turns (role + content) for multi-turn context
 */
export const generateCoachXChatResponse = async (
  userMessage: string,
  allLessons: Lesson[],
  clients: ClientProfile[],
  language: CoachXLanguage = 'ko',
  conversationHistory: { role: 'user' | 'assistant'; content: string }[] = [],
  coachId?: string
): Promise<string> => {
  const fallback = () => generateHeuristicResponse(userMessage, allLessons, clients, language);

  try {
    const memberCount = new Set(allLessons.map(l => `${l.clientName}_${l.clientPhone}`)).size;

    // Rich per-lesson context (metrics, motion capture, scorecard, notes),
    // shared with the student-side chat so coach and student get parity.
    // Most recent 15 records with client name included in each header.
    const recentLessons = [...allLessons]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 15);

    const lessonContext = recentLessons.length > 0
      ? recentLessons
          .map(l => formatLessonEntry(l, { includeClientName: true, maxNoteLength: 220 }))
          .join('\n\n')
      : '기록 없음';

    // Coach-side per-member snapshot: helps the model answer
    // "who should I focus on?" or "what has X been working on?" without
    // dumping every lesson.
    const memberOverview = buildMemberActivityOverview(allLessons, clients, {
      limit: 10,
      recentDays: 45,
    });

    const clientContext = clients.length > 0
      ? clients.slice(0, 15).map(c => {
          const parts = [c.name];
          if (c.handicap) parts.push(`handicap ${c.handicap}`);
          return parts.join(', ');
        }).join('; ')
      : 'No registered clients.';

    const LANG_INSTRUCTION: Record<CoachXLanguage, string> = {
      ko: '반드시 한국어로 답변하세요.',
      en: 'Respond entirely in English.',
      ja: '必ず日本語で回答してください。',
      th: 'Respond entirely in English.',
    };

    // Load admin-managed system prompt; fall back to built-in if none is active
    const isFirebaseMode = firebaseService.isInitialized();
    const systemPrompt = await promptService.getActiveSystemPrompt(
      'coachx_chat',
      isFirebaseMode,
      coachId
    );

    // Format prior conversation turns (exclude the current message; last 10 turns max)
    const historyToInclude = conversationHistory.slice(-10);
    const conversationBlock = historyToInclude.length > 0
      ? '\nConversation history (oldest → newest):\n' +
        historyToInclude
          .map(m => `${m.role === 'user' ? 'Coach' : 'CoachX'}: ${m.content}`)
          .join('\n') +
        '\n'
      : '';

    const systemInstruction = `${systemPrompt}

Language instruction: ${LANG_INSTRUCTION[language]}`;

    const prompt = `--- Provided data (answer ONLY from this) ---
Coach context:
- Total lesson records: ${allLessons.length}
- Total members: ${memberCount}
- Registered clients: ${clientContext}
${memberOverview ? `\n${memberOverview}\n` : ''}
Recent lesson history (up to ${recentLessons.length} most recent, richest first):
${lessonContext}
${conversationBlock}
--- End of provided data ---

Coach's question: "${userMessage}"

IMPORTANT: Answer strictly based on the provided data and conversation history above.
When a specific member is mentioned, ground your answer in that member's actual
lessons, metrics, motion-capture, and scorecard from above.
Do not introduce topics unrelated to the conversation or golf coaching.`;

    const result = await invokeBackendAI<unknown>('coachx_chat', {
      prompt,
      systemInstruction,
      language,
      userMessage,
    });
    const text = getResponseText(result) ?? '';
    if (!text.trim()) throw new Error('Empty response from Gemini');
    return text;
  } catch (error) {
    log.error('CoachX runtime chat error:', error);
    return fallback();
  }
};

/**
 * Streaming variant of generateCoachXChatResponse. Same context assembly,
 * same fallback semantics, but chunks arrive incrementally via `onChunk`
 * so the UI can render as the model writes instead of showing a spinner
 * for 3-5 seconds.
 *
 * If the backend doesn't support streaming (StreamNotSupportedError), we
 * transparently fall back to the non-streaming variant — the caller's
 * onChunk simply won't fire, but the final resolved text is identical.
 */
export const generateCoachXChatResponseStream = async (
  userMessage: string,
  allLessons: Lesson[],
  clients: ClientProfile[],
  onChunk: (delta: string, accumulated: string) => void,
  language: CoachXLanguage = 'ko',
  conversationHistory: { role: 'user' | 'assistant'; content: string }[] = [],
  coachId?: string,
  signal?: AbortSignal
): Promise<string> => {
  const fallback = () =>
    generateHeuristicResponse(userMessage, allLessons, clients, language);

  try {
    const memberCount = new Set(
      allLessons.map((l) => `${l.clientName}_${l.clientPhone}`)
    ).size;

    const recentLessons = [...allLessons]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 15);

    const lessonContext =
      recentLessons.length > 0
        ? recentLessons
            .map((l) =>
              formatLessonEntry(l, { includeClientName: true, maxNoteLength: 220 })
            )
            .join('\n\n')
        : '기록 없음';

    const memberOverview = buildMemberActivityOverview(allLessons, clients, {
      limit: 10,
      recentDays: 45,
    });

    const clientContext =
      clients.length > 0
        ? clients
            .slice(0, 15)
            .map((c) => {
              const parts = [c.name];
              if (c.handicap) parts.push(`handicap ${c.handicap}`);
              return parts.join(', ');
            })
            .join('; ')
        : 'No registered clients.';

    const LANG_INSTRUCTION: Record<CoachXLanguage, string> = {
      ko: '반드시 한국어로 답변하세요.',
      en: 'Respond entirely in English.',
      ja: '必ず日本語で回答してください。',
      th: 'Respond entirely in English.',
    };

    const isFirebaseMode = firebaseService.isInitialized();
    const systemPrompt = await promptService.getActiveSystemPrompt(
      'coachx_chat',
      isFirebaseMode,
      coachId
    );

    const historyToInclude = conversationHistory.slice(-10);
    const conversationBlock =
      historyToInclude.length > 0
        ? '\nConversation history (oldest → newest):\n' +
          historyToInclude
            .map((m) => `${m.role === 'user' ? 'Coach' : 'CoachX'}: ${m.content}`)
            .join('\n') +
          '\n'
        : '';

    const systemInstruction = `${systemPrompt}

Language instruction: ${LANG_INSTRUCTION[language]}`;

    const prompt = `--- Provided data (answer ONLY from this) ---
Coach context:
- Total lesson records: ${allLessons.length}
- Total members: ${memberCount}
- Registered clients: ${clientContext}
${memberOverview ? `\n${memberOverview}\n` : ''}
Recent lesson history (up to ${recentLessons.length} most recent, richest first):
${lessonContext}
${conversationBlock}
--- End of provided data ---

Coach's question: "${userMessage}"

IMPORTANT: Answer strictly based on the provided data and conversation history above.
When a specific member is mentioned, ground your answer in that member's actual
lessons, metrics, motion-capture, and scorecard from above.
Do not introduce topics unrelated to the conversation or golf coaching.`;

    try {
      const text = await invokeBackendAIStream(
        'coachx_chat',
        { prompt, systemInstruction, language, userMessage },
        { onChunk, signal }
      );
      if (!text.trim()) throw new Error('Empty response from Gemini stream');
      return text;
    } catch (streamErr) {
      if (streamErr instanceof StreamNotSupportedError) {
        // Backend runtime doesn't support streaming — fall through to the
        // non-streaming path so the user still gets an answer.
        const result = await invokeBackendAI<unknown>('coachx_chat', {
          prompt,
          systemInstruction,
          language,
          userMessage,
        });
        const text = getResponseText(result) ?? '';
        if (!text.trim()) throw new Error('Empty response from Gemini');
        // Deliver the full text as one "chunk" so the caller's UI code
        // paths stay uniform.
        onChunk(text, text);
        return text;
      }
      throw streamErr;
    }
  } catch (error) {
    log.error('CoachX runtime chat stream error:', error);
    return fallback();
  }
};

/**
 * Generates runtime-backed CoachX insights for a coach's home dashboard.
 *
 * Produces richer, more nuanced insights than the heuristic version by using
 * backend runtime to interpret lesson patterns, member trends, and coaching
 * opportunities. Returns a structured `CoachXInsight[]` array.
 * Falls back to heuristic insights if runtime is unavailable or parsing fails.
 *
 * @param allLessons   Full lesson history for this coach
 * @param coachProfile Coach profile object
 * @param language     Output language (ko | en | ja)
 */
export const generateCoachXInsights = async (
  allLessons: Lesson[],
  coachProfile: CoachProfile,
  language: CoachXLanguage = 'ko'
): Promise<CoachXInsight[]> => {
  const fallback = () => generateCoachInsights(allLessons, coachProfile, language);

  if (allLessons.length === 0) return fallback();

  try {
    const memberCount = new Set(allLessons.map(l => `${l.clientName}_${l.clientPhone}`)).size;

    // Summarise topic frequency from all lessons
    const topicCounts: Record<string, number> = {};
    for (const l of allLessons) {
      const text = `${l.title} ${l.coachNotes ?? ''} ${(l.tags ?? []).join(' ')}`.toLowerCase();
      for (const kw of COACHX_TOPIC_KEYWORDS) {
        if (text.includes(kw)) topicCounts[kw] = (topicCounts[kw] ?? 0) + 1;
      }
    }
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => `${k}(${v})`)
      .join(', ');

    // Recent activity (last 30 days)
    const cutoff30 = Date.now() - 30 * 86_400_000;
    const recentCount = allLessons.filter(l => l.createdAt >= cutoff30).length;

    // Inactive members (45+ days)
    const clientLastLesson: Record<string, number> = {};
    for (const l of allLessons) {
      const key = `${l.clientName}_${l.clientPhone}`;
      if (!clientLastLesson[key] || l.createdAt > clientLastLesson[key]) {
        clientLastLesson[key] = l.createdAt;
      }
    }
    const staleCutoff = Date.now() - 45 * 86_400_000;
    const staleMembers = Object.entries(clientLastLesson)
      .filter(([, t]) => t < staleCutoff)
      .map(([k]) => k.split('_')[0]);

    const LANG_INSTRUCTION: Record<CoachXLanguage, string> = {
      ko: '반드시 한국어로 작성하세요.',
      en: 'Write entirely in English.',
      ja: '必ず日本語で記述してください。',
      th: 'Write entirely in English.',
    };

    // Load admin-managed system prompt; fall back to built-in if none is active
    const isFirebaseMode = firebaseService.isInitialized();
    const systemPrompt = await promptService.getActiveSystemPrompt(
      'coachx_insights',
      isFirebaseMode,
      coachProfile.id
    );

    const systemInstruction = `${systemPrompt}

Language instruction: ${LANG_INSTRUCTION[language]}`;

    const prompt = `Coach: ${coachProfile.name}
Total lessons: ${allLessons.length} | Members: ${memberCount}
Lessons last 30 days: ${recentCount}
Most frequent lesson topics: ${topTopics || 'none recorded'}
Members inactive 45+ days: ${staleMembers.length > 0 ? staleMembers.slice(0, 5).join(', ') : 'none'}`;

    const result = await invokeBackendAI<unknown>('coachx_insights', {
      prompt,
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: coachXInsightsSchema,
      language,
    });
    const text = getResponseText(result);
    const parsed = (text ? parseJsonArrayFromText(text) : result) as CoachXInsight[] | null;
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty insight array');

    return parsed
      .filter(i => i.title && i.body && COACHX_VALID_INSIGHT_TYPES.has(i.type))
      .map(i => ({ ...i, icon: COACHX_INSIGHT_ICON_MAP[i.type] ?? '💡' }));
  } catch (error) {
    log.error('CoachX runtime insights error:', error);
    return fallback();
  }
};

/**
 * Generates a runtime-backed CoachX coach growth profile.
 *
 * Builds on the heuristic `generateCoachGrowthProfile()` result for all
 * deterministic metrics (activity stats, topic breakdown, member trends), then
 * uses backend runtime to produce:
 *   - Personalised `recommendedActions` grounded in the coach's actual data
 *   - A `geminiSummary` narrative paragraph for the Coach Growth tab
 *
 * Falls back to the heuristic profile if runtime is unavailable or fails.
 *
 * @param allLessons   Full lesson history for this coach
 * @param clients      Registered client profiles for this coach
 * @param coachProfile Coach profile object
 * @param language     Output language (ko | en | ja)
 */
export const generateCoachXGrowthProfile = async (
  allLessons: Lesson[],
  clients: ClientProfile[],
  coachProfile: CoachProfile,
  language: CoachXLanguage = 'ko'
): Promise<CoachGrowthProfile> => {
  const fallback = () => generateCoachGrowthProfile(allLessons, clients, language);

  if (allLessons.length === 0) return fallback();

  // Compute the heuristic profile for deterministic metrics
  const heuristicProfile = generateCoachGrowthProfile(allLessons, clients, language);

  try {
    const memberCount = new Set(allLessons.map(l => `${l.clientName}_${l.clientPhone}`)).size;

    const topTopics = heuristicProfile.topicBreakdown
      .slice(0, 5)
      .map(t => `${t.topic}(${t.count})`)
      .join(', ');

    const growthOpp = heuristicProfile.growthOpportunities.join(', ') || 'none identified';

    const { memberTrends } = heuristicProfile;
    const trendSummary = `improving:${memberTrends.improving}, plateau:${memberTrends.plateau}, new:${memberTrends.new}, inactive:${memberTrends.inactive}`;

    const LANG_INSTRUCTION: Record<CoachXLanguage, string> = {
      ko: '반드시 한국어로 작성하세요.',
      en: 'Write entirely in English.',
      ja: '必ず日本語で記述してください。',
      th: 'Write entirely in English.',
    };

    const systemInstruction = `You are CoachX, an AI coaching intelligence assistant for golf coaches.

Your task is to generate two things from the coach's stats:

1. "recommendedActions": array of 3–5 short, supportive, data-driven action strings for the coach.
   - Ground each in the data above; never use generic filler.
   - Tone: supportive and constructive ("this could help" rather than "you are lacking").

2. "geminiSummary": a single paragraph (3–5 sentences) that gives the coach a personalised overview
   of their coaching practice and development direction, referencing their actual stats.
   - Supportive, encouraging, globally appropriate tone.
   - No bullet points; plain prose only.

Language rule: ${LANG_INSTRUCTION[language]}`;

    const prompt = `Coach: ${coachProfile.name}
Total lessons recorded: ${allLessons.length} | Total members: ${memberCount}
Lessons this month: ${heuristicProfile.lessonsThisMonth} | Last month: ${heuristicProfile.lessonsLastMonth}
Active members (last 90 days): ${heuristicProfile.activeMembersCount}
Avg sessions per active member: ${heuristicProfile.avgSessionsPerActiveMember}
Top lesson topics (with frequency): ${topTopics || 'none recorded'}
Potential coaching expansion areas: ${growthOpp}
Member growth trends: ${trendSummary}`;

    const result = await invokeBackendAI<unknown>('coachx_growth_profile', {
      prompt,
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: coachXGrowthProfileSchema,
      language,
    });
    const text = getResponseText(result);
    const parsed = (text
      ? parseJsonObjectFromText(text)
      : result) as { recommendedActions?: string[]; geminiSummary?: string } | null;
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid growth profile response');
    }

    const actions = Array.isArray(parsed.recommendedActions) && parsed.recommendedActions.length > 0
      ? parsed.recommendedActions.filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
      : heuristicProfile.recommendedActions;

    const summary = typeof parsed.geminiSummary === 'string' && parsed.geminiSummary.trim().length > 0
      ? parsed.geminiSummary.trim()
      : undefined;

    return {
      ...heuristicProfile,
      recommendedActions: actions,
      geminiSummary: summary,
    };
  } catch (error) {
    log.error('CoachX runtime growth profile error:', error);
    return fallback();
  }
};

/**
 * Analyzes motion capture screenshots (K-Motion, 3D tracking systems) to extract
 * body movement measurements and provide golf coaching analysis.
 */
export const analyzeMotionCapture = async (
  imageInputs: AnalysisInput[],
  coachNotes?: string,
  coachId?: string
): Promise<MotionCaptureData> => {
  const mediaParts = await Promise.all(
    imageInputs.map(async (input) => {
      const blob = typeof input.data === 'string'
        ? await getBlobFromUrl(input.data)
        : input.data;
      return fileToGenerativePart(blob, input.mimeType);
    })
  );

  const isFirebaseMode = firebaseService.isInitialized();
  const systemInstruction = await promptService.getActiveSystemPrompt(
    'motion_capture',
    isFirebaseMode,
    coachId
  );

  const prompt = `이 이미지들은 골프 스윙 3D 모션 캡처 시스템(K-Motion, Swing Catalyst 등)의 화면 캡처입니다.
화면 오른쪽 패널에는 스켈레톤 모델과 다음 7가지 측정값이 표시됩니다:
- 고개가 앞으로 쏠림 (Head forward tilt, cm, 방향: 앞/뒤)
- 머리 좌우로 흔들림 (Head lateral sway, cm, 방향: 좌/우/정)
- 상체 상부 밀림 (Upper body forward push, cm, 방향: 앞/뒤/정)
- 머리 들림 (Head lift/dip, cm, 방향: 상/하)
- 상체 상부 좌우 이동 (Upper body lateral move, cm, 방향: 좌/우/정)
- 골반 밀림 (Hip slide, cm, 방향: 앞/뒤/정)
- 상체 상부 들림 (Upper body rise, cm, 방향: 상/하)

각 이미지의 화면 하단 타임라인에서 현재 시간(초)을 읽을 수 있습니다.
스윙 단계는 타임라인 시간을 기준으로 추정하세요 (예: 0초 근처 = 어드레스 또는 임팩트, 음수 = 백스윙).
${coachNotes ? `\n코치 메모: "${coachNotes}"` : ''}

각 이미지에서 측정값과 타임라인을 추출해 measurements 배열에 담고, 종합 코칭 피드백을 aiAnalysis에 마크다운으로 작성하세요.
aiAnalysis에는 다음을 포함하세요:
- 주요 이슈 (수치가 큰 항목 중심)
- 스윙 단계별 주목할 패턴
- 구체적인 교정 방향 및 연습 방법
- 전반적인 평가 (회원 친화적 톤)`;

  try {
    const result = await invokeBackendAI<unknown>('motion_capture_analysis', {
      prompt,
      systemInstruction,
      mediaParts,
      responseMimeType: 'application/json',
      responseSchema: motionCaptureSchema,
    });

    const text = getResponseText(result);
    const parsed = text ? parseJsonObjectFromText(text) : (result as Record<string, unknown> | null);

    if (parsed && Array.isArray(parsed.measurements) && typeof parsed.aiAnalysis === 'string') {
      return {
        measurements: parsed.measurements as MotionCaptureData['measurements'],
        aiAnalysis: parsed.aiAnalysis,
        analyzedAt: Date.now(),
      };
    }
    throw new Error('Invalid motion capture response format');
  } catch (error) {
    log.error('Motion capture analysis error:', error);
    return {
      measurements: [],
      aiAnalysis: '## 모션 데이터 분석\n\n이미지에서 모션 데이터를 추출하지 못했습니다. 이미지가 K-Motion 또는 유사한 3D 모션 캡처 시스템의 화면인지 확인해주세요.',
      analyzedAt: Date.now(),
    };
  }
};

export interface TrackmanScreenAnalysisResult {
  clubSpeed?: number;
  ballSpeed?: number;
  smashFactor?: number;
  launchAngle?: number;
  spinRate?: number;
  carryDistance?: number;
  totalDistance?: number;
}

const parseTrackmanScreenResponse = (text: string): TrackmanScreenAnalysisResult => {
  try {
    const parsed = JSON.parse(text);
    const toNum = (v: unknown): number | undefined => {
      const n = typeof v === 'string' ? parseFloat(v) : Number(v);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    return {
      clubSpeed: toNum(parsed?.clubSpeed),
      ballSpeed: toNum(parsed?.ballSpeed),
      smashFactor: toNum(parsed?.smashFactor),
      launchAngle: toNum(parsed?.launchAngle),
      spinRate: toNum(parsed?.spinRate),
      carryDistance: toNum(parsed?.carryDistance),
      totalDistance: toNum(parsed?.totalDistance),
    };
  } catch {
    return {};
  }
};

export const analyzeTrackmanScreen = async (
  imageInput: AnalysisInput
): Promise<TrackmanScreenAnalysisResult> => {
  try {
    const blob =
      typeof imageInput.data === 'string'
        ? await getBlobFromUrl(imageInput.data)
        : imageInput.data;
    const mediaPart = await fileToGenerativePart(blob, imageInput.mimeType);

    const prompt = `
      너는 골프 런치 모니터(트랙맨, GC Quad, Foresight 등) 화면에서 수치를 읽어내는 AI다.
      입력된 이미지는 런치 모니터 화면 캡처 또는 사진이다.

      화면에 표시된 수치를 정확히 읽어 아래 JSON만 출력해라.
      숫자를 읽을 수 없거나 해당 항목이 없으면 null로 표기해라.

      {
        "clubSpeed": number | null,
        "ballSpeed": number | null,
        "smashFactor": number | null,
        "launchAngle": number | null,
        "spinRate": number | null,
        "carryDistance": number | null,
        "totalDistance": number | null
      }

      각 필드 설명:
      - clubSpeed: 클럽 헤드 스피드 (m/s 또는 mph — 화면 단위 그대로 읽어라, mph이면 m/s로 변환하지 말 것)
      - ballSpeed: 볼 스피드 (m/s 또는 mph)
      - smashFactor: 스매시 팩터 (소수점 2~3자리, 보통 1.2~1.5 범위)
      - launchAngle: 발사각 (도, °)
      - spinRate: 스핀 (rpm)
      - carryDistance: 캐리 거리 (m 또는 yards — 화면 단위 그대로)
      - totalDistance: 토탈 거리 (m 또는 yards)

      규칙:
      - 화면에 표시된 숫자를 그대로 읽어라. 단위 변환하지 마라.
      - 숫자 외에 다른 텍스트는 출력하지 마라.
      - 코드블록 없이 순수 JSON만 반환해라.
    `;

    const result = await invokeBackendAI<unknown>('analyze_trackman_screen', {
      prompt,
      mediaParts: [mediaPart],
      responseMimeType: 'application/json',
      responseSchema: trackmanScreenSchema,
    });
    const text = getJsonTextFromResult(result);
    if (!text) return {};
    return parseTrackmanScreenResponse(text);
  } catch (error) {
    log.error('AI trackman screen analysis failed:', error);
    return {};
  }
};

const DAY_LABELS: Record<string, string> = {
  mon: '월요일', tue: '화요일', wed: '수요일', thu: '목요일',
  fri: '금요일', sat: '토요일', sun: '일요일',
};

const buildRichGolferContext = (
  myLessons: Lesson[],
  quickLogs: QuickLogEntry[],
  homeworkList: Homework[],
  clientProfile: ClientProfile
): string => {
  const sections: string[] = [];

  // Body analysis (from profile or most recent lesson that has it)
  const bodyAnalysis =
    clientProfile.memberBodyAnalysis ??
    myLessons.find(l => l.memberBodyAnalysis)?.memberBodyAnalysis;
  if (bodyAnalysis) {
    const highImpactFactors = bodyAnalysis.structuralFactors
      ?.filter(f => f.impact === '상' || f.impact === '하')
      .map(f => `${f.name}(${f.impact})`)
      .join(', ');
    const lines = [
      `체형: ${bodyAnalysis.bodyType} | 스윙 유형: ${bodyAnalysis.swingType}`,
    ];
    if (highImpactFactors) lines.push(`주요 구조 특성: ${highImpactFactors}`);
    if (bodyAnalysis.coachComment) lines.push(`코치 의견: ${bodyAnalysis.coachComment}`);
    sections.push(`[신체 분석]\n${lines.join('\n')}`);
  }

  // Recent lessons / practice / round records
  const recentLessons = [...myLessons]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 15);

  if (recentLessons.length > 0) {
    const lessonLines = recentLessons.map(l => formatLessonEntry(l));
    sections.push(`[레슨·연습·라운드 기록 (최근 ${recentLessons.length}개)]\n${lessonLines.join('\n\n')}`);
  }

  // Quick logs
  const recentLogs = [...quickLogs]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 10);

  if (recentLogs.length > 0) {
    const MOOD_KO: Record<string, string> = {
      GREAT: '최고', GOOD: '좋음', OKAY: '보통', BAD: '나쁨', TERRIBLE: '최악',
    };
    const AREA_KO: Record<string, string> = {
      DRIVER: '드라이버', IRON: '아이언', SHORT_GAME: '숏게임',
      PUTTING: '퍼팅', ROUND: '라운드', OTHER: '기타',
    };
    const logLines = recentLogs.map(log => {
      const parts = [`[${log.logDate}] 기분: ${MOOD_KO[log.mood] || log.mood}`];
      if (log.practiceArea) parts.push(`분야: ${AREA_KO[log.practiceArea] || log.practiceArea}`);
      if (log.goodPoint) parts.push(`잘된 점: ${log.goodPoint.substring(0, 100)}`);
      if (log.problemPoint) parts.push(`문제점: ${log.problemPoint.substring(0, 100)}`);
      if (log.notes) parts.push(`메모: ${log.notes.substring(0, 80)}`);
      return parts.join(' | ');
    });

    // Most-practiced area
    const areaFreq: Record<string, number> = {};
    recentLogs.forEach(log => {
      if (log.practiceArea) areaFreq[log.practiceArea] = (areaFreq[log.practiceArea] || 0) + 1;
    });
    const topArea = Object.entries(areaFreq).sort((a, b) => b[1] - a[1])[0];
    const topAreaNote = topArea
      ? `→ 주요 연습 분야: ${AREA_KO[topArea[0]] || topArea[0]} (${topArea[1]}회)`
      : '';

    sections.push(
      `[연습 일지 (최근 ${recentLogs.length}개)]\n${logLines.join('\n')}${topAreaNote ? `\n${topAreaNote}` : ''}`
    );
  }

  // All pending homework
  const pendingHw = homeworkList.filter(h => !h.isCompleted);
  if (pendingHw.length > 0) {
    const hwLines = pendingHw
      .map(h => `- [${h.date || '기한 없음'}] ${h.title}`)
      .join('\n');
    sections.push(`[미완료 숙제·미션 (${pendingHw.length}개)]\n${hwLines}`);
  }

  return sections.join('\n\n');
};

const buildCoachContext = (coachProfile: CoachProfile | undefined, designatedCoachName: string | undefined): string => {
  if (!coachProfile) {
    return `담당 코치: ${designatedCoachName || '미지정'}`;
  }

  const lines: string[] = [
    `담당 코치 이름: ${coachProfile.name}`,
  ];
  if (coachProfile.phone) lines.push(`코치 연락처: ${coachProfile.phone}`);
  if (coachProfile.email) lines.push(`코치 이메일: ${coachProfile.email}`);

  const schedule = coachProfile.workingSchedule;
  if (schedule && Object.keys(schedule).length > 0) {
    const scheduleParts: string[] = [];
    for (const [day, entry] of Object.entries(schedule)) {
      if (!entry) continue;
      const label = DAY_LABELS[day] ?? day;
      if (entry.isClosed) {
        scheduleParts.push(`${label}: 휴무`);
      } else {
        scheduleParts.push(`${label}: ${entry.open} ~ ${entry.close}`);
      }
    }
    if (scheduleParts.length > 0) {
      lines.push(`코치 스케줄:\n${scheduleParts.map(s => `  - ${s}`).join('\n')}`);
    }
  }

  return lines.join('\n');
};

export const generateStudentChatResponse = async (
  userMessage: string,
  myLessons: Lesson[],
  clientProfile: ClientProfile,
  homeworkList: Homework[],
  language: CoachXLanguage = 'ko',
  coachProfile?: CoachProfile,
  quickLogs: QuickLogEntry[] = [],
  conversationHistory: { role: 'user' | 'assistant'; content: string }[] = []
): Promise<string> => {
  try {
    const golferContext = buildRichGolferContext(myLessons, quickLogs, homeworkList, clientProfile);
    const coachContext = buildCoachContext(coachProfile, clientProfile.designatedCoach);

    const LANG_INSTRUCTION: Record<CoachXLanguage, string> = {
      ko: '반드시 한국어로 답변하세요. 친근하고 격려하는 톤으로 말해주세요.',
      en: 'Respond entirely in English. Use a friendly and encouraging tone.',
      ja: '必ず日本語で回答してください。フレンドリーで励ますトーンで話してください。',
      th: 'Respond in English with a friendly and encouraging tone.',
    };

    // Format prior conversation turns (last 10 turns max)
    const historyToInclude = conversationHistory.slice(-10);
    const conversationBlock = historyToInclude.length > 0
      ? '\n=== 이전 대화 내역 (오래된 순) ===\n' +
        historyToInclude
          .map(m => `${m.role === 'user' ? '학생' : 'CoachX'}: ${m.content}`)
          .join('\n') +
        '\n'
      : '';

    // Student inherits their designated coach's style: pass the coach's id so
    // the coach-scoped active template (if any) wins over the global default.
    const isFirebaseMode = firebaseService.isInitialized();
    const baseSystemPrompt = await promptService.getActiveSystemPrompt(
      'student_chat',
      isFirebaseMode,
      coachProfile?.id
    );

    const systemInstruction = `${baseSystemPrompt}

언어 지시: ${LANG_INSTRUCTION[language]}`;

    const prompt = `--- 제공 데이터 (이 데이터만 기반으로 답변) ---
=== 학생 프로필 ===
이름: ${clientProfile.name}
핸디캡: ${clientProfile.handicap || '미입력'}
베스트 스코어: ${clientProfile.bestScore || '미입력'}
총 레슨·기록 수: ${myLessons.length}

=== 지정 코치 정보 ===
${coachContext}

=== 골프 기록 데이터 ===
${golferContext || '기록 없음 (기본기 위주로 조언해 주세요)'}
${conversationBlock}--- 제공 데이터 끝 ---

=== 학생 질문 ===
"${userMessage}"`;

    const result = await invokeBackendAI<unknown>('student_chat', {
      prompt,
      systemInstruction,
      language,
      userMessage,
    });
    const text = getResponseText(result) ?? '';
    if (!text.trim()) throw new Error('Empty response');
    return text;
  } catch (error) {
    log.error('Student chat error:', error);
    const name = clientProfile.name;
    const fallbacks: Record<CoachXLanguage, string> = {
      ko: `안녕하세요, ${name}님! 현재 AI 서비스에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해주세요. 궁금한 점은 코치님께 직접 문의해보세요!`,
      en: `Hi ${name}! The AI service is temporarily unavailable. Please try again shortly or contact your coach directly.`,
      ja: `こんにちは、${name}さん！AIサービスに現在接続できません。しばらくしてから再度お試しください。`,
      th: `Hi ${name}! The AI service is temporarily unavailable. Please try again shortly.`,
    };
    return fallbacks[language] ?? fallbacks['ko'];
  }
};

// ─── Phase B: Prompt generation from uploaded documents ─────────────────────

/**
 * Short description of what each PromptTarget is responsible for, in the
 * coach's language. Used to steer the meta-extractor so the produced
 * systemPrompt is calibrated to the right AI feature.
 */
const TARGET_DESCRIPTIONS_FOR_EXTRACTION: Record<import('../types').PromptTarget, string> = {
  coachx_chat: '코치가 CoachX AI에게 자기 회원·레슨에 대해 물어볼 때 응답하는 대화형 코칭 어시스턴트',
  coachx_insights: '코치 대시보드에 표시되는 3~5개 코칭 인사이트(JSON 배열)를 생성',
  weekly_insight: '회원 주간 연습 인사이트(summary/keyPatterns/recommendedFocus JSON) 생성',
  coach_material: '코치가 다음 레슨에 쓸 교재/드릴 초안 생성',
  lesson_summary: '레슨 영상·이미지·오디오를 바탕으로 회원에게 공유할 레슨 리포트(마크다운) 생성',
  compare_swings: 'Before/After 두 스윙(영상·이미지·오디오) 비교 분석(JSON) 생성',
  motion_capture: 'K-Motion 등 3D 모션캡처 화면을 읽고 수치 + 마크다운 코칭 피드백 생성',
  training_program: '회원별 맞춤 주간 훈련 프로그램(마크다운) 생성',
  student_chat: '학생 전용 CoachX AI가 자기 기록 데이터를 근거로 골프 관련 질문에 답변',
  shot_analysis: '골퍼의 볼·클럽·모션·신체·키네마틱 데이터를 종합해 코스 공략·런치/스핀 최적화·클럽/모션 원인·키네마틱 시퀀스까지 담긴 마크다운 리포트 생성',
};

export interface GeneratedSystemPromptResult {
  /** Drop-in text a coach can paste into PromptTemplate.systemPrompt. */
  systemPrompt: string;
  /** 1–2 sentence summary of what was extracted (for coach to skim). */
  summary: string;
  /** Optional distilled principles from the document. */
  principles?: string[];
  /** Optional coach-preferred terminology extracted from the document. */
  preferredTerminology?: { term: string; meaning: string }[];
}

export interface StyleSourceDocument {
  file: Blob;
  mimeType: string;
  /** Optional display name — helps the model reference the source. */
  fileName?: string;
}

/**
 * Read one or more coach methodology documents and produce a runnable
 * systemPrompt tailored to a specific AI feature (target).
 *
 * Docs are sent to Gemini as inlineData — PDFs and text-based formats
 * are handled natively; DOCX must be converted to PDF or plain text
 * before calling. When multiple docs are provided they are FUSED into a
 * single coherent systemPrompt (methodology + tone + terminology from
 * across all sources).
 *
 * Accepts either the legacy single-file shape (`{ file, mimeType }`)
 * or the new multi-file shape (`{ files }`). The legacy shape is kept
 * for backwards compat with earlier callers.
 */
export const generateSystemPromptFromDocument = async (
  params:
    | {
        // Legacy single-file API (PR B1). Prefer `files` below for new callers.
        file: Blob;
        mimeType: string;
        target: import('../types').PromptTarget;
        existingSystemPrompt?: string;
      }
    | {
        files: StyleSourceDocument[];
        target: import('../types').PromptTarget;
        existingSystemPrompt?: string;
      }
): Promise<GeneratedSystemPromptResult> => {
  const target = params.target;
  const existingSystemPrompt = params.existingSystemPrompt;

  const sources: StyleSourceDocument[] =
    'files' in params
      ? params.files
      : [{ file: params.file, mimeType: params.mimeType }];

  if (sources.length === 0) {
    throw new Error('최소 1개 이상의 문서가 필요합니다.');
  }

  const mediaParts = await Promise.all(
    sources.map((s) => fileToGenerativePart(s.file, s.mimeType))
  );

  const targetDescription = TARGET_DESCRIPTIONS_FOR_EXTRACTION[target];

  const systemInstruction = `당신은 골프 코치의 강의자료·방법론 문서를 읽고,
Gemini에 전달할 시스템 프롬프트(systemInstruction)를 작성하는 프롬프트 엔지니어입니다.

작성 원칙:
- 문서에 실제로 담긴 방법론·원칙·표현·톤·용어를 최대한 반영합니다.
- 문서에 없는 내용을 지어내지 않습니다.
- systemPrompt는 그대로 붙여 넣어 바로 쓸 수 있는 형태로 작성합니다 (마크다운 지원).
- 코치의 어투와 우선순위를 시스템 프롬프트의 원칙 섹션으로 정리합니다.
- 문서에 반복해서 나오는 용어는 preferredTerminology로 정리합니다.
- summary는 코치가 검토용으로 훑을 1~2문장 요약입니다.`;

  const existingBlock = existingSystemPrompt
    ? `\n\n[코치가 지금 쓰고 있는 systemPrompt — 참고. 문서 내용을 반영해 개선/재작성하되, 문서와 충돌이 없다면 기존 어투를 유지]\n${existingSystemPrompt}`
    : '';

  // Multi-doc: give the model an index so it can cross-reference sources
  // when principles/terminology come from different documents.
  const docIndex = sources
    .map((s, i) => `문서 ${i + 1}${s.fileName ? `: ${s.fileName}` : ''}`)
    .join('\n');
  const multiDocBlock =
    sources.length > 1
      ? `\n\n첨부된 문서 목록 (${sources.length}개, 아래 순서대로 inline 첨부):\n${docIndex}\n\n여러 문서에 걸친 방법론·원칙·용어를 하나의 응집된 systemPrompt로 통합해 주세요. 서로 모순되는 지침이 있으면 문서 순서(위쪽이 우선)를 따르되 요약에 명시해 주세요.`
      : '';

  const prompt = `대상 AI 기능(target): ${target}
이 기능이 하는 일: ${targetDescription}

첨부 ${sources.length === 1 ? '문서' : `문서 ${sources.length}개`}를 정독해서, 이 코치의 방법론을 반영한 systemPrompt를
"${target}" 기능이 매 요청마다 받게 될 시스템 지시문으로 작성해 주세요.${multiDocBlock}${existingBlock}

응답은 JSON 스키마를 따르며, 다음 필드를 포함합니다:
- systemPrompt: 붙여넣어 바로 쓸 수 있는 시스템 프롬프트 (마크다운 가능, 300~1200자 권장)
- summary: 코치가 훑을 1~2문장 (예: "문서 ${sources.length}개에서 XX 원칙과 YY 용어 4개를 추출해 반영했습니다")
- principles: 3~8개의 원칙 bullet (systemPrompt에도 이미 포함되어야 함)
- preferredTerminology: 코치가 반복적으로 쓰는 용어와 의미`;

  const result = await invokeBackendAI<unknown>('generate_system_prompt', {
    prompt,
    systemInstruction,
    mediaParts,
    responseMimeType: 'application/json',
    responseSchema: generateSystemPromptFromDocumentSchema,
    temperature: 0.4,
  });

  const text = getJsonTextFromResult(result);
  const parsed = parseJsonObjectFromText(text);
  if (!parsed) {
    throw new Error('AI가 유효한 응답을 반환하지 않았습니다.');
  }

  const systemPrompt = typeof parsed.systemPrompt === 'string' ? parsed.systemPrompt.trim() : '';
  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
  if (!systemPrompt) {
    throw new Error('AI 응답에 systemPrompt가 비어 있습니다.');
  }

  const principles = Array.isArray(parsed.principles)
    ? (parsed.principles.filter((p): p is string => typeof p === 'string' && p.trim().length > 0))
    : undefined;

  const preferredTerminology = Array.isArray(parsed.preferredTerminology)
    ? parsed.preferredTerminology
        .filter(
          (t): t is { term: string; meaning: string } =>
            !!t &&
            typeof t === 'object' &&
            typeof (t as Record<string, unknown>).term === 'string' &&
            typeof (t as Record<string, unknown>).meaning === 'string'
        )
    : undefined;

  return {
    systemPrompt,
    summary: summary || '문서에서 방법론을 추출했습니다.',
    principles,
    preferredTerminology,
  };
};

// ─── Phase B3: Interview-mode prompt building ───────────────────────────────

export interface InterviewTurn {
  question: string;
  answer: string;
}

export interface InterviewNextQuestionResult {
  /** The next question to ask the coach. */
  question: string;
  /** True when the interviewer thinks there's enough signal to synthesise a prompt. */
  isFinal: boolean;
  /** Optional short reason the interviewer chose this question (dev-facing). */
  rationale?: string;
}

/**
 * Ask Gemini what to ask a coach next given the interview transcript so far.
 *
 * The first call passes an empty transcript and gets an opening question
 * tailored to the target. Subsequent calls append the coach's answers and
 * receive follow-up questions that dig deeper into their methodology.
 *
 * When the model believes the transcript already contains enough signal
 * (typically after 5–8 substantive Q&A pairs) it returns isFinal=true so
 * the UI can suggest wrapping up.
 */
export const generateInterviewQuestion = async (params: {
  target: import('../types').PromptTarget;
  transcript: InterviewTurn[];
  existingSystemPrompt?: string;
}): Promise<InterviewNextQuestionResult> => {
  const { target, transcript, existingSystemPrompt } = params;
  const targetDescription = TARGET_DESCRIPTIONS_FOR_EXTRACTION[target];

  const systemInstruction = `당신은 골프 코치의 방법론을 인터뷰하는 시니어 코치입니다.
목표: 이 코치의 스타일·원칙·용어·톤을 끌어내서, 나중에 그것을 시스템 프롬프트로 변환할 수 있게 만드는 것.

인터뷰 원칙:
- 매번 하나의 질문만 던집니다. 다중 질문 금지.
- 이미 답변받은 내용을 반복해 묻지 않습니다.
- 대상 AI 기능(target)에 필요한 정보를 우선 확보합니다.
- 추상적 원칙보다 구체적인 실전 예시("슬라이스 회원을 처음 만났을 때 첫 30초에 뭘 하시나요?")를 유도합니다.
- 코치가 실제로 쓰는 어투/용어를 짧게 답변에서 재사용해 라포를 형성합니다.
- 5~8개 정도의 실질적 Q&A가 쌓였고 target에 필요한 핵심 축(원칙·톤·용어·예시)이 다뤄졌으면 isFinal=true로 설정합니다.
- 답변이 너무 짧아 정보가 부족하면 더 구체적으로 재질문합니다.`;

  const transcriptBlock =
    transcript.length === 0
      ? '지금까지의 대화: 없음 (첫 질문)'
      : `지금까지의 대화 (오래된 순):\n${transcript
          .map((t, i) => `Q${i + 1}. ${t.question}\nA${i + 1}. ${t.answer || '(스킵)'}`)
          .join('\n\n')}`;

  const existingBlock = existingSystemPrompt
    ? `\n\n[코치가 지금 쓰고 있는 systemPrompt — 참고. 인터뷰 질문은 이 프롬프트를 보완/개선할 정보에 초점]\n${existingSystemPrompt}`
    : '';

  const prompt = `대상 AI 기능(target): ${target}
이 기능이 하는 일: ${targetDescription}

${transcriptBlock}${existingBlock}

원칙에 따라 다음 질문 하나를 한국어로 만들어 주세요.
isFinal=true 시 question 필드에는 짧게 "완료" 대신, "지금까지의 답변으로 프롬프트를 만들 준비가 됐습니다. 마지막으로 덧붙이고 싶은 게 있나요?" 같은 마무리 질문을 넣습니다.`;

  const result = await invokeBackendAI<unknown>('generate_interview_question', {
    prompt,
    systemInstruction,
    responseMimeType: 'application/json',
    responseSchema: interviewQuestionSchema,
    temperature: 0.7,
  });

  const text = getJsonTextFromResult(result);
  const parsed = parseJsonObjectFromText(text);
  if (!parsed || typeof parsed.question !== 'string' || !parsed.question.trim()) {
    throw new Error('AI가 유효한 질문을 반환하지 않았습니다.');
  }

  return {
    question: parsed.question.trim(),
    isFinal: parsed.isFinal === true,
    rationale: typeof parsed.rationale === 'string' ? parsed.rationale : undefined,
  };
};

/**
 * Turn a completed interview transcript into a systemPrompt by feeding it
 * to the existing document→prompt pipeline as a synthetic text "document".
 * Reuses generateSystemPromptFromDocument so B1/B2/B3 all converge on the
 * same downstream synthesis + provenance behaviour.
 */
export const finalizeInterviewToSystemPrompt = async (params: {
  target: import('../types').PromptTarget;
  transcript: InterviewTurn[];
  existingSystemPrompt?: string;
}): Promise<GeneratedSystemPromptResult & { transcriptBlob: Blob; transcriptFileName: string }> => {
  const { target, transcript, existingSystemPrompt } = params;

  if (transcript.length === 0) {
    throw new Error('빈 인터뷰로는 프롬프트를 생성할 수 없습니다.');
  }

  const now = new Date();
  const stamp = now.toISOString().slice(0, 10);
  const header = `# 코치 인터뷰 대화록\n생성 시각: ${now.toISOString()}\n대상 target: ${target}\n총 Q&A: ${transcript.length}건\n\n`;
  const body = transcript
    .map(
      (t, i) =>
        `## Q${i + 1}. ${t.question}\n\n${t.answer.trim() || '(코치가 스킵함)'}\n`
    )
    .join('\n');
  const transcriptText = header + body;
  const transcriptBlob = new Blob([transcriptText], { type: 'text/plain' });
  const transcriptFileName = `coach-interview-${target}-${stamp}.txt`;

  const result = await generateSystemPromptFromDocument({
    files: [
      {
        file: transcriptBlob,
        mimeType: 'text/plain',
        fileName: transcriptFileName,
      },
    ],
    target,
    existingSystemPrompt,
  });

  return {
    ...result,
    transcriptBlob,
    transcriptFileName,
  };
};

// ─── Shot data synthesis ────────────────────────────────────────────────────

/**
 * Snapshot of a golfer's shots for a single club — post filtering.
 * Callers can either pre-compute the aggregate themselves, or hand raw
 * shots to analyzeShotStrategy and let it do a basic outlier-robust
 * summary (IQR-based, which the built-in prompt also references so the
 * model applies the same "consistent shots" mental model).
 */
export interface ShotAggregate {
  club: string;
  sampleSize: number;
  carryDistance?: { median: number; iqr: [number, number] };
  totalDistance?: { median: number; iqr: [number, number] };
  ballSpeed?: { median: number; iqr: [number, number] };
  clubHeadSpeed?: { median: number; iqr: [number, number] };
  launchAngle?: { median: number; iqr: [number, number] };
  spinRate?: { median: number; iqr: [number, number] };
  smashFactor?: { median: number; iqr: [number, number] };
  clubPath?: { median: number; iqr: [number, number] };
  faceAngle?: { median: number; iqr: [number, number] };
  attackAngle?: { median: number; iqr: [number, number] };
  dynamicLoft?: { median: number; iqr: [number, number] };
  spinLoft?: { median: number; iqr: [number, number] };
  sideTotal?: { median: number; iqr: [number, number] };
}

const median = (values: number[]): number => {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

const quantile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
};

/**
 * Compute a robust median + IQR summary for a numeric field. IQR is used
 * both as the "consistent-shot window" and as the outlier filter (values
 * beyond 1.5 × IQR from the median are considered miss-shots and dropped
 * from the median re-calculation). Returns undefined when there aren't
 * enough valid samples to compute anything meaningful.
 */
const robustSummary = (
  rawValues: Array<number | null | undefined>
): { median: number; iqr: [number, number] } | undefined => {
  const values = rawValues.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v)
  );
  if (values.length < 3) {
    // Too few samples for outlier filtering; return the plain median if any.
    if (values.length === 0) return undefined;
    const m = median(values);
    return { median: m, iqr: [Math.min(...values), Math.max(...values)] };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  const inliers = sorted.filter((v) => v >= lower && v <= upper);
  const source = inliers.length >= 3 ? inliers : sorted;
  return {
    median: median(source),
    iqr: [quantile(source, 0.25), quantile(source, 0.75)],
  };
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

const formatRobustSummary = (
  label: string,
  unit: string,
  summary: ReturnType<typeof robustSummary>
): string | null => {
  if (!summary) return null;
  const m = round1(summary.median);
  const lo = round1(summary.iqr[0]);
  const hi = round1(summary.iqr[1]);
  return `${label} median ${m}${unit} (IQR ${lo}–${hi})`;
};

/**
 * Build a `ShotAggregate` per club from raw lessons. Uses IQR-based
 * outlier trimming so severe miss-shots don't skew the "consistent shot"
 * summary the coaching methodology wants.
 */
export const summariseShotsByClub = (lessons: Lesson[]): ShotAggregate[] => {
  const buckets = new Map<string, Lesson[]>();
  for (const l of lessons) {
    if (!l.club || !l.golfData) continue;
    const key = l.club;
    const arr = buckets.get(key);
    if (arr) arr.push(l);
    else buckets.set(key, [l]);
  }
  const aggregates: ShotAggregate[] = [];
  for (const [club, arr] of buckets.entries()) {
    if (arr.length === 0) continue;
    const carry = robustSummary(arr.map((l) => l.golfData?.carryDistance ?? null));
    const total = robustSummary(arr.map((l) => l.golfData?.totalDistance ?? null));
    const ballSpeed = robustSummary(arr.map((l) => l.golfData?.ballSpeed ?? null));
    const clubHeadSpeed = robustSummary(arr.map((l) => l.golfData?.clubHeadSpeed ?? null));
    const launchAngle = robustSummary(arr.map((l) => l.golfData?.launchAngle ?? null));
    const spinRate = robustSummary(arr.map((l) => l.golfData?.spinRate ?? null));
    const smashFactor = robustSummary(arr.map((l) => l.golfData?.smashFactor ?? null));
    const clubPath = robustSummary(arr.map((l) => l.golfData?.clubPath ?? null));
    const faceAngle = robustSummary(arr.map((l) => l.golfData?.faceAngle ?? null));
    const attackAngle = robustSummary(arr.map((l) => l.golfData?.attackAngle ?? null));
    const dynamicLoft = robustSummary(arr.map((l) => l.golfData?.dynamicLoft ?? null));
    const spinLoft = robustSummary(arr.map((l) => l.golfData?.spinLoft ?? null));
    const sideTotal = robustSummary(arr.map((l) => l.golfData?.sideTotal ?? null));
    aggregates.push({
      club,
      sampleSize: arr.length,
      carryDistance: carry,
      totalDistance: total,
      ballSpeed,
      clubHeadSpeed,
      launchAngle,
      spinRate,
      smashFactor,
      clubPath,
      faceAngle,
      attackAngle,
      dynamicLoft,
      spinLoft,
      sideTotal,
    });
  }
  // Rough tour-order sort so the report reads driver → wedge → putter.
  const CLUB_ORDER = ['드라이버', 'DRIVER', '3W', '5W', 'UT', 'U', '3I', '4I', '5I', '6I', '7I', '8I', '9I', 'PW', 'AW', 'SW', 'LW', 'P', '퍼터'];
  aggregates.sort((a, b) => {
    const ai = CLUB_ORDER.findIndex((k) => a.club.toUpperCase().includes(k.toUpperCase()));
    const bi = CLUB_ORDER.findIndex((k) => b.club.toUpperCase().includes(k.toUpperCase()));
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return aggregates;
};

const formatShotAggregate = (agg: ShotAggregate): string => {
  const lines: string[] = [
    `[${agg.club}] 샘플 ${agg.sampleSize}개 (IQR 기준 이상치 필터 적용)`,
  ];
  const bits: (string | null)[] = [
    formatRobustSummary('  캐리', 'm', agg.carryDistance),
    formatRobustSummary('  토탈', 'm', agg.totalDistance),
    formatRobustSummary('  볼속도', 'km/h', agg.ballSpeed),
    formatRobustSummary('  헤드속도', 'km/h', agg.clubHeadSpeed),
    formatRobustSummary('  런치앵글', '°', agg.launchAngle),
    formatRobustSummary('  스핀량', 'rpm', agg.spinRate),
    formatRobustSummary('  스매시팩터', '', agg.smashFactor),
    formatRobustSummary('  어택앵글', '°', agg.attackAngle),
    formatRobustSummary('  클럽패스', '°', agg.clubPath),
    formatRobustSummary('  페이스앵글', '°', agg.faceAngle),
    formatRobustSummary('  다이나믹로프트', '°', agg.dynamicLoft),
    formatRobustSummary('  스핀로프트', '°', agg.spinLoft),
    formatRobustSummary('  사이드토탈', 'm', agg.sideTotal),
  ];
  for (const b of bits) if (b) lines.push(b);
  return lines.join('\n');
};

const formatBodyAnalysisForShot = (
  clientProfile: ClientProfile,
  lessons: Lesson[]
): string | null => {
  const body =
    clientProfile.memberBodyAnalysis ??
    lessons.find((l) => l.memberBodyAnalysis)?.memberBodyAnalysis;
  if (!body) return null;
  const lines = [`체형: ${body.bodyType} | 스윙 유형: ${body.swingType}`];
  const highImpact = body.structuralFactors
    ?.filter((f) => f.impact === '상' || f.impact === '하')
    .map((f) => `${f.name}(${f.impact})`)
    .join(', ');
  if (highImpact) lines.push(`주요 구조 특성: ${highImpact}`);
  if (body.coachComment) lines.push(`코치 의견: ${body.coachComment}`);
  return lines.join('\n');
};

const formatMotionForShot = (lessons: Lesson[]): string | null => {
  const withMotion = lessons.filter(
    (l) => l.motionCaptureData?.measurements?.length
  );
  if (withMotion.length === 0) return null;
  const latest = withMotion.sort((a, b) => b.createdAt - a.createdAt)[0];
  const mc = latest.motionCaptureData!;
  const rows: string[] = [];
  for (const m of mc.measurements.slice(0, 5)) {
    const p = m.swingPhase ? `[${m.swingPhase}] ` : '';
    const nums: string[] = [];
    if (m.headLift != null && m.headLift !== 0) nums.push(`머리들림 ${m.headLift}cm`);
    if (m.hipSlide != null && m.hipSlide !== 0) nums.push(`힙슬라이드 ${m.hipSlide}cm`);
    if (m.upperBodyPush != null && m.upperBodyPush !== 0) nums.push(`상체밀림 ${m.upperBodyPush}cm`);
    if (m.headLateralSway != null && m.headLateralSway !== 0) nums.push(`머리흔들림 ${m.headLateralSway}cm`);
    if (m.upperBodyLift != null && m.upperBodyLift !== 0) nums.push(`상체들림 ${m.upperBodyLift}cm`);
    if (nums.length) rows.push(`${p}${nums.join(' | ')}`);
  }
  if (rows.length === 0) return null;
  return `가장 최근 모션 측정 (${latest.date}):\n${rows.join('\n')}`;
};

export interface ShotStrategyReport {
  markdown: string;
  /** How many lessons contributed golf data to this analysis. */
  contributingLessonCount: number;
  /** Distinct clubs the report covers. */
  clubsAnalysed: string[];
}

/**
 * Produce a comprehensive shot-strategy report for a golfer, following
 * the built-in `shot_analysis` methodology (course strategy → launch/spin
 * optimisation → club optimisation → motion causation → body-aware next
 * step → kinematic sequence).
 *
 * The AI is given robust (IQR-based) per-club aggregates that already
 * drop miss-shots, along with body and motion context, so its analysis
 * is grounded in the golfer's actual consistent shots — not raw averages.
 */
export const analyzeShotStrategy = async (params: {
  clientProfile: ClientProfile;
  lessons: Lesson[];
  coachId?: string;
  /** Optional: caller can override the auto-aggregation with their own. */
  aggregates?: ShotAggregate[];
}): Promise<ShotStrategyReport> => {
  const { clientProfile, lessons, coachId } = params;

  const lessonsWithData = lessons.filter((l) => l.golfData && l.club);
  const aggregates =
    params.aggregates ??
    summariseShotsByClub(lessonsWithData);

  if (aggregates.length === 0) {
    throw new Error('분석할 클럽별 볼 데이터가 없습니다.');
  }

  const isFirebaseMode = firebaseService.isInitialized();
  const systemInstruction = await promptService.getActiveSystemPrompt(
    'shot_analysis',
    isFirebaseMode,
    coachId
  );

  // Coach-style exemplars — the ⭐ starred and ✏️ edited reports the
  // coach has saved. Injected as few-shot so the model mirrors the
  // coach's tone. Falls back to global exemplars when the coach hasn't
  // saved any yet, so a new coach still gets the benefit of the shared pool.
  const exemplars = await coachStyleService.getForTarget(
    'shot_analysis',
    coachId,
    isFirebaseMode,
    { limit: 3 }
  );
  const fewShotBlock = buildFewShotBlock(exemplars);

  const profileLines = [
    `이름: ${clientProfile.name}`,
    clientProfile.handicap != null ? `핸디캡: ${clientProfile.handicap}` : '핸디캡: 미입력',
    clientProfile.bestScore != null ? `베스트: ${clientProfile.bestScore}` : '',
    clientProfile.memo ? `메모: ${clientProfile.memo}` : '',
  ].filter(Boolean).join('\n- ');

  const aggregateBlock = aggregates.map(formatShotAggregate).join('\n\n');
  const bodyBlock = formatBodyAnalysisForShot(clientProfile, lessonsWithData);
  const motionBlock = formatMotionForShot(lessonsWithData);

  // Physics grounding — build a Trackman-referenced optimal-range block
  // for each club that has a measured clubhead speed. Prevents the F2
  // hallucination (model inventing "7I 최적 런치 18-20°" numbers that
  // don't match published tour data).
  const physicsLookups = aggregates
    .filter((a): a is typeof a & { clubHeadSpeed: { median: number; iqr: [number, number] } } =>
      !!a.clubHeadSpeed && Number.isFinite(a.clubHeadSpeed.median)
    )
    .map((a) => ({ club: a.club, clubSpeedMph: a.clubHeadSpeed.median }));
  const physicsBlock = buildPhysicsReferenceBlock(physicsLookups);

  const prompt = `${fewShotBlock ? `${fewShotBlock}\n\n` : ''}분석 대상 골퍼
- ${profileLines}
- 볼 데이터가 있는 레슨·연습 기록: ${lessonsWithData.length}건
- 커버 클럽: ${aggregates.map((a) => `${a.club}(${a.sampleSize})`).join(', ')}

=== 클럽별 볼·클럽 데이터 요약 (median + IQR, 이상치 이미 필터됨) ===
${aggregateBlock}

${physicsBlock ? `${physicsBlock}\n` : ''}
${bodyBlock ? `=== 신체 분석 ===\n${bodyBlock}\n` : '(신체 분석 데이터 없음)\n'}
${motionBlock ? `=== 모션 데이터 (최근 측정) ===\n${motionBlock}\n` : '(모션 데이터 없음 — 관련 진단은 확률적 추정으로 표시)\n'}

시스템 지시(원칙)에 따라 마크다운 종합 리포트를 작성해 주세요.
- 각 섹션 헤더 형식 유지
- 클럽별 캐리·토탈 탄착 좌표는 median 기준으로 추정하되, IQR 폭을 "산포"로 설명
- 핀 위치별 공략은 실제 sideTotal/spinRate 부호가 있으면 그것을 근거로
- 데이터가 없는 섹션은 "데이터 부족" 표시`;

  const result = await invokeBackendAI<unknown>('shot_analysis', {
    prompt,
    systemInstruction,
  });

  const markdown = getResponseText(result) ?? '';
  if (!markdown.trim()) {
    throw new Error('AI가 빈 응답을 반환했습니다.');
  }

  return {
    markdown,
    contributingLessonCount: lessonsWithData.length,
    clubsAnalysed: aggregates.map((a) => a.club),
  };
};

/**
 * Streaming variant of analyzeShotStrategy.
 *
 * Same prompt assembly, same return shape — but chunks arrive via `onChunk`
 * as the model writes each section. shot_analysis runs 20-30s end-to-end;
 * streaming brings the first paragraph to the coach in ~500ms, turning
 * the wait from "spinner" into "watching the report take shape".
 *
 * If the backend doesn't support streaming (`StreamNotSupportedError`),
 * we transparently fall back to the non-streaming path — the caller's
 * `onChunk` fires exactly once with the full text at completion.
 */
export const analyzeShotStrategyStream = async (params: {
  clientProfile: ClientProfile;
  lessons: Lesson[];
  coachId?: string;
  aggregates?: ShotAggregate[];
  /** Called every time the model emits a text delta. `accumulated` is the
   *  full markdown produced so far — bind it directly to your UI state. */
  onChunk: (delta: string, accumulated: string) => void;
  signal?: AbortSignal;
}): Promise<ShotStrategyReport> => {
  const { clientProfile, lessons, coachId, onChunk, signal } = params;

  const lessonsWithData = lessons.filter((l) => l.golfData && l.club);
  const aggregates =
    params.aggregates ?? summariseShotsByClub(lessonsWithData);

  if (aggregates.length === 0) {
    throw new Error('분석할 클럽별 볼 데이터가 없습니다.');
  }

  const isFirebaseMode = firebaseService.isInitialized();
  const systemInstruction = await promptService.getActiveSystemPrompt(
    'shot_analysis',
    isFirebaseMode,
    coachId
  );

  // Same coach-style few-shot injection as the non-streaming variant so
  // the streamed path also benefits from accumulated exemplars.
  const exemplars = await coachStyleService.getForTarget(
    'shot_analysis',
    coachId,
    isFirebaseMode,
    { limit: 3 }
  );
  const fewShotBlock = buildFewShotBlock(exemplars);

  const profileLines = [
    `이름: ${clientProfile.name}`,
    clientProfile.handicap != null ? `핸디캡: ${clientProfile.handicap}` : '핸디캡: 미입력',
    clientProfile.bestScore != null ? `베스트: ${clientProfile.bestScore}` : '',
    clientProfile.memo ? `메모: ${clientProfile.memo}` : '',
  ]
    .filter(Boolean)
    .join('\n- ');

  const aggregateBlock = aggregates.map(formatShotAggregate).join('\n\n');
  const bodyBlock = formatBodyAnalysisForShot(clientProfile, lessonsWithData);
  const motionBlock = formatMotionForShot(lessonsWithData);

  // Physics grounding — same as the non-streaming variant. Kept in both
  // so callers on either path get the F2 fix.
  const physicsLookups = aggregates
    .filter((a): a is typeof a & { clubHeadSpeed: { median: number; iqr: [number, number] } } =>
      !!a.clubHeadSpeed && Number.isFinite(a.clubHeadSpeed.median)
    )
    .map((a) => ({ club: a.club, clubSpeedMph: a.clubHeadSpeed.median }));
  const physicsBlock = buildPhysicsReferenceBlock(physicsLookups);

  const prompt = `${fewShotBlock ? `${fewShotBlock}\n\n` : ''}분석 대상 골퍼
- ${profileLines}
- 볼 데이터가 있는 레슨·연습 기록: ${lessonsWithData.length}건
- 커버 클럽: ${aggregates.map((a) => `${a.club}(${a.sampleSize})`).join(', ')}

=== 클럽별 볼·클럽 데이터 요약 (median + IQR, 이상치 이미 필터됨) ===
${aggregateBlock}

${physicsBlock ? `${physicsBlock}\n` : ''}
${bodyBlock ? `=== 신체 분석 ===\n${bodyBlock}\n` : '(신체 분석 데이터 없음)\n'}
${motionBlock ? `=== 모션 데이터 (최근 측정) ===\n${motionBlock}\n` : '(모션 데이터 없음 — 관련 진단은 확률적 추정으로 표시)\n'}

시스템 지시(원칙)에 따라 마크다운 종합 리포트를 작성해 주세요.
- 각 섹션 헤더 형식 유지
- 클럽별 캐리·토탈 탄착 좌표는 median 기준으로 추정하되, IQR 폭을 "산포"로 설명
- 핀 위치별 공략은 실제 sideTotal/spinRate 부호가 있으면 그것을 근거로
- 데이터가 없는 섹션은 "데이터 부족" 표시`;

  let markdown = '';
  try {
    markdown = await invokeBackendAIStream(
      'shot_analysis',
      { prompt, systemInstruction },
      { onChunk, signal }
    );
  } catch (streamErr) {
    if (streamErr instanceof StreamNotSupportedError) {
      // Backend doesn't support streaming yet — fall back so the coach
      // still gets a report. Deliver the full text as one chunk so the
      // UI code path stays uniform.
      const result = await invokeBackendAI<unknown>('shot_analysis', {
        prompt,
        systemInstruction,
      });
      markdown = getResponseText(result) ?? '';
      if (markdown) onChunk(markdown, markdown);
    } else {
      throw streamErr;
    }
  }

  if (!markdown.trim()) {
    throw new Error('AI가 빈 응답을 반환했습니다.');
  }

  return {
    markdown,
    contributingLessonCount: lessonsWithData.length,
    clubsAnalysed: aggregates.map((a) => a.club),
  };
};
