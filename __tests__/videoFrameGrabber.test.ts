import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  grabVideoFrame,
  peekVideoFrame,
  releaseVideoFrameSource,
  retainVideoFrameSource,
  __testing__,
} from '../utils/videoFrameGrabber';

/**
 * Minimal HTMLVideoElement stand-in. jsdom never decodes media, so the tests
 * drive the readiness / seek events by hand and count how many elements the
 * grabber creates — the whole point of the module is that seven swing phases
 * share ONE decoder instead of racing seven of them.
 */
class FakeVideo {
  static created: FakeVideo[] = [];

  src = '';
  crossOrigin: string | null = null;
  muted = false;
  playsInline = false;
  preload = '';
  duration = 5;
  readyState = 0;
  videoWidth = 640;
  videoHeight = 360;
  error: { message: string } | null = null;

  /** Seeks that were actually issued, in order. */
  seeks: number[] = [];
  /** Timestamps the fake refuses to report `seeked` for. */
  stallAt = new Set<string>();
  /** How long metadata takes to arrive; null = never. */
  autoLoad: 'sync' | 'async' | 'error' | 'never' = 'async';

  private listeners = new Map<string, Set<(e?: unknown) => void>>();
  private t = 0;

  constructor() {
    FakeVideo.created.push(this);
  }

  // Assigning `currentTime` must behave like the real accessor: record the
  // request and complete it asynchronously via a `seeked` event.
  get currentTime() {
    return this.t;
  }

  set currentTime(v: number) {
    this.t = v;
    this.seeks.push(v);
    this.scheduleSeek();
  }

  addEventListener(type: string, fn: (e?: unknown) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
    if (type === 'loadeddata' && this.autoLoad !== 'never') {
      if (this.autoLoad === 'error') {
        queueMicrotask(() => this.fail('decode failed'));
      } else {
        queueMicrotask(() => this.ready());
      }
    }
  }

  removeEventListener(type: string, fn: (e?: unknown) => void) {
    this.listeners.get(type)?.delete(fn);
  }

  emit(type: string) {
    // Copy: handlers deregister themselves while iterating.
    [...(this.listeners.get(type) ?? [])].forEach((fn) => fn());
  }

  ready() {
    this.readyState = 2;
    this.emit('loadedmetadata');
    this.emit('loadeddata');
  }

  fail(message: string) {
    this.error = { message };
    this.emit('error');
  }

  load() {}
  setAttribute() {}
  removeAttribute() {}

  /** Emulate the browser's async seek completion. */
  private scheduleSeek() {
    const target = this.t;
    queueMicrotask(() => {
      if (this.stallAt.has(target.toFixed(3))) return;
      this.readyState = 2;
      this.emit('seeked');
    });
  }
}

function newestVideo(): FakeVideo {
  return FakeVideo.created[FakeVideo.created.length - 1];
}

beforeEach(() => {
  FakeVideo.created = [];
  __testing__.resetSessions();
  __testing__.setVideoElementFactory(() => new FakeVideo() as unknown as HTMLVideoElement);
  // Canvas 2D isn't implemented in jsdom; the grabber only needs drawImage.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  __testing__.resetSessions();
  __testing__.setVideoElementFactory(null);
  vi.restoreAllMocks();
});

describe('grabVideoFrame', () => {
  it('serves every phase from a single shared video element', async () => {
    const times = [0, 0.9, 1.8, 2.4, 3.1, 3.7, 4.4];
    const frames = await Promise.all(times.map((t) => grabVideoFrame('blob:swing', t)));

    expect(frames).toHaveLength(7);
    frames.forEach((canvas) => {
      expect(canvas.width).toBe(640);
      expect(canvas.height).toBe(360);
    });
    // The bug this module fixes: seven concurrent decoders exhausted the
    // browser's media element budget and the surplus cards stayed blank.
    expect(FakeVideo.created).toHaveLength(1);
  });

  it('runs seeks one at a time instead of overlapping them', async () => {
    await Promise.all([0.5, 1.5, 2.5].map((t) => grabVideoFrame('blob:swing', t)));
    // Ordered and non-overlapping — a parallel implementation would interleave.
    expect(newestVideo().seeks).toEqual([0.5, 1.5, 2.5]);
  });

  it('resolves t=0 without waiting for a seeked event that never fires', async () => {
    // Address sits at (or very near) t=0. Assigning currentTime = 0 when the
    // element is already parked at 0 fires no `seeked`, so the old snapshot
    // code hung forever and left the address card black.
    const canvas = await grabVideoFrame('blob:swing', 0);
    expect(canvas.width).toBe(640);
    expect(newestVideo().seeks).toEqual([]);
  });

  it('pulls a seek at the very end of the clip back inside the decodable range', async () => {
    const video = newVideoFor('blob:end', (v) => {
      v.duration = 4;
    });
    const canvas = await grabVideoFrame('blob:end', 4);
    expect(canvas.width).toBe(640);
    // Finish/follow-through land on the last frame; seeking exactly to
    // `duration` yields a blank frame or no event at all.
    expect(video.seeks[0]).toBeLessThan(4);
    expect(video.seeks[0]).toBeCloseTo(4 - __testing__.END_OF_CLIP_MARGIN, 5);
  });

  it('retries with a nudged timestamp when a seek stalls', async () => {
    const video = newVideoFor('blob:stall', (v) => {
      v.stallAt.add((2).toFixed(3));
    });
    const canvas = await grabVideoFrame('blob:stall', 2, { seekTimeoutMs: 10 });
    expect(canvas.width).toBe(640);
    expect(video.seeks[0]).toBe(2);
    expect(video.seeks.length).toBeGreaterThan(1);
    expect(video.seeks[1]).not.toBe(2);
  });

  it('rejects once retries are exhausted rather than hanging', async () => {
    newVideoFor('blob:dead', (v) => {
      for (let i = -6; i <= 6; i++) v.stallAt.add((1 + i / 30).toFixed(3));
    });
    await expect(
      grabVideoFrame('blob:dead', 1, { seekTimeoutMs: 5, retries: 2 }),
    ).rejects.toThrow();
  });

  it('does not poison the queue for later requests after a failure', async () => {
    const video = newVideoFor('blob:mixed', (v) => {
      v.stallAt.add((1).toFixed(3));
      v.stallAt.add((1 + 1 / 30).toFixed(3));
      v.stallAt.add((1 - 1 / 30).toFixed(3));
    });
    const failed = grabVideoFrame('blob:mixed', 1, { seekTimeoutMs: 5, retries: 2 });
    const ok = grabVideoFrame('blob:mixed', 3, { seekTimeoutMs: 50 });
    await expect(failed).rejects.toThrow();
    await expect(ok).resolves.toBeInstanceOf(HTMLCanvasElement);
    expect(video.seeks).toContain(3);
  });

  it('caches frames so repainting never re-seeks', async () => {
    const first = await grabVideoFrame('blob:swing', 1.25);
    const seekCount = newestVideo().seeks.length;
    const second = await grabVideoFrame('blob:swing', 1.25);
    expect(second).toBe(first);
    expect(newestVideo().seeks).toHaveLength(seekCount);
    expect(peekVideoFrame('blob:swing', 1.25)).toBe(first);
  });

  it('surfaces a load failure instead of leaving the caller pending', async () => {
    newVideoFor('blob:broken', (v) => {
      v.autoLoad = 'error';
    });
    await expect(grabVideoFrame('blob:broken', 1)).rejects.toThrow();
  });
});

describe('peekVideoFrame', () => {
  it('returns undefined for an unknown source or timestamp', async () => {
    expect(peekVideoFrame('blob:nothing', 1)).toBeUndefined();
    await grabVideoFrame('blob:swing', 2);
    expect(peekVideoFrame('blob:swing', 2)).toBeInstanceOf(HTMLCanvasElement);
    expect(peekVideoFrame('blob:swing', 2.5)).toBeUndefined();
  });
});

describe('source lifetime', () => {
  it('keeps the decoder alive while any card still holds it', async () => {
    const releaseA = retainVideoFrameSource('blob:swing');
    const releaseB = retainVideoFrameSource('blob:swing');
    await grabVideoFrame('blob:swing', 1);
    releaseA();
    // Still held by B — the cached frame must survive.
    expect(peekVideoFrame('blob:swing', 1)).toBeInstanceOf(HTMLCanvasElement);
    releaseB();
  });

  it('drops cached frames when a source is released outright', async () => {
    await grabVideoFrame('blob:swing', 1);
    expect(__testing__.sessionCount()).toBe(1);
    releaseVideoFrameSource('blob:swing');
    expect(peekVideoFrame('blob:swing', 1)).toBeUndefined();
    expect(__testing__.sessionCount()).toBe(0);
  });

  it('re-creates a session after release so a remount still renders', async () => {
    await grabVideoFrame('blob:swing', 1);
    releaseVideoFrameSource('blob:swing');
    const canvas = await grabVideoFrame('blob:swing', 1);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(FakeVideo.created).toHaveLength(2);
  });
});

describe('clampToDecodableRange', () => {
  const asVideo = (duration: number) => ({ duration }) as HTMLVideoElement;

  it('keeps in-range timestamps untouched', () => {
    expect(__testing__.clampToDecodableRange(asVideo(10), 3.5)).toBe(3.5);
  });

  it('never returns a negative time', () => {
    expect(__testing__.clampToDecodableRange(asVideo(10), -2)).toBe(0);
  });

  it('passes through when duration is unknown', () => {
    expect(__testing__.clampToDecodableRange(asVideo(NaN), 3.5)).toBe(3.5);
  });

  it('clamps past-the-end requests to just inside the clip', () => {
    const clamped = __testing__.clampToDecodableRange(asVideo(2), 99);
    expect(clamped).toBeCloseTo(2 - __testing__.END_OF_CLIP_MARGIN, 5);
  });
});

/**
 * Force a session's element to exist so a test can configure the fake before
 * the first grab runs.
 */
function newVideoFor(url: string, configure: (v: FakeVideo) => void): FakeVideo {
  retainVideoFrameSource(url);
  const video = newestVideo();
  configure(video);
  return video;
}
