/**
 * Tests for PR B1: generateSystemPromptFromDocument.
 *
 * Verifies:
 * 1. On success, returns parsed systemPrompt/summary and sends the request
 *    with the right feature, systemInstruction, mediaParts, and schema.
 * 2. Passes existingSystemPrompt into the user prompt so Gemini can refine it.
 * 3. Rejects when the AI returns an empty/invalid systemPrompt.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateSystemPromptFromDocument } from '../services/geminiService';

describe('generateSystemPromptFromDocument', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const makeFakePdf = () =>
    // A minimal blob is enough; the actual bytes are base64-encoded by
    // fileToGenerativePart and shipped to the mocked fetch.
    new Blob(['%PDF-1.4 fake content'], { type: 'application/pdf' });

  it('parses and returns the AI-generated system prompt', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: {
          text: JSON.stringify({
            systemPrompt: '당신은 코치 김철수 스타일의 골프 레슨 요약 AI입니다...',
            summary: '문서에서 5개 원칙과 3개 용어를 추출했습니다.',
            principles: ['원칙1', '원칙2'],
            preferredTerminology: [{ term: '어드레스', meaning: '준비 자세' }],
          }),
        },
      }),
    } as Response);

    const result = await generateSystemPromptFromDocument({
      file: makeFakePdf(),
      mimeType: 'application/pdf',
      target: 'lesson_summary',
    });

    expect(result.systemPrompt).toContain('김철수');
    expect(result.summary).toContain('5개 원칙');
    expect(result.principles).toEqual(['원칙1', '원칙2']);
    expect(result.preferredTerminology).toEqual([
      { term: '어드레스', meaning: '준비 자세' },
    ]);

    // Verify the wire payload: feature name, systemInstruction, mediaParts,
    // responseSchema all present.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.feature).toBe('generate_system_prompt');
    expect(body.payload.systemInstruction).toContain('프롬프트 엔지니어');
    expect(body.payload.mediaParts).toHaveLength(1);
    expect(body.payload.responseMimeType).toBe('application/json');
    expect(body.payload.responseSchema).toBeDefined();
    // Target should surface in the user prompt to steer generation.
    expect(body.payload.prompt).toContain('lesson_summary');
  });

  it('includes the existing systemPrompt in the request when provided', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: {
          text: JSON.stringify({
            systemPrompt: '개선된 프롬프트',
            summary: '기존 프롬프트를 유지하며 원칙을 보강했습니다.',
          }),
        },
      }),
    } as Response);

    await generateSystemPromptFromDocument({
      file: makeFakePdf(),
      mimeType: 'application/pdf',
      target: 'coachx_chat',
      existingSystemPrompt: '기존 챗봇 시스템 프롬프트 내용',
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.payload.prompt).toContain('기존 챗봇 시스템 프롬프트 내용');
  });

  it('rejects when the AI response has no systemPrompt', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: {
          text: JSON.stringify({ summary: '내용 없음' }),
        },
      }),
    } as Response);

    await expect(
      generateSystemPromptFromDocument({
        file: makeFakePdf(),
        mimeType: 'application/pdf',
        target: 'lesson_summary',
      })
    ).rejects.toThrow(/systemPrompt/);
  });

  it('rejects when the AI response is not valid JSON', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: { text: 'this is not json at all' },
      }),
    } as Response);

    await expect(
      generateSystemPromptFromDocument({
        file: makeFakePdf(),
        mimeType: 'application/pdf',
        target: 'lesson_summary',
      })
    ).rejects.toThrow();
  });

  // ─── PR B2: multi-document merge ───────────────────────────────────────
  it('accepts multiple files and sends each as a separate inlineData part', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: {
          text: JSON.stringify({
            systemPrompt: '3개 문서를 통합한 프롬프트',
            summary: '3개 문서에서 원칙과 용어를 통합했습니다.',
          }),
        },
      }),
    } as Response);

    const result = await generateSystemPromptFromDocument({
      files: [
        { file: makeFakePdf(), mimeType: 'application/pdf', fileName: '스윙지도.pdf' },
        { file: makeFakePdf(), mimeType: 'application/pdf', fileName: '멘탈지도.pdf' },
        { file: new Blob(['plain text notes'], { type: 'text/plain' }), mimeType: 'text/plain', fileName: 'notes.txt' },
      ],
      target: 'lesson_summary',
    });

    expect(result.systemPrompt).toContain('통합');

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    // Each source file becomes a separate inlineData part.
    expect(body.payload.mediaParts).toHaveLength(3);
    // Prompt reveals the source list so the model can cross-reference.
    expect(body.payload.prompt).toContain('스윙지도.pdf');
    expect(body.payload.prompt).toContain('멘탈지도.pdf');
    expect(body.payload.prompt).toContain('notes.txt');
    // Multi-doc fusion guidance is included.
    expect(body.payload.prompt).toContain('하나의 응집된 systemPrompt');
  });

  it('rejects when the files array is empty', async () => {
    await expect(
      generateSystemPromptFromDocument({
        files: [],
        target: 'lesson_summary',
      })
    ).rejects.toThrow(/최소 1개/);
  });

  it('legacy single-file shape still works (backwards compat)', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: {
          text: JSON.stringify({
            systemPrompt: 'legacy-compat prompt',
            summary: 'ok',
          }),
        },
      }),
    } as Response);

    const result = await generateSystemPromptFromDocument({
      file: makeFakePdf(),
      mimeType: 'application/pdf',
      target: 'coachx_chat',
    });

    expect(result.systemPrompt).toBe('legacy-compat prompt');
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.payload.mediaParts).toHaveLength(1);
    // Single-doc mode should NOT include multi-doc fusion guidance.
    expect(body.payload.prompt).not.toContain('하나의 응집된 systemPrompt');
  });
});
