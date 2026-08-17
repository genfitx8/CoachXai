/**
 * Shared, serialized video frame extraction for swing-phase snapshots.
 *
 * The swing analysis view renders one snapshot card per phase (address →
 * finish, 7 of them). Each card used to create its OWN <video> element on the
 * same source and seek them all at once. Browsers cap how many media elements
 * can decode concurrently — mobile Chrome/WebKit allow only a handful — so
 * past that cap the surplus elements silently never fire `loadedmetadata` /
 * `seeked`, their canvases were never sized or drawn, and those phases showed
 * an empty black box while one or two lucky phases showed a photo.
 *
 * Everything here funnels through ONE video element per URL, seeking one
 * request at a time, with clamping, timeouts, nudge-retries and a frame cache,
 * so every phase reliably gets its picture.
 */

/** Treat two timestamps as the same frame below this delta (seconds). */
const SEEK_EPSILON = 1e-3;

/**
 * Seeking exactly to `duration` lands past the last decoded sample in most
 * decoders: the browser either clamps (so no `seeked` fires when we were
 * already there) or presents a blank frame. Back off ~one frame at 30fps.
 * This is what broke the finish/follow-through cards on short clips.
 */
const END_OF_CLIP_MARGIN = 1 / 30;

/** How far to nudge a retry when a seek never reports back. */
const RETRY_NUDGE = 1 / 30;

const DEFAULT_LOAD_TIMEOUT_MS = 15000;
const DEFAULT_SEEK_TIMEOUT_MS = 6000;

/** Frames kept per source. 7 phases + scrubbing headroom. */
const FRAME_CACHE_LIMIT = 24;

/** Max time spent waiting for `readyState` to catch up after `seeked`. */
const DECODE_SETTLE_TIMEOUT_MS = 400;
const DECODE_POLL_INTERVAL_MS = 25;

export interface GrabFrameOptions {
  loadTimeoutMs?: number;
  seekTimeoutMs?: number;
  /** Extra seek attempts (nudged forward/back) when a seek stalls. */
  retries?: number;
}

type VideoFactory = () => HTMLVideoElement;

let createVideoElement: VideoFactory = () => document.createElement('video');

/**
 * Grace period before a source with no holders is torn down. React StrictMode
 * mounts, unmounts and remounts effects in development, and phase cards can
 * remount on re-render — disposing instantly would throw away a decoder that
 * is about to be needed again.
 */
const DISPOSE_GRACE_MS = 2000;

interface Session {
  url: string;
  video: HTMLVideoElement;
  /** Resolves once the element has metadata (and ideally a first frame). */
  ready?: Promise<void>;
  /** Serializes seeks — one in flight at a time per source. */
  tail: Promise<unknown>;
  frames: Map<string, HTMLCanvasElement>;
  refs: number;
  /** Set when we already retried the load without `crossOrigin`. */
  retriedWithoutCors: boolean;
  disposed: boolean;
  disposeTimer?: ReturnType<typeof setTimeout>;
}

const sessions = new Map<string, Session>();

function isSameOriginSafe(url: string): boolean {
  return url.startsWith('blob:') || url.startsWith('data:');
}

function newSession(url: string): Session {
  const video = createVideoElement();
  // `crossOrigin` is required to keep the canvas untainted for remote sources.
  // Blob/data URLs don't need it and some browsers treat it as a hint to
  // re-request, so skip it there.
  if (!isSameOriginSafe(url)) video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  // Never let the grabber's element become visible or audible.
  video.setAttribute('aria-hidden', 'true');
  video.src = url;
  return {
    url,
    video,
    tail: Promise.resolve(),
    frames: new Map(),
    refs: 0,
    retriedWithoutCors: false,
    disposed: false,
  };
}

function getSession(url: string): Session {
  let session = sessions.get(url);
  if (!session || session.disposed) {
    session = newSession(url);
    sessions.set(url, session);
  }
  // Any fresh interest cancels a pending teardown.
  if (session.disposeTimer) {
    clearTimeout(session.disposeTimer);
    session.disposeTimer = undefined;
  }
  return session;
}

function waitForLoad(video: HTMLVideoElement, timeoutMs: number): Promise<void> {
  // HAVE_CURRENT_DATA — dimensions known and a frame is decodable.
  if (video.readyState >= 2 && video.videoWidth > 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('loadedmetadata', onMetadata);
      video.removeEventListener('error', onError);
      clearTimeout(timer);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onLoaded = () => finish();
    const onMetadata = () => {
      // Metadata alone is enough to seek with; `loadeddata` usually follows
      // immediately. Resolving here keeps sources that never emit
      // `loadeddata` while paused (some mobile WebKit builds) from stalling.
      if (video.readyState >= 2) finish();
    };
    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(video.error?.message || '비디오를 불러올 수 없습니다.'));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      // Metadata is enough to attempt a seek — only give up if we have nothing.
      if (video.readyState >= 1 && video.videoWidth > 0) {
        finish();
        return;
      }
      settled = true;
      cleanup();
      reject(new Error('비디오 로딩이 지연되어 프레임을 추출하지 못했습니다.'));
    }, timeoutMs);
    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('loadedmetadata', onMetadata);
    video.addEventListener('error', onError);
    // A source that was reset (src = '') needs an explicit kick.
    if (video.readyState === 0 && typeof video.load === 'function') {
      try {
        video.load();
      } catch {
        /* load() is best-effort; the listeners above still decide the outcome. */
      }
    }
  });
}

async function ensureReady(session: Session, timeoutMs: number): Promise<void> {
  if (!session.ready) {
    session.ready = waitForLoad(session.video, timeoutMs).catch(async (err) => {
      // A remote source without CORS headers fails outright once `crossOrigin`
      // is set. Retry once without it: the canvas becomes tainted, which is
      // fine because snapshots are only ever displayed, never read back.
      if (session.retriedWithoutCors || isSameOriginSafe(session.url)) {
        session.ready = undefined;
        throw err;
      }
      session.retriedWithoutCors = true;
      session.video.removeAttribute('crossorigin');
      session.video.src = session.url;
      try {
        await waitForLoad(session.video, timeoutMs);
      } catch (retryErr) {
        session.ready = undefined;
        throw retryErr;
      }
    });
  }
  await session.ready;
}

/** Clamp a requested timestamp into a range the decoder can actually land on. */
function clampToDecodableRange(video: HTMLVideoElement, t: number): number {
  const requested = Number.isFinite(t) ? Math.max(0, t) : 0;
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) return requested;
  const max = Math.max(0, duration - END_OF_CLIP_MARGIN);
  return Math.min(requested, max);
}

function seekTo(video: HTMLVideoElement, target: number, timeoutMs: number): Promise<void> {
  // Already parked on the requested frame — seeking again would set
  // `currentTime` to its existing value and NO `seeked` event would fire,
  // hanging forever. This is exactly the address-at-t=0 case.
  if (Math.abs(video.currentTime - target) < SEEK_EPSILON && video.readyState >= 2) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      clearTimeout(timer);
    };
    const onSeeked = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('영상 탐색 중 오류가 발생했습니다.'));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`영상 탐색 시간 초과 (${target.toFixed(3)}s)`));
    }, timeoutMs);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    try {
      video.currentTime = target;
    } catch (err) {
      if (!settled) {
        settled = true;
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
  });
}

/**
 * `seeked` can fire a beat before the frame is actually presentable. Give the
 * decoder a short, bounded window to catch up rather than drawing a blank.
 */
function waitForDecodedFrame(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const deadline = DECODE_SETTLE_TIMEOUT_MS;
    let waited = 0;
    const poll = () => {
      if (video.readyState >= 2 || waited >= deadline) {
        resolve();
        return;
      }
      waited += DECODE_POLL_INTERVAL_MS;
      setTimeout(poll, DECODE_POLL_INTERVAL_MS);
    };
    setTimeout(poll, DECODE_POLL_INTERVAL_MS);
  });
}

function captureCurrentFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) {
    throw new Error('영상 해상도를 확인할 수 없습니다.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스 컨텍스트를 생성할 수 없습니다.');
  ctx.drawImage(video, 0, 0, width, height);
  return canvas;
}

function rememberFrame(session: Session, key: string, canvas: HTMLCanvasElement) {
  session.frames.set(key, canvas);
  while (session.frames.size > FRAME_CACHE_LIMIT) {
    const oldest = session.frames.keys().next();
    if (oldest.done) break;
    session.frames.delete(oldest.value);
  }
}

async function grabWithRetries(
  session: Session,
  t: number,
  seekTimeoutMs: number,
  retries: number,
): Promise<HTMLCanvasElement> {
  const base = clampToDecodableRange(session.video, t);
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Alternate the nudge direction: a keyframe-sparse encode may have no
    // decodable sample slightly after the target but one slightly before.
    const offset = attempt === 0 ? 0 : (attempt % 2 === 1 ? 1 : -1) * Math.ceil(attempt / 2) * RETRY_NUDGE;
    const target = clampToDecodableRange(session.video, Math.max(0, base + offset));
    try {
      await seekTo(session.video, target, seekTimeoutMs);
      await waitForDecodedFrame(session.video);
      return captureCurrentFrame(session.video);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('프레임을 추출하지 못했습니다.');
}

function cacheKey(t: number): string {
  return (Number.isFinite(t) ? Math.max(0, t) : 0).toFixed(3);
}

/**
 * Synchronous cache lookup. Lets callers repaint an already-extracted frame
 * without an async round trip (and without flashing a loading state).
 */
export function peekVideoFrame(videoUrl: string, t: number): HTMLCanvasElement | undefined {
  const session = sessions.get(videoUrl);
  if (!session || session.disposed) return undefined;
  return session.frames.get(cacheKey(t));
}

/**
 * Intrinsic size of a loaded source, when known. Useful for shaping a
 * placeholder canvas after a seek failed on an otherwise healthy video.
 */
export function getVideoIntrinsicSize(
  videoUrl: string,
): { width: number; height: number } | undefined {
  const session = sessions.get(videoUrl);
  if (!session || session.disposed) return undefined;
  const { videoWidth, videoHeight } = session.video;
  return videoWidth && videoHeight ? { width: videoWidth, height: videoHeight } : undefined;
}

/**
 * Extract the frame at `t` seconds from `videoUrl` as a ready-to-draw canvas.
 *
 * Requests against the same URL are queued and served by a single decoder, so
 * calling this for every swing phase at once is safe.
 */
export async function grabVideoFrame(
  videoUrl: string,
  t: number,
  options: GrabFrameOptions = {},
): Promise<HTMLCanvasElement> {
  const loadTimeoutMs = options.loadTimeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS;
  const seekTimeoutMs = options.seekTimeoutMs ?? DEFAULT_SEEK_TIMEOUT_MS;
  const retries = options.retries ?? 2;
  const session = getSession(videoUrl);
  const key = cacheKey(t);

  const cached = session.frames.get(key);
  if (cached) return cached;

  const run = async (): Promise<HTMLCanvasElement> => {
    const hit = session.frames.get(key);
    if (hit) return hit;
    if (session.disposed) throw new Error('영상 소스가 해제되었습니다.');
    await ensureReady(session, loadTimeoutMs);
    const canvas = await grabWithRetries(session, t, seekTimeoutMs, retries);
    rememberFrame(session, key, canvas);
    return canvas;
  };

  // Chain onto the tail so seeks never overlap; failures must not poison it.
  const queued = session.tail.then(run, run);
  session.tail = queued.catch(() => undefined);
  return queued;
}

/**
 * Register interest in a source. Returns a release function; the shared video
 * element and its frame cache are torn down once the last holder releases.
 */
export function retainVideoFrameSource(videoUrl: string): () => void {
  const session = getSession(videoUrl);
  session.refs += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    session.refs -= 1;
    if (session.refs > 0 || session.disposed || session.disposeTimer) return;
    session.disposeTimer = setTimeout(() => {
      session.disposeTimer = undefined;
      if (session.refs <= 0) disposeSession(session);
    }, DISPOSE_GRACE_MS);
  };
}

function disposeSession(session: Session) {
  if (session.disposed) return;
  session.disposed = true;
  if (session.disposeTimer) {
    clearTimeout(session.disposeTimer);
    session.disposeTimer = undefined;
  }
  session.frames.clear();
  try {
    session.video.removeAttribute('src');
    session.video.src = '';
    if (typeof session.video.load === 'function') session.video.load();
  } catch {
    /* Tearing the element down is best-effort. */
  }
  if (sessions.get(session.url) === session) sessions.delete(session.url);
}

/** Drop a source's decoder and cached frames immediately. */
export function releaseVideoFrameSource(videoUrl: string): void {
  const session = sessions.get(videoUrl);
  if (session) disposeSession(session);
}

export const __testing__ = {
  clampToDecodableRange,
  seekTo,
  waitForLoad,
  setVideoElementFactory(factory: VideoFactory | null) {
    createVideoElement = factory ?? (() => document.createElement('video'));
  },
  resetSessions() {
    sessions.forEach((session) => {
      if (session.disposeTimer) clearTimeout(session.disposeTimer);
      session.disposeTimer = undefined;
      session.disposed = true;
      session.frames.clear();
    });
    sessions.clear();
  },
  sessionCount: () => sessions.size,
  END_OF_CLIP_MARGIN,
};
