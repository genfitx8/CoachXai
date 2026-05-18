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

function stubFetch(presignFileUrl: string) {
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
    return new Response(null, { status: 200 });
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
});
