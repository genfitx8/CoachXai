/**
 * Tests for the client-side SSE stream reader.
 *
 * The tests fake `fetch` to return a hand-crafted SSE body, then exercise
 * the reader's chunk/done/error handling and its interaction with the
 * telemetry recorder.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/storage', () => ({
  storageService: {
    saveAiCallLog: vi.fn(),
    getAiCallLogs: vi.fn(() => []),
  },
}));

vi.mock('../services/firebase', () => ({
  firebaseService: {
    isInitialized: vi.fn(() => false),
    saveAiCallLog: vi.fn(() => Promise.resolve()),
    getAiCallLogs: vi.fn(() => Promise.resolve([])),
  },
}));

vi.mock('../services/apiBase', () => ({
  resolveApiBaseUrl: () => '',
}));

import {
  invokeBackendAIStream,
  StreamNotSupportedError,
} from '../services/aiStream';
import { storageService } from '../services/storage';

/**
 * Build a ReadableStream out of an array of string parts. Each part becomes
 * one Uint8Array chunk the reader will see, letting us test event framing
 * across chunk boundaries.
 */
const makeStream = (parts: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const p of parts) controller.enqueue(encoder.encode(p));
      controller.close();
    },
  });
};

const okResponse = (parts: string[]): Response =>
  new Response(makeStream(parts), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });

describe('invokeBackendAIStream', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    // Flush any pending telemetry from the previous test — recordAiCall is
    // fire-and-forget so its microtasks can straddle test boundaries and
    // pollute the next test's call count if we don't wait.
    await new Promise((r) => setTimeout(r, 20));
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('accumulates chunk text and resolves with the full response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      okResponse([
        'event: chunk\ndata: {"text":"Hello, "}\n\n',
        'event: chunk\ndata: {"text":"world!"}\n\n',
        'event: done\ndata: {"status":"ok"}\n\n',
      ])
    );

    const chunks: string[] = [];
    const result = await invokeBackendAIStream(
      'coachx_chat',
      { prompt: 'hi' },
      { onChunk: (delta) => chunks.push(delta) }
    );

    expect(chunks).toEqual(['Hello, ', 'world!']);
    expect(result).toBe('Hello, world!');
  });

  it('handles events split across chunk boundaries', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      okResponse([
        'event: chunk\nda',
        'ta: {"text":"A"}\n\nevent: chun',
        'k\ndata: {"text":"B"}\n\nevent: done\ndata: {}\n\n',
      ])
    );
    const result = await invokeBackendAIStream('coachx_chat', {
      prompt: 'x',
    });
    expect(result).toBe('AB');
  });

  it('throws StreamNotSupportedError on 501', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response('{"ok":false}', { status: 501 })
    );
    await expect(
      invokeBackendAIStream('coachx_chat', { prompt: 'x' })
    ).rejects.toBeInstanceOf(StreamNotSupportedError);
  });

  it('throws when the server sends an error event', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      okResponse([
        'event: chunk\ndata: {"text":"partial"}\n\n',
        'event: error\ndata: {"message":"upstream boom"}\n\n',
      ])
    );
    await expect(
      invokeBackendAIStream('coachx_chat', { prompt: 'x' })
    ).rejects.toThrow('upstream boom');
  });

  // Telemetry recording is fire-and-forget (void recordAiCall). Flushing
  // the microtask queue lets the pending Promise chain (hashPrompt →
  // saveAiCallLog) settle before the assertion runs.
  const flush = () => new Promise((r) => setTimeout(r, 20));

  it('records telemetry on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      okResponse(['event: chunk\ndata: {"text":"ok"}\n\nevent: done\ndata: {}\n\n'])
    );
    await invokeBackendAIStream('coachx_chat', { prompt: 'q' });
    await flush();
    expect(storageService.saveAiCallLog).toHaveBeenCalledTimes(1);
    const entry = (storageService.saveAiCallLog as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(entry.feature).toBe('coachx_chat');
    expect(entry.status).toBe('success');
    expect(entry.responseLength).toBe(2);
  });

  it('records telemetry with status=error on server error event', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      okResponse(['event: error\ndata: {"message":"nope"}\n\n'])
    );
    await expect(
      invokeBackendAIStream('coachx_chat', { prompt: 'q' })
    ).rejects.toThrow('nope');
    await flush();
    const entry = (storageService.saveAiCallLog as ReturnType<typeof vi.fn>).mock
      .calls.at(-1)?.[0];
    expect(entry?.status).toBe('error');
  });

  it('respects AbortSignal', async () => {
    const controller = new AbortController();
    globalThis.fetch = vi.fn().mockImplementationOnce(async (_url, init: RequestInit) => {
      // Simulate the browser rejecting fetch when the signal aborts.
      const signal = init.signal as AbortSignal;
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      return okResponse(['event: done\ndata: {}\n\n']);
    });
    controller.abort();
    await expect(
      invokeBackendAIStream(
        'coachx_chat',
        { prompt: 'x' },
        { signal: controller.signal }
      )
    ).rejects.toThrow();
  });
});
