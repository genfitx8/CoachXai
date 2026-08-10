/**
 * aiStream — Client-side SSE reader for the /api/ai/invoke-stream endpoint.
 *
 * Mirrors invokeBackendAI's contract but hands each chunk to `onChunk` as
 * it arrives, then resolves with the full concatenated text. This is the
 * path CoachX chat uses so users see the first token in ~300ms instead
 * of waiting for the full response.
 *
 * Observability
 * -------------
 * A single AiCallLog entry is written when the stream finishes. Latency
 * is measured end-to-end (open → done). First-token latency isn't
 * captured in the log today — future work when the aiCallLogger grows
 * a dedicated field.
 *
 * Fallback
 * --------
 * Streaming isn't available for every runtime (the backend returns 501
 * when GEMINI_API_KEY isn't the active runtime). Callers can catch a
 * `StreamNotSupportedError` and fall back to invokeBackendAI's
 * non-streaming path — see generateCoachXChatResponseStream for the
 * canonical pattern.
 */
import { createLogger } from '../utils/logger';
import { recordAiCall, hashPrompt } from './aiCallLogger';
import { resolveApiBaseUrl } from './apiBase';
import { scanForInjection } from './promptSafety';

const log = createLogger('aiStream');

const API_BASE = resolveApiBaseUrl();

const getStreamEndpoint = (): string => {
  if (API_BASE) return `${API_BASE}/api/ai/invoke-stream`;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/ai/invoke-stream`;
  }
  return '/api/ai/invoke-stream';
};

export class StreamNotSupportedError extends Error {
  constructor(message = 'Streaming endpoint returned 501 — runtime unsupported') {
    super(message);
    this.name = 'StreamNotSupportedError';
  }
}

/**
 * Pull SSE events off a Response body. Yields the raw event objects
 * (`{ event, data }`); the caller parses `data` as JSON if needed.
 */
async function* readSseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<
  { event: string; data: string },
  void,
  void
> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let eventEnd: number;
    while ((eventEnd = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, eventEnd);
      buffer = buffer.slice(eventEnd + 2);

      let eventName = 'message';
      const dataParts: string[] = [];
      for (const line of rawEvent.split('\n')) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataParts.push(line.slice(5).trim());
        }
      }
      if (dataParts.length > 0) {
        yield { event: eventName, data: dataParts.join('') };
      }
    }
  }
}

// Same payload-inspection shape as invokeBackendAI's, kept local so the
// two paths log the same signals about each request.
const inspectPayload = (payload: unknown): {
  prompt: string;
  coachId?: string;
  hasExemplars: boolean;
  hasSchema: boolean;
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
  const hasExemplars =
    prompt.includes('참고 예시') || systemInstruction.includes('참고 예시');
  const hasSchema = 'responseSchema' in rec && rec.responseSchema != null;
  return { prompt, coachId, hasExemplars, hasSchema, userMessage };
};

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

export interface StreamOptions {
  /** Called on every text delta as it arrives. */
  onChunk?: (delta: string, accumulated: string) => void;
  /** AbortSignal — call abort() to cancel the stream mid-flight. */
  signal?: AbortSignal;
}

/**
 * Stream a response from the backend. Resolves with the full concatenated
 * text once the server sends the `done` event. Throws:
 *  - StreamNotSupportedError when the server returns 501
 *  - Error with the server-side message on `event: error`
 *  - Error on network failure
 *
 * Logging is fire-and-forget after the stream terminates — the caller's
 * awaited return does not wait for telemetry.
 */
export const invokeBackendAIStream = async (
  feature: string,
  payload: unknown,
  options: StreamOptions = {}
): Promise<string> => {
  const startedAt = Date.now();
  const meta = inspectPayload(payload);
  const injection = buildInjectionSignal(meta.userMessage);
  let accumulated = '';
  let firstChunkAt: number | null = null;
  let modelId: string | undefined;

  const finalise = (
    status: 'success' | 'error',
    errorMessage?: string
  ): void => {
    void recordAiCall({
      feature,
      coachId: meta.coachId,
      prompt: meta.prompt,
      responseText: accumulated,
      latencyMs: Date.now() - startedAt,
      status,
      errorMessage,
      hasExemplars: meta.hasExemplars,
      hasSchema: meta.hasSchema,
      model: modelId,
      ...injection,
    });
    // Cache-write parity: the streaming path doesn't populate the cache
    // today because streamed callers (chat) aren't in CACHEABLE_FEATURES.
    // If that changes, mirror invokeBackendAI's cache-write here.
    void firstChunkAt; // reserved for future first-token latency logging
    void hashPrompt;   // reserved for future cache-write
  };

  let response: Response;
  try {
    response = await fetch(getStreamEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature, payload }),
      signal: options.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    finalise('error', msg);
    throw err;
  }

  if (response.status === 501) {
    finalise('error', 'stream 501');
    throw new StreamNotSupportedError();
  }
  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => '');
    const msg = `stream failed (HTTP ${response.status}): ${body.slice(0, 200)}`;
    finalise('error', msg);
    throw new Error(msg);
  }

  try {
    for await (const evt of readSseEvents(response.body)) {
      if (evt.event === 'meta') {
        // Server emits `event: meta\ndata: {"model":"…"}` once before the
        // first chunk so telemetry can attach the model to this call.
        try {
          const parsed = JSON.parse(evt.data) as { model?: string };
          if (typeof parsed.model === 'string' && parsed.model.trim()) {
            modelId = parsed.model;
          }
        } catch {
          log.warn('malformed meta event', evt.data);
        }
      } else if (evt.event === 'chunk') {
        try {
          const parsed = JSON.parse(evt.data) as { text?: string };
          if (typeof parsed.text === 'string' && parsed.text.length > 0) {
            if (firstChunkAt === null) firstChunkAt = Date.now();
            accumulated += parsed.text;
            options.onChunk?.(parsed.text, accumulated);
          }
        } catch {
          log.warn('malformed chunk event', evt.data);
        }
      } else if (evt.event === 'done') {
        finalise('success');
        return accumulated;
      } else if (evt.event === 'error') {
        let msg = 'stream error';
        try {
          const parsed = JSON.parse(evt.data) as { message?: string };
          if (parsed.message) msg = parsed.message;
        } catch { /* keep default */ }
        finalise('error', msg);
        throw new Error(msg);
      }
    }
    // Stream ended without a `done` event — treat as success if we got any
    // text, error otherwise.
    if (accumulated) {
      finalise('success');
      return accumulated;
    }
    finalise('error', 'stream closed without done');
    throw new Error('stream closed without done event');
  } catch (err) {
    if (accumulated) {
      // Partial output — log it but re-throw so the caller can decide
      // whether to keep the partial or fall back.
      finalise('error', err instanceof Error ? err.message : String(err));
    }
    throw err;
  }
};
