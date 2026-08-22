/**
 * Student video recommendations: which topic gets picked, and what happens
 * when the backend can't serve real videos.
 *
 * The ranking is deterministic on purpose (no LLM), so these assertions are
 * the specification: coach-recorded weaknesses outrank homework, homework
 * outranks a free-text goal, and a resolved fault is not re-recommended.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Homework, Lesson, StudentContext } from '../types';

const getYouTubeRecommendations = vi.fn();
const isAvailable = vi.fn(() => true);
const getToken = vi.fn<() => string | null>(() => 'token');

vi.mock('../services/apiService', () => ({
  apiService: {
    isAvailable: () => isAvailable(),
    getToken: () => getToken(),
    getYouTubeRecommendations: (...args: unknown[]) => getYouTubeRecommendations(...args),
  },
}));

const {
  buildSearchUrl,
  clearRecommendationCache,
  getVideoRecommendations,
  hasRecommendationSignals,
  rankTopics,
} = await import('../services/youtubeRecommendationService');

const lessonWith = (nextActions: string[], feedback = ''): Lesson =>
  ({
    id: 'lesson-1',
    clientId: '홍길동_01011112222',
    coachId: 'coach-1',
    title: '레슨',
    date: '2026-08-20',
    createdAt: Date.parse('2026-08-20T00:00:00Z'),
    approvalStatus: 'approved',
    approvedAt: Date.parse('2026-08-20T01:00:00Z'),
    reviewSections: { nextActions, feedback },
  }) as unknown as Lesson;

const homeworkWith = (title: string, overrides: Partial<Homework> = {}): Homework => ({
  id: `hw-${title}`,
  clientId: '홍길동_01011112222',
  title,
  isCompleted: false,
  date: '2026-08-24',
  createdAt: Date.parse('2026-08-20T00:00:00Z'),
  ...overrides,
});

const ctxWith = (overrides: Partial<StudentContext> = {}): StudentContext => ({
  clientId: '홍길동_01011112222',
  updatedAt: Date.parse('2026-08-20T00:00:00Z'),
  ...overrides,
});

/** Fixed "today" so the recency windows in the service stay deterministic. */
const NOW = Date.parse('2026-08-22T00:00:00Z');

describe('rankTopics', () => {
  it("picks the topic the coach's next action describes", () => {
    const ranked = rankTopics(
      { lessons: [lessonWith(['슬라이스가 계속 나서 아웃-인 궤도를 잡아야 합니다'])] },
      3,
      NOW
    );
    expect(ranked[0].topic.id).toBe('slice');
    expect(ranked[0].reason).toContain('지난 레슨 다음 액션');
  });

  it('ranks a repeated recorded weakness above this week homework', () => {
    const ranked = rankTopics(
      {
        ctx: ctxWith({
          swingFaultHistory: [
            {
              fault: '스웨이',
              firstSeen: '2026-06-01',
              lastSeen: '2026-08-18',
              occurrences: 4,
              status: 'active',
            },
          ],
        }),
        homework: [homeworkWith('퍼팅 거리감 연습')],
      },
      3,
      NOW
    );
    expect(ranked[0].topic.id).toBe('sway');
    expect(ranked.map((r) => r.topic.id)).toContain('putting');
  });

  it('ignores a fault the coach already marked resolved', () => {
    const ranked = rankTopics(
      {
        ctx: ctxWith({
          swingFaultHistory: [
            {
              fault: '벙커',
              firstSeen: '2026-01-01',
              lastSeen: '2026-08-01',
              occurrences: 5,
              status: 'resolved',
            },
          ],
        }),
      },
      3,
      NOW
    );
    expect(ranked.map((r) => r.topic.id)).not.toContain('bunker');
  });

  it('ignores a weakness last seen months ago', () => {
    const ranked = rankTopics(
      {
        ctx: ctxWith({
          swingFaultHistory: [
            {
              fault: '슬라이스',
              firstSeen: '2025-01-01',
              lastSeen: '2025-06-01',
              occurrences: 9,
              status: 'active',
            },
          ],
        }),
      },
      3,
      NOW
    );
    expect(ranked).toHaveLength(0);
  });

  it('reads measured miss patterns from club profiles', () => {
    const ranked = rankTopics(
      {
        ctx: ctxWith({
          clubProfiles: [
            { club: '7 IRON', missPattern: 'fat', sampleCount: 10, updatedAt: NOW },
          ],
        }),
      },
      3,
      NOW
    );
    expect(ranked[0].topic.id).toBe('contact');
    expect(ranked[0].reason).toContain('7 IRON');
  });

  it('maps deterministic swing faults to their topic', () => {
    const ranked = rankTopics({ faults: ['early_extension'] }, 3, NOW);
    expect(ranked[0].topic.id).toBe('early_extension');
  });

  it('skips completed homework and homework due far out', () => {
    const ranked = rankTopics(
      {
        homework: [
          homeworkWith('퍼팅 연습', { isCompleted: true }),
          homeworkWith('벙커 탈출', { date: '2026-12-01' }),
        ],
      },
      3,
      NOW
    );
    expect(ranked).toHaveLength(0);
  });

  it('honours the requested topic count', () => {
    const ranked = rankTopics(
      {
        lessons: [lessonWith(['슬라이스 교정', '체중이동 연습', '퍼팅 거리감', '그립 점검'])],
      },
      2,
      NOW
    );
    expect(ranked).toHaveLength(2);
  });

  it('returns the same order for the same records', () => {
    const signals = {
      lessons: [lessonWith(['슬라이스 교정', '퍼팅 거리감'])],
      homework: [homeworkWith('체중이동 드릴')],
    };
    expect(rankTopics(signals, 3, NOW).map((r) => r.topic.id)).toEqual(
      rankTopics(signals, 3, NOW).map((r) => r.topic.id)
    );
  });
});

describe('hasRecommendationSignals', () => {
  it('is false for a student with no records at all', () => {
    expect(hasRecommendationSignals({ ctx: ctxWith() })).toBe(false);
  });

  it('is true once there is a lesson', () => {
    expect(hasRecommendationSignals({ lessons: [lessonWith([])] })).toBe(true);
  });
});

describe('getVideoRecommendations', () => {
  beforeEach(() => {
    localStorage.clear();
    clearRecommendationCache();
    getYouTubeRecommendations.mockReset();
    isAvailable.mockReturnValue(true);
    getToken.mockReturnValue('token');
  });

  it('returns nothing when the student has no records to reason from', async () => {
    const result = await getVideoRecommendations({});
    expect(result).toEqual([]);
    expect(getYouTubeRecommendations).not.toHaveBeenCalled();
  });

  it('fills topics with videos the backend resolved', async () => {
    getYouTubeRecommendations.mockResolvedValue({
      configured: true,
      degraded: false,
      results: [
        {
          query: '골프 슬라이스 교정 드릴 레슨',
          cached: false,
          videos: [
            {
              videoId: 'vid1',
              title: '슬라이스 교정 3분',
              channelTitle: '골프코치',
              description: '',
              thumbnailUrl: 'https://i.ytimg.com/vi/vid1/mqdefault.jpg',
              publishedAt: '2026-01-01T00:00:00Z',
              url: 'https://www.youtube.com/watch?v=vid1',
            },
          ],
        },
      ],
    });

    const result = await getVideoRecommendations(
      { lessons: [lessonWith(['슬라이스 교정이 우선입니다'])] },
      { limit: 1 }
    );

    expect(result).toHaveLength(1);
    expect(result[0].topicId).toBe('slice');
    expect(result[0].videos[0].url).toBe('https://www.youtube.com/watch?v=vid1');
    expect(getYouTubeRecommendations).toHaveBeenCalledWith(
      ['골프 슬라이스 교정 드릴 레슨'],
      'ko',
      3
    );
  });

  it('reuses resolved videos on the next open instead of spending quota again', async () => {
    getYouTubeRecommendations.mockResolvedValue({
      configured: true,
      degraded: false,
      results: [
        {
          query: '골프 슬라이스 교정 드릴 레슨',
          cached: false,
          videos: [
            {
              videoId: 'vid1',
              title: '슬라이스 교정',
              channelTitle: '골프코치',
              description: '',
              thumbnailUrl: '',
              publishedAt: '',
              url: 'https://www.youtube.com/watch?v=vid1',
            },
          ],
        },
      ],
    });
    const signals = { lessons: [lessonWith(['슬라이스 교정'])] };

    await getVideoRecommendations(signals, { limit: 1 });
    const second = await getVideoRecommendations(signals, { limit: 1 });

    expect(getYouTubeRecommendations).toHaveBeenCalledTimes(1);
    expect(second[0].videos).toHaveLength(1);
  });

  it('refetches when the card asks for a refresh', async () => {
    getYouTubeRecommendations.mockResolvedValue({
      configured: true,
      degraded: false,
      results: [{ query: '골프 슬라이스 교정 드릴 레슨', cached: false, videos: [] }],
    });
    const signals = { lessons: [lessonWith(['슬라이스 교정'])] };

    await getVideoRecommendations(signals, { limit: 1 });
    await getVideoRecommendations(signals, { limit: 1, force: true });

    expect(getYouTubeRecommendations).toHaveBeenCalledTimes(2);
  });

  it('falls back to search links when the backend has no YouTube key', async () => {
    getYouTubeRecommendations.mockResolvedValue({
      configured: false,
      degraded: true,
      results: [],
    });

    const result = await getVideoRecommendations(
      { lessons: [lessonWith(['퍼팅 거리감을 잡읍시다'])] },
      { limit: 1 }
    );

    expect(result[0].topicId).toBe('putting');
    expect(result[0].videos).toEqual([]);
    expect(result[0].searchUrl).toContain('youtube.com/results');
  });

  it('falls back to search links when the request fails outright', async () => {
    getYouTubeRecommendations.mockRejectedValue(new Error('HTTP 500'));

    const result = await getVideoRecommendations(
      { lessons: [lessonWith(['퍼팅 거리감을 잡읍시다'])] },
      { limit: 1 }
    );

    expect(result[0].videos).toEqual([]);
    expect(result[0].searchUrl).toContain('youtube.com/results');
  });

  it('does not call the API when the student is offline / signed out', async () => {
    getToken.mockReturnValue(null);
    const result = await getVideoRecommendations(
      { lessons: [lessonWith(['슬라이스 교정'])] },
      { limit: 1 }
    );
    expect(getYouTubeRecommendations).not.toHaveBeenCalled();
    expect(result[0].searchUrl).toContain('youtube.com/results');
  });

  it('recommends fundamentals when records exist but match no topic', async () => {
    getYouTubeRecommendations.mockResolvedValue({
      configured: false,
      degraded: true,
      results: [],
    });
    const result = await getVideoRecommendations(
      { lessons: [lessonWith(['오늘도 수고하셨습니다'])] },
      { limit: 3 }
    );
    expect(result.map((r) => r.topicId)).toEqual(['setup', 'contact', 'putting']);
  });
});

describe('buildSearchUrl', () => {
  it('encodes the query for youtube.com/results', () => {
    expect(buildSearchUrl('골프 슬라이스 교정')).toBe(
      'https://www.youtube.com/results?search_query=%EA%B3%A8%ED%94%84%20%EC%8A%AC%EB%9D%BC%EC%9D%B4%EC%8A%A4%20%EA%B5%90%EC%A0%95'
    );
  });
});
