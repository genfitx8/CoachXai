import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateCoachXChatResponse, generateWeeklyInsight } from '../services/geminiService';
import type { Lesson, QuickLogEntry } from '../types';

describe('geminiService backend-mediated AI integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses backend /api/ai/invoke response for weekly insight generation', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: {
          summary: '요약',
          keyPatterns: ['패턴1', '패턴2'],
          recommendedFocus: '집중 포인트',
        },
      }),
    } as Response);

    const logs: QuickLogEntry[] = [
      {
        id: 'log_1',
        clientId: 'c1',
        coachId: 'coach_1',
        logDate: '2026-05-18',
        mood: 'GOOD',
        practiceArea: 'DRIVER',
        goodPoint: '드라이버 방향성 개선',
        problemPoint: '템포 흔들림',
        notes: '백스윙 리듬 유지 필요',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    const result = await generateWeeklyInsight(logs);
    expect(result.summary).toBe('요약');
    expect(result.keyPatterns).toEqual(['패턴1', '패턴2']);
    expect(result.recommendedFocus).toBe('집중 포인트');
  });

  it('falls back gracefully when backend AI call fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ ok: false, error: 'Agent Runtime is not configured.' }),
    } as Response);

    const lessons: Lesson[] = [];
    const result = await generateCoachXChatResponse('xyz unknown query', lessons, [], 'ko');

    expect(result).toContain('Coachx');
  });
});
