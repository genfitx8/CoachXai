import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isGeminiApiConfigured,
  invokeGeminiApi,
} from '../server/src/services/geminiApiRuntime';
import type { AgentRuntimeInvokeRequest } from '../server/src/services/agentPlatformRuntime';

const FAKE_KEY = 'test-api-key';

describe('geminiApiRuntime', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
  });

  describe('isGeminiApiConfigured', () => {
    it('returns false when GEMINI_API_KEY is not set', () => {
      delete process.env.GEMINI_API_KEY;
      expect(isGeminiApiConfigured()).toBe(false);
    });

    it('returns false when GEMINI_API_KEY is empty string', () => {
      process.env.GEMINI_API_KEY = '';
      expect(isGeminiApiConfigured()).toBe(false);
    });

    it('returns true when GEMINI_API_KEY is set', () => {
      process.env.GEMINI_API_KEY = FAKE_KEY;
      expect(isGeminiApiConfigured()).toBe(true);
    });
  });

  describe('invokeGeminiApi', () => {
    it('throws when GEMINI_API_KEY is not set', async () => {
      delete process.env.GEMINI_API_KEY;
      const request: AgentRuntimeInvokeRequest = {
        operation: 'test_op',
        prompt: 'hello',
      };
      await expect(invokeGeminiApi(request)).rejects.toThrow(
        /GEMINI_API_KEY/
      );
    });

    it('sends request to Gemini API and returns text', async () => {
      process.env.GEMINI_API_KEY = FAKE_KEY;
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Hello from Gemini' }],
                role: 'model',
              },
            },
          ],
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const request: AgentRuntimeInvokeRequest = {
        operation: 'coachx_chat',
        prompt: 'How do I improve my swing?',
      };
      const result = await invokeGeminiApi(request);

      expect(result.text).toBe('Hello from Gemini');
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(
          'generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
        ),
        expect.objectContaining({ method: 'POST' })
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-goog-api-key': FAKE_KEY }),
        })
      );
    });

    it('uses GEMINI_MODEL env var when set', async () => {
      process.env.GEMINI_API_KEY = FAKE_KEY;
      process.env.GEMINI_MODEL = 'gemini-1.5-pro';
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'pro response' }], role: 'model' } }],
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await invokeGeminiApi({ operation: 'test', prompt: 'hi' });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('gemini-1.5-pro:generateContent'),
        expect.any(Object)
      );
    });

    it('includes inlineData parts correctly', async () => {
      process.env.GEMINI_API_KEY = FAKE_KEY;
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            { content: { parts: [{ text: 'image analysis result' }], role: 'model' } },
          ],
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const request: AgentRuntimeInvokeRequest = {
        operation: 'analyze_image',
        parts: [
          { text: 'describe this image' },
          { inlineData: { data: 'base64data==', mimeType: 'image/jpeg' } },
        ],
      };
      const result = await invokeGeminiApi(request);
      expect(result.text).toBe('image analysis result');

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
        contents: Array<{ role: string; parts: unknown[] }>;
      };
      const parts = callBody.contents[0].parts as Array<Record<string, unknown>>;
      expect(parts).toHaveLength(2);
      expect(parts[0]).toEqual({ text: 'describe this image' });
      expect(parts[1]).toEqual({
        inline_data: { data: 'base64data==', mime_type: 'image/jpeg' },
      });
    });

    it('includes text prompt alongside media parts when both are provided', async () => {
      process.env.GEMINI_API_KEY = FAKE_KEY;
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            { content: { parts: [{ text: 'lesson summary result' }], role: 'model' } },
          ],
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      // This mirrors the real frontend call: a text prompt + media parts together.
      // Previously, the text prompt was silently dropped when parts were present.
      const request: AgentRuntimeInvokeRequest = {
        operation: 'lesson_summary',
        prompt: 'Summarize this golf lesson',
        parts: [
          { inlineData: { data: 'base64video==', mimeType: 'video/mp4' } },
        ],
      };
      const result = await invokeGeminiApi(request);
      expect(result.text).toBe('lesson summary result');

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
        contents: Array<{ role: string; parts: unknown[] }>;
      };
      const parts = callBody.contents[0].parts as Array<Record<string, unknown>>;
      // Text prompt must be the first part, followed by the media part
      expect(parts).toHaveLength(2);
      expect(parts[0]).toEqual({ text: 'Summarize this golf lesson' });
      expect(parts[1]).toEqual({
        inline_data: { data: 'base64video==', mime_type: 'video/mp4' },
      });
    });

    it('throws on non-ok HTTP response', async () => {
      process.env.GEMINI_API_KEY = FAKE_KEY;
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'API key invalid' } }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        invokeGeminiApi({ operation: 'test', prompt: 'hi' })
      ).rejects.toThrow(/400.*API key invalid/);
    });

    it('throws when response has no candidates', async () => {
      process.env.GEMINI_API_KEY = FAKE_KEY;
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ candidates: [] }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        invokeGeminiApi({ operation: 'test', prompt: 'hi' })
      ).rejects.toThrow(/empty response/i);
    });

    it('passes responseMimeType and temperature in generationConfig', async () => {
      process.env.GEMINI_API_KEY = FAKE_KEY;
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            { content: { parts: [{ text: '{}' }], role: 'model' } },
          ],
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await invokeGeminiApi({
        operation: 'json_op',
        prompt: 'return json',
        responseMimeType: 'application/json',
        temperature: 0.5,
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
        generationConfig: { responseMimeType: string; temperature: number };
      };
      expect(callBody.generationConfig.responseMimeType).toBe('application/json');
      expect(callBody.generationConfig.temperature).toBe(0.5);
    });
  });
});
