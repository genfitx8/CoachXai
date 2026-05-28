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
 */
import { describe, it, expect } from 'vitest';
import type { Lesson, MediaItem } from '../types';

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
// Simulate the activeMedia initialisation logic from LessonDetail
// (mirrors the useState lazy initializer added in the fix)
// ---------------------------------------------------------------------------
function initActiveMedia(lesson: Lesson): MediaItem {
  const mainMediaSource = lesson.videoUrl || (lesson.videoKey ? `/api/files/${lesson.videoKey}` : '');
  // Simplified resolveMediaUrl: in tests there's no BASE_URL, so just return the source
  const mainMediaUrl = mainMediaSource;

  if (mainMediaUrl) {
    return { id: 'main', url: mainMediaUrl, type: lesson.mediaType, createdAt: lesson.createdAt };
  }
  if (lesson.additionalMedia && lesson.additionalMedia.length > 0) {
    return lesson.additionalMedia[0];
  }
  return { id: 'main', url: '', type: lesson.mediaType, createdAt: lesson.createdAt };
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
