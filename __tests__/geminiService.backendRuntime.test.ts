import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateGolfMissions, generateCoachXChatResponse } from '../services/geminiService';
import type { ClientProfile } from '../types';

describe('geminiService backend runtime adapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls backend /api/ai/invoke for mission generation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: '["미션 A","미션 B","미션 C"]' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const profile = { name: '회원', phone: '01011112222' } as ClientProfile;
    const result = await generateGolfMissions(profile, []);

    expect(result).toEqual(['미션 A', '미션 B', '미션 C']);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/ai/invoke'),
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('falls back to heuristic CoachX reply when backend runtime fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const result = await generateCoachXChatResponse('unknown question', [], [], 'en');
    expect(result).toMatch(/coachx/i);
  });
});
