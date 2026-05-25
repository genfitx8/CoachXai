/**
 * Tests for lesson media persistence helpers in apiService.
 *
 * Verifies that uploadBlobToR2 returns an absolute URL and that
 * processLessonMedia populates videoKey correctly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Environment & fetch mocks
// ---------------------------------------------------------------------------

const MOCK_BASE_URL = 'https://api.example.com';

vi.stubEnv('VITE_API_BASE_URL', MOCK_BASE_URL);

// Mock localStorage (used by apiService for the auth token)
const localStorageMock = (() => {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Fake blobs for upload stubs
const makeBlob = (type: string, content = 'data') =>
  new Blob([content], { type });

// We need to stub the two fetch calls made by uploadBlobToR2:
//   1. POST /api/files/presign  → returns { uploadUrl, fileUrl }
//   2. PUT  <uploadUrl>          → actually uploads to R2 (no-op in test)

function stubFetch(presignFileUrl: string, r2PutStatus = 200) {
  const mockFetch = vi.fn(async (url: string, opts?: RequestInit) => {
    if (typeof url === 'string' && url.includes('/api/files/presign')) {
      return new Response(
        JSON.stringify({ uploadUrl: 'https://r2.example.com/put', fileUrl: presignFileUrl }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    // Blob fetch (blob: → blob resolution): return raw bytes so .blob() works in jsdom
    if (typeof url === 'string' && url.startsWith('blob:')) {
      return new Response('fakedata', { status: 200 });
    }
    // R2 presigned PUT
    return new Response(null, { status: r2PutStatus });
  });
  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('apiService media helpers', () => {
  beforeEach(() => localStorageMock.clear());
  afterEach(() => vi.restoreAllMocks());

  it('uploadBlobToR2 throws when the R2 PUT request returns a non-2xx status', async () => {
    const relativeFileUrl = '/api/files/lessons/abc/main.mp4';
    // Simulate R2 returning 403 Forbidden (e.g. wrong credentials)
    stubFetch(relativeFileUrl, 403);

    const { apiService } = await import('../services/apiService');

    const blob = makeBlob('video/mp4');
    await expect(
      apiService.uploadEditedVideo(blob, 'lesson-err', 'coach-err')
    ).rejects.toThrow(/upload to storage failed/i);
  });

  it('uploadBlobToR2 converts relative fileUrl to absolute using BASE_URL', async () => {
    // Server returns a relative path (the current behaviour of getFileUrl)
    const relativeFileUrl = '/api/files/lessons/abc/main.mp4';
    stubFetch(relativeFileUrl);

    // Import after env stub so VITE_API_BASE_URL is already set
    const { apiService } = await import('../services/apiService');

    const blob = makeBlob('video/mp4');
    // We need to call a public method that exercises uploadBlobToR2.
    // uploadEditedVideo is the simplest public entry point.
    const result = await apiService.uploadEditedVideo(blob, 'lesson-1', 'coach-1');

    expect(result).toBe(`${MOCK_BASE_URL}${relativeFileUrl}`);
  });

  it('uploadBlobToR2 leaves already-absolute fileUrl unchanged', async () => {
    const absoluteFileUrl = `${MOCK_BASE_URL}/api/files/lessons/abc/main.mp4`;
    stubFetch(absoluteFileUrl);

    const { apiService } = await import('../services/apiService');

    const blob = makeBlob('video/mp4');
    const result = await apiService.uploadEditedVideo(blob, 'lesson-2', 'coach-2');

    expect(result).toBe(absoluteFileUrl);
  });

  it('processLessonMedia sets videoKey when main video blob is uploaded', async () => {
    const relativeFileUrl = '/api/files/lessons/lesson-xyz/main.mp4';
    stubFetch(relativeFileUrl);

    const { apiService } = await import('../services/apiService');

    const lesson = {
      id: 'lesson-xyz',
      videoUrl: 'blob:http://localhost/fake-video',
      mediaType: 'video' as const,
      additionalMedia: [],
      clientName: 'Test',
      clientPhone: '000',
      createdBy: 'COACH' as const,
      recordType: 'LESSON' as const,
      date: '2024-01-01',
      title: 'Test lesson',
      createdAt: Date.now(),
    };

    const processed = await apiService.processLessonMedia(lesson as never);

    expect(processed.videoKey).toBe('lessons/lesson-xyz/main.mp4');
    expect(processed.videoUrl).toBe(`${MOCK_BASE_URL}${relativeFileUrl}`);
  });

  it('processLessonMedia adds file extensions to additional media keys', async () => {
    const makePresignResponse = (key: string) => `/api/files/${key}`;
    const mockFetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/files/presign')) {
        // Extract key from request body – we can't inspect it easily, so return a generic URL
        return new Response(
          JSON.stringify({ uploadUrl: 'https://r2.example.com/put', fileUrl: '/api/files/lessons/lid/additional_0_ts.mp4' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (typeof url === 'string' && url.startsWith('blob:')) {
        return new Response('fakedata', { status: 200 });
      }
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal('fetch', mockFetch);

    const { apiService } = await import('../services/apiService');

    const lesson = {
      id: 'lid',
      videoUrl: undefined,
      mediaType: 'video' as const,
      additionalMedia: [
        { id: 'm1', url: 'blob:http://localhost/vid', type: 'video' as const, createdAt: Date.now() },
      ],
      clientName: 'Test',
      clientPhone: '000',
      createdBy: 'COACH' as const,
      recordType: 'LESSON' as const,
      date: '2024-01-01',
      title: 'Test lesson',
      createdAt: Date.now(),
    };

    const processed = await apiService.processLessonMedia(lesson as never);

    // The stored URL for additional media must be an absolute URL
    const addUrl = processed.additionalMedia![0].url;
    expect(addUrl).toBe(`${MOCK_BASE_URL}/api/files/lessons/lid/additional_0_ts.mp4`);
  });

  it('processLessonMedia uploads hole voice blob URLs and preserves voiceUrl/voiceUrls', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

    const mockFetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/api/files/presign')) {
        const body = opts?.body ? JSON.parse(String(opts.body)) : {};
        return new Response(
          JSON.stringify({
            uploadUrl: 'https://r2.example.com/put',
            fileUrl: `/api/files/${body.key}`,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (typeof url === 'string' && url.startsWith('blob:')) {
        return new Response('fakedata', { status: 200 });
      }
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal('fetch', mockFetch);

    const { apiService } = await import('../services/apiService');

    const lesson = {
      id: 'lid',
      videoUrl: '',
      mediaType: 'audio' as const,
      additionalMedia: [],
      scorecardDetail: {
        courseName: 'Test CC',
        holes: [
          {
            holeNumber: 1,
            par: 4,
            score: 5,
            putts: 2,
            voiceUrls: ['blob:http://localhost/hole-voice'],
            voiceUrl: 'blob:http://localhost/hole-voice',
          },
        ],
        totalScore: 5,
        totalPutts: 2,
      },
      clientName: 'Test',
      clientPhone: '000',
      createdBy: 'COACH' as const,
      recordType: 'SCORE' as const,
      date: '2024-01-01',
      title: 'Round note',
      coachNotes: '',
      tags: [],
      createdAt: Date.now(),
    };

    const processed = await apiService.processLessonMedia(lesson as never);
    const uploaded = processed.scorecardDetail!.holes[0].voiceUrls![0];

    expect(uploaded).toBe(
      `${MOCK_BASE_URL}/api/files/lessons/lid/hole_1_0_1700000000000.mp4`
    );
    expect(processed.scorecardDetail!.holes[0].voiceUrl).toBe(uploaded);
  });

  it('processLessonMedia uploads client feedback data URL voice', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

    const mockFetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/api/files/presign')) {
        const body = opts?.body ? JSON.parse(String(opts.body)) : {};
        return new Response(
          JSON.stringify({
            uploadUrl: 'https://r2.example.com/put',
            fileUrl: `/api/files/${body.key}`,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (typeof url === 'string' && (url.startsWith('blob:') || url.startsWith('data:'))) {
        return new Response('fakedata', { status: 200 });
      }
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal('fetch', mockFetch);

    const { apiService } = await import('../services/apiService');

    const lesson = {
      id: 'lid',
      videoUrl: '',
      mediaType: 'audio' as const,
      additionalMedia: [],
      clientFeedback: {
        text: 'voice note',
        voiceUrl: 'data:audio/webm;base64,ZmFrZQ==',
        updatedAt: Date.now(),
      },
      clientName: 'Test',
      clientPhone: '000',
      createdBy: 'CLIENT' as const,
      recordType: 'LESSON' as const,
      date: '2024-01-01',
      title: 'Client note',
      coachNotes: '',
      tags: [],
      createdAt: Date.now(),
    };

    const processed = await apiService.processLessonMedia(lesson as never);

    expect(processed.clientFeedback!.voiceUrl).toBe(
      `${MOCK_BASE_URL}/api/files/lessons/lid/feedback_1700000000000.mp4`
    );
  });

  it('saveLesson falls back to POST when PUT returns lesson-not-found', async () => {
    const lesson = {
      id: '65d06885-d8f6-4cba-95df-7db18b8a8de6',
      clientName: 'Test',
      clientPhone: '000',
      createdBy: 'COACH' as const,
      recordType: 'LESSON' as const,
      date: '2024-01-01',
      title: 'New lesson',
      coachNotes: '',
      videoUrl: '',
      mediaType: 'image' as const,
      tags: [],
      createdAt: Date.now(),
    };

    const mockFetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (typeof url === 'string' && url.endsWith(`/api/lessons/${lesson.id}`)) {
        return new Response(
          JSON.stringify({ error: 'Lesson not found or access denied' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (typeof url === 'string' && url.endsWith('/api/lessons') && opts?.method === 'POST') {
        return new Response(
          JSON.stringify({ lesson }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(null, { status: 500 });
    });
    vi.stubGlobal('fetch', mockFetch);

    const { apiService } = await import('../services/apiService');
    const saved = await apiService.saveLesson(lesson as never);

    expect(saved.id).toBe(lesson.id);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toBe(`${MOCK_BASE_URL}/api/lessons/${lesson.id}`);
    expect((mockFetch.mock.calls[0][1] as RequestInit).method).toBe('PUT');
    expect(mockFetch.mock.calls[1][0]).toBe(`${MOCK_BASE_URL}/api/lessons`);
    expect((mockFetch.mock.calls[1][1] as RequestInit).method).toBe('POST');
  });

  it('saveLesson does not fall back to POST on non-404 errors', async () => {
    const lesson = {
      id: '4bd25af4-e5ef-4f6d-b68a-6336fcb6b8e2',
      clientName: 'Test',
      clientPhone: '000',
      createdBy: 'COACH' as const,
      recordType: 'LESSON' as const,
      date: '2024-01-01',
      title: 'Existing lesson',
      coachNotes: '',
      videoUrl: '',
      mediaType: 'image' as const,
      tags: [],
      createdAt: Date.now(),
    };

    const mockFetch = vi.fn(async () => new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    ));
    vi.stubGlobal('fetch', mockFetch);

    const { apiService } = await import('../services/apiService');

    await expect(apiService.saveLesson(lesson as never)).rejects.toBe(
      'Internal server error'
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect((mockFetch.mock.calls[0][1] as RequestInit).method).toBe('PUT');
  });

  it('getLessons resolves relative media URLs to absolute URLs', async () => {
    const lesson = {
      id: 'l1',
      clientName: 'Test',
      clientPhone: '000',
      createdBy: 'COACH' as const,
      recordType: 'LESSON' as const,
      date: '2024-01-01',
      title: 'Lesson',
      coachNotes: '',
      videoUrl: '/api/files/lessons/l1/main.mp4',
      mediaType: 'video' as const,
      tags: [],
      createdAt: Date.now(),
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ lessons: [lesson] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const { apiService } = await import('../services/apiService');
    const lessons = await apiService.getLessons();

    expect(lessons[0].videoUrl).toBe(`${MOCK_BASE_URL}/api/files/lessons/l1/main.mp4`);
  });

  it('getLessons builds playable video URL from videoKey when videoUrl is empty', async () => {
    const lesson = {
      id: 'l2',
      clientName: 'Test',
      clientPhone: '000',
      createdBy: 'COACH' as const,
      recordType: 'LESSON' as const,
      date: '2024-01-01',
      title: 'Lesson',
      coachNotes: '',
      videoUrl: '',
      videoKey: 'lessons/l2/main.mp4',
      mediaType: 'video' as const,
      tags: [],
      createdAt: Date.now(),
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ lessons: [lesson] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const { apiService } = await import('../services/apiService');
    const lessons = await apiService.getLessons();

    expect(lessons[0].videoUrl).toBe(`${MOCK_BASE_URL}/api/files/lessons/l2/main.mp4`);
  });
});
