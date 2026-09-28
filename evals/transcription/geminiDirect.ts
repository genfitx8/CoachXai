/**
 * 평가용 Gemini 직접 호출 — 서버 게이트웨이(routes/ai.ts → geminiApiRuntime)와
 * 같은 요청 모양·같은 모델 라우팅을 쓰되, 인증·과금 없이 API 키로 바로 부른다.
 * 호출량(토큰)을 경로·모델별로 모아 보고서에 비용 근거로 싣는다.
 */
import { resolveModel } from '../../server/src/services/modelRouter';

/** 레슨 필기 경로는 서버에서 모두 최저 온도(0.1)로 돈다(routes/ai.ts). */
const TEMPERATURE = 0.1;
const MAX_ATTEMPTS = 4;

interface Usage {
  feature: string;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** 실패한 호출 수 — 파이프라인은 실패를 삼키고 앞 단계 결과를 쓰므로 여기서 드러낸다. */
  errors: number;
}

const usage = new Map<string, Usage>();
let lastError: unknown = null;

export const resetUsage = (): void => {
  usage.clear();
  lastError = null;
};
export const getUsage = (): Usage[] => [...usage.values()];
/** 마지막 실패 원인 — 파이프라인이 삼킨 오류를 보고서에 싣는다. */
export const getLastError = (): unknown => lastError;

const entry = (feature: string, model: string): Usage => {
  const key = `${feature}|${model}`;
  const u = usage.get(key) ?? { feature, model, calls: 0, inputTokens: 0, outputTokens: 0, errors: 0 };
  usage.set(key, u);
  return u;
};

const record = (feature: string, model: string, meta: Record<string, number> | undefined) => {
  const u = entry(feature, model);
  u.calls += 1;
  u.inputTokens += meta?.promptTokenCount ?? 0;
  u.outputTokens += (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const callGeminiForFeature = async (
  feature: string,
  payload: Record<string, unknown>
): Promise<string> => {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY 가 없습니다.');
  const model = resolveModel(feature);

  const media = Array.isArray(payload.mediaParts)
    ? (payload.mediaParts as Array<{ inlineData: { data: string; mimeType: string } }>)
    : [];
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: String(payload.prompt ?? '') },
          ...media.map((m) => ({
            inline_data: { data: m.inlineData.data, mime_type: m.inlineData.mimeType },
          })),
        ],
      },
    ],
    generationConfig: {
      ...(payload.responseMimeType ? { responseMimeType: payload.responseMimeType } : {}),
      ...(payload.responseSchema ? { responseSchema: payload.responseSchema } : {}),
      temperature: TEMPERATURE,
    },
  };

  let failure: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
      }
    );
    if (res.ok) {
      const json = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
        usageMetadata?: Record<string, number>;
      };
      record(feature, model, json.usageMetadata);
      const text = (json.candidates?.[0]?.content?.parts ?? [])
        .filter((p) => typeof p.text === 'string' && !p.thought)
        .map((p) => p.text)
        .join('');
      if (!text.trim()) {
        failure = new Error(`${feature}: 빈 응답`);
        break;
      }
      return text;
    }
    failure = new Error(`${feature} (${model}) HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    // 429·5xx 는 물러났다가 다시, 그 밖(400·404 등)은 설정 문제라 바로 실패.
    if (res.status !== 429 && res.status < 500) break;
    await sleep(2_000 * 2 ** attempt);
  }
  entry(feature, model).errors += 1;
  lastError = failure;
  throw failure;
};
