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
): Promise<{ text: string; model: string }> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Gemini API is not configured. Set GEMINI_API_KEY.');
  }

  // Prefer the model the router picked for this feature; fall back to the
  // process default so callers that don't set request.model still work.
  const model = (request.model ?? '').trim() || getModel();
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
          return { text: textParts.join('\n'), model };
        }
      }
    }

    throw new Error('Gemini API returned an empty response.');
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Gemini API request failed after retries.');
};

/**
 * Streaming variant — yields incremental text chunks from Gemini's
 * `streamGenerateContent` endpoint. The upstream uses SSE-like framing
 * (`data: {…}\n\n`); we parse each event, pull out the text delta, and
 * pass it through as a plain string. Non-text events (finish reasons,
 * usage) are silently ignored — the caller only cares about deltas.
 *
 * No retries here: streaming responses are stateful, restarting mid-stream
 * would produce a garbled concatenation. If the first byte fails, the
 * caller can fall back to invokeGeminiApi.
 */
/**
 * The stream yields two kinds of items:
 *  - `{ type: 'meta', model }`  — emitted once at the start so the caller
 *    can attach the model id to telemetry / SSE headers.
 *  - `{ type: 'text', text }`   — one per text delta, in order.
 * A simple discriminated union keeps the API additive; callers ignore
 * `meta` entries and consume `text` entries as before.
 */
export type GeminiStreamItem =
  | { type: 'meta'; model: string }
  | { type: 'text'; text: string };

export const streamGeminiApi = async function* (
  request: AgentRuntimeInvokeRequest
): AsyncGenerator<GeminiStreamItem, void, void> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Gemini API is not configured. Set GEMINI_API_KEY.');
  }

  const model = (request.model ?? '').trim() || getModel();
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

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

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    const errPayload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const err = errPayload.error as Record<string, unknown> | undefined;
    const message =
      typeof err?.message === 'string'
        ? err.message
        : JSON.stringify(errPayload).slice(0, MAX_ERROR_DETAIL_LENGTH);
    throw new Error(`Gemini stream failed (${response.status}): ${message}`);
  }

  // Announce the chosen model up-front so the caller can propagate it
  // before any text arrives (SSE headers / observability capture).
  yield { type: 'meta', model };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Gemini SSE separates events with a blank line (\n\n). Process every
    // completed event, keep the trailing partial line in the buffer.
    let eventEnd: number;
    while ((eventEnd = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, eventEnd);
      buffer = buffer.slice(eventEnd + 2);

      // Each event is one or more lines like `data: {…}` — join data lines.
      const dataLines = rawEvent
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim());
      if (dataLines.length === 0) continue;
      const joined = dataLines.join('');
      if (!joined || joined === '[DONE]') continue;

      try {
        const parsed = JSON.parse(joined) as Record<string, unknown>;
        const candidates = parsed.candidates as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(candidates) || candidates.length === 0) continue;
        const content = candidates[0].content as Record<string, unknown> | undefined;
        const parts = content?.parts as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(parts)) continue;
        for (const p of parts) {
          if (typeof p.text === 'string' && p.text.length > 0) {
            yield { type: 'text', text: p.text };
          }
        }
      } catch {
        // Malformed event — skip, keep streaming.
        continue;
      }
    }
  }
};
