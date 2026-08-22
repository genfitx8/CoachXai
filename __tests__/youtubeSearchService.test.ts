/**
 * Server-side YouTube search: configuration, mapping, cache and quota guard.
 *
 * The quota guard is the reason this module exists — one `search.list` call
 * costs 100 of a 10,000/day budget, so a cache miss on every student opening
 * the home screen would exhaust the day before lunch.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  YouTubeApiError,
  __resetYouTubeCache,
  getYouTubeStatus,
  isYouTubeConfigured,
  searchYouTube,
} from '../server/src/services/youtube';

const FAKE_KEY = 'test-youtube-key';

const searchResponse = (items: unknown[]) => ({
  ok: true,
  status: 200,
  json: async () => ({ items }),
  text: async () => '',
});

const item = (videoId: string, title = 'Fix your slice') => ({
  id: { videoId },
  snippet: {
    title,
    description: 'A drill',
    channelTitle: 'Coach Kim',
    publishedAt: '2026-01-02T00:00:00Z',
    thumbnails: { medium: { url: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` } },
  },
});

describe('youtube search service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    __resetYouTubeCache();
    process.env.YOUTUBE_API_KEY = FAKE_KEY;
    delete process.env.YOUTUBE_DAILY_SEARCH_LIMIT;
    delete process.env.YOUTUBE_CACHE_TTL_MINUTES;
  });

  afterEach(() => {
    delete process.env.YOUTUBE_API_KEY;
    delete process.env.YOUTUBE_DAILY_SEARCH_LIMIT;
    delete process.env.YOUTUBE_CACHE_TTL_MINUTES;
    __resetYouTubeCache();
  });

  it('reports configuration from the API key', () => {
    expect(isYouTubeConfigured()).toBe(true);
    delete process.env.YOUTUBE_API_KEY;
    expect(isYouTubeConfigured()).toBe(false);
  });

  it('refuses to search without an API key', async () => {
    delete process.env.YOUTUBE_API_KEY;
    await expect(searchYouTube('골프 슬라이스 교정')).rejects.toMatchObject({
      name: 'YouTubeApiError',
      status: 503,
    });
  });

  it('maps search items to playable videos and decodes escaped titles', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(searchResponse([item('abc123', 'Ben&#39;s slice drill &amp; fix')]));
    vi.stubGlobal('fetch', fetchMock);

    const { videos, cached } = await searchYouTube('골프 슬라이스 교정', { language: 'ko' });

    expect(cached).toBe(false);
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({
      videoId: 'abc123',
      title: "Ben's slice drill & fix",
      channelTitle: 'Coach Kim',
      url: 'https://www.youtube.com/watch?v=abc123',
    });

    const requestedUrl = String(fetchMock.mock.calls[0][0]);
    expect(requestedUrl).toContain('key=test-youtube-key');
    expect(requestedUrl).toContain('type=video');
    expect(requestedUrl).toContain('videoEmbeddable=true');
    expect(requestedUrl).toContain('safeSearch=strict');
    expect(requestedUrl).toContain('relevanceLanguage=ko');
    expect(requestedUrl).toContain('regionCode=KR');
  });

  it('drops items that carry no videoId', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(searchResponse([{ id: { channelId: 'UC1' } }, item('ok1')]))
    );
    const { videos } = await searchYouTube('골프 퍼팅');
    expect(videos.map((v) => v.videoId)).toEqual(['ok1']);
  });

  it('serves a repeated query from cache without spending quota', async () => {
    const fetchMock = vi.fn().mockResolvedValue(searchResponse([item('abc123')]));
    vi.stubGlobal('fetch', fetchMock);

    await searchYouTube('골프 퍼팅 거리감', { language: 'ko' });
    const second = await searchYouTube('골프 퍼팅 거리감', { language: 'ko' });

    expect(second.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getYouTubeStatus().searchesToday).toBe(1);
  });

  it('treats an expired cache entry as a miss', async () => {
    process.env.YOUTUBE_CACHE_TTL_MINUTES = '1';
    const fetchMock = vi.fn().mockResolvedValue(searchResponse([item('abc123')]));
    vi.stubGlobal('fetch', fetchMock);

    await searchYouTube('골프 벙커샷');
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 2 * 60 * 1000);
    try {
      const second = await searchYouTube('골프 벙커샷');
      expect(second.cached).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops searching once the daily budget is spent', async () => {
    process.env.YOUTUBE_DAILY_SEARCH_LIMIT = '1';
    const fetchMock = vi.fn().mockResolvedValue(searchResponse([item('abc123')]));
    vi.stubGlobal('fetch', fetchMock);

    await searchYouTube('첫번째 쿼리');
    await expect(searchYouTube('두번째 쿼리')).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a 403 (quota/key problem) as a retry-later failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'quotaExceeded',
        json: async () => ({}),
      })
    );
    const error = await searchYouTube('골프 그립').catch((e) => e);
    expect(error).toBeInstanceOf(YouTubeApiError);
    expect(error.status).toBe(429);
  });

  it('surfaces a network failure as a 502 instead of hanging the caller', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    await expect(searchYouTube('골프 아이언')).rejects.toMatchObject({ status: 502 });
  });
});
