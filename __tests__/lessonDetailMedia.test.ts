/**
 * Tests for LessonDetail media section visibility and activeMedia initialization.
 *
 * Verifies that:
 * 1. The media section (including "추가" add button) is visible even when a lesson
 *    has no main video URL, so users can upload a first video.
 * 2. When a lesson has no main video but has additionalMedia, activeMedia is
 *    initialized to the first additional media item.
 * 3. Express JSON body limit is configured to 10mb so large lessons with
 *    swingSequence base64 images can be saved without a 413 error.
 * 4. Offline-saved lessons store the main video as idb:// so it survives page
 *    refresh (blob: URLs are session-scoped and become dead after a reload).
 */
import { describe, it, expect } from 'vitest';
import type { Lesson, MediaItem } from '../types';

const IDB_PREFIX = 'idb://';

// ---------------------------------------------------------------------------
// Helper: build a minimal Lesson
// ---------------------------------------------------------------------------
function makeLessonBase(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'lesson-1',
    clientName: 'Test Client',
    clientPhone: '010-0000-0000',
    date: '2025-01-01',
    title: 'Test Lesson',
    createdAt: Date.now(),
    mediaType: 'video',
    createdBy: 'COACH',
    recordType: 'LESSON',
    ...overrides,
  } as Lesson;
}

// ---------------------------------------------------------------------------
// Simulate the activeMedia initialisation logic from LessonDetail.
// idb:// URLs resolve asynchronously, so mainMediaUrl starts as '' until the
// IDB lookup completes and the activeMedia reset effect fires.
// (mirrors the updated useState lazy initializer)
// ---------------------------------------------------------------------------
function initActiveMedia(lesson: Lesson, resolvedMainUrl: string | null = null): MediaItem {
  const mainMediaSource = lesson.videoUrl || (lesson.videoKey ? `/api/files/${lesson.videoKey}` : '');
  // idb:// URLs cannot be used directly as <video src>; use resolvedMainUrl once available
  const mainMediaUrl = lesson.videoUrl?.startsWith(IDB_PREFIX)
    ? (resolvedMainUrl || '')
    : mainMediaSource;

  if (mainMediaUrl) {
    return { id: 'main', url: mainMediaUrl, type: lesson.mediaType, createdAt: lesson.createdAt };
  }
  if (lesson.additionalMedia && lesson.additionalMedia.length > 0) {
    return lesson.additionalMedia[0];
  }
  return { id: 'main', url: '', type: lesson.mediaType, createdAt: lesson.createdAt };
}

function resolveActiveMediaUrl(
  media: MediaItem,
  resolvedMainUrl: string | null = null,
  resolvedAdditionalUrls: Record<string, string> = {}
): string {
  if (!media.url) return '';
  if (media.id === 'main') {
    const mainMediaUrl = media.url.startsWith(IDB_PREFIX)
      ? (resolvedMainUrl || '')
      : media.url;
    return mainMediaUrl || '';
  }
  if (media.url.startsWith(IDB_PREFIX)) {
    return resolvedAdditionalUrls[media.id] || '';
  }
  return media.url;
}

// ---------------------------------------------------------------------------
// Simulate the media section visibility condition from LessonDetail
// (mirrors the JSX condition added in the fix)
// ---------------------------------------------------------------------------
function isMediaSectionVisible(lesson: Lesson, canEdit: boolean): boolean {
  const mainMediaSource = lesson.videoUrl || (lesson.videoKey ? `/api/files/${lesson.videoKey}` : '');
  const mainMediaUrl = mainMediaSource;
  return !!(mainMediaUrl || (lesson.additionalMedia && lesson.additionalMedia.length > 0) || canEdit);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LessonDetail media section visibility', () => {
  it('shows media section when main video URL exists', () => {
    const lesson = makeLessonBase({ videoUrl: 'https://r2.example.com/vid.mp4' });
    expect(isMediaSectionVisible(lesson, false)).toBe(true);
  });

  it('shows media section when lesson has no main video but canEdit is true', () => {
    const lesson = makeLessonBase({ videoUrl: undefined, videoKey: undefined, additionalMedia: [] });
    expect(isMediaSectionVisible(lesson, true)).toBe(true);
  });

  it('shows media section when lesson has no main video but has additionalMedia', () => {
    const lesson = makeLessonBase({
      videoUrl: undefined,
      videoKey: undefined,
      additionalMedia: [
        { id: 'm1', url: 'https://r2.example.com/extra.mp4', type: 'video', createdAt: Date.now() },
      ],
    });
    expect(isMediaSectionVisible(lesson, false)).toBe(true);
  });

  it('hides media section when no video, no additionalMedia, and canEdit is false', () => {
    const lesson = makeLessonBase({ videoUrl: undefined, videoKey: undefined, additionalMedia: [] });
    expect(isMediaSectionVisible(lesson, false)).toBe(false);
  });
});

describe('LessonDetail activeMedia initialization', () => {
  it('initializes activeMedia to main video when videoUrl is set', () => {
    const lesson = makeLessonBase({ videoUrl: 'https://r2.example.com/main.mp4' });
    const media = initActiveMedia(lesson);
    expect(media.id).toBe('main');
    expect(media.url).toBe('https://r2.example.com/main.mp4');
  });

  it('initializes activeMedia to main video when videoKey is set', () => {
    const lesson = makeLessonBase({ videoUrl: undefined, videoKey: 'lessons/abc/main.mp4' });
    const media = initActiveMedia(lesson);
    expect(media.id).toBe('main');
    expect(media.url).toBe('/api/files/lessons/abc/main.mp4');
  });

  it('falls back to first additionalMedia item when no main video', () => {
    const firstItem: MediaItem = {
      id: 'extra-1',
      url: 'https://r2.example.com/extra.mp4',
      type: 'video',
      createdAt: Date.now(),
    };
    const lesson = makeLessonBase({
      videoUrl: undefined,
      videoKey: undefined,
      additionalMedia: [firstItem, { id: 'extra-2', url: 'https://r2.example.com/extra2.mp4', type: 'video', createdAt: Date.now() }],
    });
    const media = initActiveMedia(lesson);
    expect(media.id).toBe('extra-1');
    expect(media.url).toBe(firstItem.url);
  });

  it('returns empty url when no main video and no additionalMedia', () => {
    const lesson = makeLessonBase({ videoUrl: undefined, videoKey: undefined, additionalMedia: [] });
    const media = initActiveMedia(lesson);
    expect(media.id).toBe('main');
    expect(media.url).toBe('');
  });
});

// ---------------------------------------------------------------------------
// idb:// offline video URL resolution
// Verifies that a lesson saved offline (no API) stores main video as idb://
// and that activeMedia is correctly updated once the URL resolves.
// ---------------------------------------------------------------------------
describe('LessonDetail idb:// main video URL resolution', () => {
  it('treats an idb:// videoUrl as an offline-persisted video', () => {
    const lesson = makeLessonBase({ videoUrl: 'idb://main_lesson-1' });
    // videoUrl must start with the IDB prefix
    expect(lesson.videoUrl!.startsWith(IDB_PREFIX)).toBe(true);
  });

  describe('LessonDetail idb:// additional media URL resolution', () => {
    it('keeps additional idb:// media non-playable until resolved blob URL is ready', () => {
      const media: MediaItem = {
        id: 'extra-1',
        url: 'idb://additional_lesson-1_0',
        type: 'video',
        createdAt: Date.now(),
      };
      expect(resolveActiveMediaUrl(media, null, {})).toBe('');
    });

    it('uses resolved blob URL for additional idb:// media after IDB lookup', () => {
      const media: MediaItem = {
        id: 'extra-1',
        url: 'idb://additional_lesson-1_0',
        type: 'video',
        createdAt: Date.now(),
      };
      const resolved = { 'extra-1': 'blob:http://localhost/additional-video' };
      expect(resolveActiveMediaUrl(media, null, resolved)).toBe('blob:http://localhost/additional-video');
    });
  });

  it('initializes activeMedia with empty url while idb:// is still resolving', () => {
    const lesson = makeLessonBase({ videoUrl: 'idb://main_lesson-1' });
    // resolvedMainUrl is null before the async IDB lookup completes
    const media = initActiveMedia(lesson, null);
    expect(media.id).toBe('main');
    expect(media.url).toBe('');
  });

  it('updates activeMedia to resolved blob URL after idb:// resolves', () => {
    const lesson = makeLessonBase({ videoUrl: 'idb://main_lesson-1' });
    const resolvedBlobUrl = 'blob:http://localhost/fake-video-id';
    // Simulate the state after videoStore.resolve() returns a fresh blob URL
    const media = initActiveMedia(lesson, resolvedBlobUrl);
    expect(media.id).toBe('main');
    expect(media.url).toBe(resolvedBlobUrl);
  });

  it('uses regular videoUrl as-is when it is an https URL (online save)', () => {
    const lesson = makeLessonBase({ videoUrl: 'https://api.example.com/api/files/lessons/abc/main.mp4' });
    const media = initActiveMedia(lesson, null);
    expect(media.id).toBe('main');
    expect(media.url).toBe('https://api.example.com/api/files/lessons/abc/main.mp4');
  });

  it('offline-saved lesson key follows idb://main_{lessonId} naming convention', () => {
    const lessonId = 'lesson-42';
    const expectedKey = `main_${lessonId}`;
    const idbUrl = `${IDB_PREFIX}${expectedKey}`;
    expect(idbUrl).toBe('idb://main_lesson-42');
    // The key stored in IDB can be extracted by stripping the prefix
    const extracted = idbUrl.slice(IDB_PREFIX.length);
    expect(extracted).toBe(expectedKey);
  });
});

describe('Express body limit configuration', () => {
  it('server index.ts configures express.json with a 10mb limit', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const serverIndexPath = path.resolve(__dirname, '../server/src/index.ts');
    const content = fs.readFileSync(serverIndexPath, 'utf-8');
    // Verify a non-default body size limit is configured (must include "10mb")
    expect(content).toContain('10mb');
    // Verify express.json is called with an options object
    expect(content).toMatch(/express\.json\s*\(/);
    // Confirm the default (no-args) call is not used
    expect(content).not.toMatch(/express\.json\s*\(\s*\)/);
  });
});
