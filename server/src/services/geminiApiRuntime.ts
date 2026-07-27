import type { AgentRuntimeInvokeRequest } from './agentPlatformRuntime';

export type { AgentRuntimeInvokeRequest };

const DEFAULT_MODEL = 'gemini-2.5-flash';
const MAX_ERROR_DETAIL_LENGTH = 400;

// Retry configuration for transient upstream failures.
// Retryable: network errors, 408, 429, 500, 502, 503, 504.
// Non-retryable: 4xx client errors (invalid request, auth, etc.).
const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_BACKOFF_MS = 500;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

const getApiKey = () => (process.env.GEMINI_API_KEY ?? '').trim();
const getModel = () => (process.env.GEMINI_MODEL ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;

export const isGeminiApiConfigured = (): boolean => Boolean(getApiKey());

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const backoffDelay = (attempt: number): number => {
  const base = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
  // Add up to 30% jitter to avoid thundering-herd on retries after a shared outage.
  return base + Math.random() * base * 0.3;
};

export const invokeGeminiApi = async (
  request: AgentRuntimeInvokeRequest
): Promise<{ text: string }> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Gemini API is not configured. Set GEMINI_API_KEY.');
  }

  const model = getModel();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  type GeminiPart =
    | { text: string }
    | { inline_data: { data: string; mime_type: string } };

  const mappedParts: GeminiPart[] = (request.parts ?? []).map((p) => {
    if ('text' in p) return { text: p.text };
    return {
      inline_data: {
        data: p.inlineData.data,
        mime_type: p.inlineData.mimeType,
      },
    };
  });

  // When media parts are present, prepend the text prompt so Gemini receives
  // both the instructions and the media in a single content block.
  // Without this, the text prompt is silently dropped for all multimodal calls.
  const contentParts: GeminiPart[] =
    mappedParts.length > 0
      ? request.prompt
        ? [{ text: request.prompt }, ...mappedParts]
        : mappedParts
      : request.prompt
      ? [{ text: request.prompt }]
      : [];

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: contentParts }],
    ...(request.systemInstruction
      ? {
          systemInstruction: {
            parts: [{ text: request.systemInstruction }],
          },
        }
      : {}),
    generationConfig: {
      ...(request.responseMimeType
        ? { responseMimeType: request.responseMimeType }
        : {}),
      ...(request.responseSchema
        ? { responseSchema: request.responseSchema }
        : {}),
      ...(request.temperature !== undefined
        ? { temperature: request.temperature }
        : {}),
    },
  };

  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(body),
      });
    } catch (networkError) {
      lastError = networkError;
      if (attempt < MAX_RETRY_ATTEMPTS - 1) {
        await sleep(backoffDelay(attempt));
        continue;
      }
      throw new Error(
        `Gemini API network error after ${MAX_RETRY_ATTEMPTS} attempts: ${
          networkError instanceof Error ? networkError.message : String(networkError)
        }`
      );
    }

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      const err = payload.error as Record<string, unknown> | undefined;
      const message =
        typeof err?.message === 'string'
          ? err.message
          : JSON.stringify(payload).slice(0, MAX_ERROR_DETAIL_LENGTH);
      const fullMessage = `Gemini API request failed (${response.status}): ${message}`;

      if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < MAX_RETRY_ATTEMPTS - 1) {
        lastError = new Error(fullMessage);
        await sleep(backoffDelay(attempt));
        continue;
      }
      throw new Error(fullMessage);
    }

    // Extract text from the standard Gemini generateContent response shape:
    // { candidates: [{ content: { parts: [{ text: "..." }] } }] }
    const candidates = payload.candidates as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(candidates) && candidates.length > 0) {
      const content = candidates[0].content as Record<string, unknown> | undefined;
      const parts = content?.parts as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(parts)) {
        const textParts = parts
          .filter((p) => typeof p.text === 'string')
          .map((p) => p.text as string);
        if (textParts.length > 0) {
          return { text: textParts.join('\n') };
        }
      }
    }

    throw new Error('Gemini API returned an empty response.');
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Gemini API request failed after retries.');
};
