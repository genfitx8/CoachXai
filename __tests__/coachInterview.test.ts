/**
 * Tests for PR B3: coach-interview services in geminiService.
 *
 * Covers:
 * - generateInterviewQuestion: opener + follow-up + isFinal flag
 * - finalizeInterviewToSystemPrompt: wraps the transcript as a text file and
 *   delegates to the document→prompt pipeline (verified by counting calls).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  generateInterviewQuestion,
  finalizeInterviewToSystemPrompt,
} from '../services/geminiService';

describe('generateInterviewQuestion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the opening question when transcript is empty', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: {
          text: JSON.stringify({
            question: '레슨 요약을 쓸 때 첫 문장에 어떤 톤을 주로 쓰세요?',
            isFinal: false,
          }),
        },
      }),
    } as Response);

    const result = await generateInterviewQuestion({
      target: 'lesson_summary',
      transcript: [],
    });

    expect(result.question).toContain('첫 문장');
    expect(result.isFinal).toBe(false);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.feature).toBe('generate_interview_question');
    expect(body.payload.systemInstruction).toContain('시니어 코치');
    // Opener flow — the user prompt tells the model there's no prior transcript.
    expect(body.payload.prompt).toContain('없음 (첫 질문)');
    // Response schema must be attached so the model always produces the
    // { question, isFinal } shape.
    expect(body.payload.responseSchema).toBeDefined();
    expect(body.payload.responseMimeType).toBe('application/json');
  });

  it('embeds prior Q&A into the user prompt for follow-up turns', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: {
          text: JSON.stringify({
            question: '슬라이스 회원에게 처음 30초에 뭘 하시나요?',
            isFinal: false,
          }),
        },
      }),
    } as Response);

    await generateInterviewQuestion({
      target: 'coachx_chat',
      transcript: [
        { question: '주로 어떤 회원층을 담당하세요?', answer: '초·중급자 위주입니다.' },
      ],
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    // Both the previous question and the previous answer must be in the prompt.
    expect(body.payload.prompt).toContain('주로 어떤 회원층을 담당하세요?');
    expect(body.payload.prompt).toContain('초·중급자 위주입니다.');
    // Opener sentinel must be gone now that transcript is non-empty.
    expect(body.payload.prompt).not.toContain('없음 (첫 질문)');
  });

  it('surfaces isFinal=true from the model', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: {
          text: JSON.stringify({
            question: '마지막으로 덧붙이고 싶은 게 있나요?',
            isFinal: true,
          }),
        },
      }),
    } as Response);

    const result = await generateInterviewQuestion({
      target: 'lesson_summary',
      transcript: [
        { question: 'q1', answer: 'a1' },
        { question: 'q2', answer: 'a2' },
        { question: 'q3', answer: 'a3' },
        { question: 'q4', answer: 'a4' },
        { question: 'q5', answer: 'a5' },
      ],
    });

    expect(result.isFinal).toBe(true);
  });

  it('rejects empty answers with a clear error', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: { text: JSON.stringify({ question: '   ', isFinal: false }) },
      }),
    } as Response);

    await expect(
      generateInterviewQuestion({ target: 'lesson_summary', transcript: [] })
    ).rejects.toThrow(/유효한 질문/);
  });

  it('threads existingSystemPrompt into the model prompt when provided', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: {
          text: JSON.stringify({ question: '더 파고들 부분?', isFinal: false }),
        },
      }),
    } as Response);

    await generateInterviewQuestion({
      target: 'training_program',
      transcript: [],
      existingSystemPrompt: '기존 훈련 프로그램 시스템 프롬프트',
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.payload.prompt).toContain('기존 훈련 프로그램 시스템 프롬프트');
  });
});

describe('finalizeInterviewToSystemPrompt', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects when the transcript is empty', async () => {
    await expect(
      finalizeInterviewToSystemPrompt({ target: 'lesson_summary', transcript: [] })
    ).rejects.toThrow(/빈 인터뷰/);
  });

  it('sends the transcript as an inlineData part and returns the transcript file metadata', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: {
          text: JSON.stringify({
            systemPrompt: '인터뷰에서 뽑아낸 시스템 프롬프트',
            summary: '5문항 답변에서 원칙 4개와 용어 2개를 정리했습니다.',
          }),
        },
      }),
    } as Response);

    const transcript = [
      { question: '스윙 지도 시 첫 번째 원칙은?', answer: '리듬을 무너뜨리지 않을 것.' },
      { question: '슬라이스 처방은?', answer: '그립 → 얼라인 → 클럽패스 순.' },
    ];

    const result = await finalizeInterviewToSystemPrompt({
      target: 'lesson_summary',
      transcript,
    });

    expect(result.systemPrompt).toContain('인터뷰에서');
    expect(result.summary).toContain('원칙 4개');
    // Transcript packaging metadata for the caller to attach as evidence.
    expect(result.transcriptFileName).toMatch(/coach-interview-lesson_summary-\d{4}-\d{2}-\d{2}\.txt/);
    expect(result.transcriptBlob.type).toBe('text/plain');
    expect(result.transcriptBlob.size).toBeGreaterThan(0);

    // The document pipeline should have been hit exactly once with our
    // synthetic transcript as a single inlineData part.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.feature).toBe('generate_system_prompt');
    expect(body.payload.mediaParts).toHaveLength(1);
    expect(body.payload.mediaParts[0].inlineData.mimeType).toBe('text/plain');
  });
});
