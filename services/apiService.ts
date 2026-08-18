import type { Lesson, ClientProfile, CoachProfile, LessonPackage, TrainingProgram, Homework, LessonReservation, PointTransaction } from '../types';
import { resolveApiBaseUrl } from './apiBase';

const BASE_URL = resolveApiBaseUrl();
const TOKEN_KEY = 'swingnote_api_token';
const LESSON_NOT_FOUND_ERROR = 'Lesson not found or access denied';
const HTTP_404_ERROR = 'HTTP 404';

export class ApiError extends Error {
  status: number;
  path: string;
  method: string;
  constructor(message: string, status: number, method: string, path: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.method = method;
    this.path = path;
  }
}

function parseErrorDetails(error: unknown): { status?: number; message: string } {
  if (error instanceof ApiError) return { status: error.status, message: error.message };
  if (typeof error === 'string') return { message: error };
  if (error instanceof Error) return { message: error.message };
  if (typeof error === 'object' && error !== null) {
    const e = error as { status?: number; message?: string; error?: string };
    return {
      status: e.status,
      message: e.message || e.error || '',
    };
  }
  return { message: '' };
}

async function req<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    const detail = networkErr instanceof Error ? networkErr.message : String(networkErr);
    throw new ApiError(`네트워크 오류: ${detail}`, 0, method, path);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    const message = err?.error || err?.message || `HTTP ${res.status}`;
    throw new ApiError(message, res.status, method, path);
  }
  return res.json() as Promise<T>;
}

async function uploadBlobToR2(blob: Blob, key: string): Promise<string> {
  const contentType = blob.type || 'application/octet-stream';
  console.log(`[upload] Requesting presign for key="${key}" contentType="${contentType}" size=${blob.size}`);
  const { uploadUrl, fileUrl } = await req<{ uploadUrl: string; fileUrl: string; maxBytes?: number }>(
    'POST', '/api/files/presign', { key, contentType, contentLength: blob.size }
  );
  console.log(`[upload] Uploading blob (${blob.size} bytes) to presigned URL`);
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
  });
  if (!uploadRes.ok) {
    const body = await uploadRes.text().catch(() => '');
    console.error(`[upload] R2 PUT failed: HTTP ${uploadRes.status}`, body);
    throw new Error(
      `File upload to storage failed (HTTP ${uploadRes.status}). ` +
      'This may be due to misconfigured credentials or a network issue. ' +
      'Please try again or contact support if the problem persists.'
    );
  }
  console.log(`[upload] Upload succeeded. fileUrl="${fileUrl}"`);
  // The server returns a relative path (/api/files/...). Convert it to an
  // absolute URL so it works when the frontend and backend are on different
  // origins (e.g. Render backend + separate static frontend host).
  return fileUrl.startsWith('/') ? `${BASE_URL}${fileUrl}` : fileUrl;
}

/**
 * Resolve a potentially-relative /api/files/... URL to an absolute URL using
 * the configured backend base URL. Blob, data, idb and already-absolute URLs
 * are returned unchanged. This handles backward-compat for lessons stored
 * before the absolute-URL fix was deployed.
 *
 * Only known-safe URL schemes (blob:, https?://, idb://, and our /api/ proxy
 * path) are forwarded. Anything else returns '' to prevent unexpected content
 * being injected into media src attributes.
 */
export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return '';
  // Blob object URLs created by the browser – always safe
  if (url.startsWith('blob:')) return url;
  // Absolute HTTP(S) URLs – already resolved, return as-is
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  // IndexedDB pseudo-URLs handled separately by videoStore.resolve()
  if (url.startsWith('idb://')) return url;
  // Our backend proxy path – convert to absolute using BASE_URL
  if (url.startsWith('/')) return `${BASE_URL}${url}`;
  // Any other scheme (data:, javascript:, …) is blocked to prevent XSS
  console.warn('[resolveMediaUrl] Blocked potentially unsafe URL scheme:', url.slice(0, 40));
  return '';
}

function normalizeLessonMediaUrls(lesson: Lesson): Lesson {
  const videoUrlSource =
    lesson.videoUrl ||
    (lesson.videoKey ? `/api/files/${lesson.videoKey}` : '');

  return {
    ...lesson,
    videoUrl: resolveMediaUrl(videoUrlSource),
    additionalMedia: lesson.additionalMedia?.map((item) => ({
      ...item,
      url: resolveMediaUrl(item.url),
    })),
    editedVideoUrl: lesson.editedVideoUrl
      ? resolveMediaUrl(lesson.editedVideoUrl)
      : lesson.editedVideoUrl,
    compareVideoUrl: lesson.compareVideoUrl
      ? resolveMediaUrl(lesson.compareVideoUrl)
      : lesson.compareVideoUrl,
  };
}

async function processBlobUrl(blobUrl: string, key: string): Promise<string> {
  if (!blobUrl || !blobUrl.startsWith('blob:')) return blobUrl;
  const res = await fetch(blobUrl);
  const blob = await res.blob();
  return uploadBlobToR2(blob, key);
}

async function processLocalMediaUrl(url: string, key: string): Promise<string> {
  if (!url) return url;
  const isLocalUrl = url.startsWith('blob:') || url.startsWith('data:');
  if (!isLocalUrl) return url;
  const res = await fetch(url);
  const blob = await res.blob();
  return uploadBlobToR2(blob, key);
}

export const apiService = {
  isAvailable(): boolean {
    return !!BASE_URL;
  },

  setToken(token: string) {
    // A malformed login response can hand us `undefined`, which localStorage
    // silently coerces to the string "undefined". Every later request then
    // sends `Authorization: Bearer undefined` and JSON.parse'ing readers of
    // downstream storage entries crash. Refuse the write instead.
    if (typeof token !== 'string' || token.length === 0) {
      localStorage.removeItem(TOKEN_KEY);
      return;
    }
    localStorage.setItem(TOKEN_KEY, token);
  },
  clearToken() { localStorage.removeItem(TOKEN_KEY); },
  getToken(): string | null {
    const raw = localStorage.getItem(TOKEN_KEY);
    // Heal the "undefined" / "null" strings left over from an earlier bad
    // write so callers see the same null they would on a fresh browser.
    if (raw === null || raw === '' || raw === 'undefined' || raw === 'null') {
      if (raw !== null) localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return raw;
  },

  // ── Auth ──────────────────────────────────────────────────────────────────

  async signupCoach(name: string, email: string, password: string, phone: string): Promise<{ token: string; coach: CoachProfile }> {
    const data = await req<{ token: string; coach: CoachProfile }>('POST', '/api/auth/signup/coach', { name, email, password, phone });
    if (!data?.token || !data?.coach?.id) {
      throw new Error('회원가입 응답 형식이 올바르지 않습니다.');
    }
    this.setToken(data.token);
    return data;
  },

  async loginCoach(email: string, password: string): Promise<{ token: string; coach: CoachProfile }> {
    const data = await req<{ token: string; coach: CoachProfile }>('POST', '/api/auth/login/coach', { email, password });
    if (!data?.token || !data?.coach?.id) {
      throw new Error('로그인 응답 형식이 올바르지 않습니다.');
    }
    this.setToken(data.token);
    return data;
  },

  async signupClient(name: string, email: string, password: string, phone: string): Promise<{ token: string; client: ClientProfile }> {
    const data = await req<{ token: string; client: ClientProfile }>('POST', '/api/auth/signup/client', { name, email, password, phone });
    if (!data?.token || !data?.client?.id) {
      throw new Error('회원가입 응답 형식이 올바르지 않습니다.');
    }
    this.setToken(data.token);
    return data;
  },

  async loginClient(email: string, password: string): Promise<{ token: string; client: ClientProfile }> {
    const data = await req<{ token: string; client: ClientProfile }>('POST', '/api/auth/login/client', { email, password });
    if (!data?.token || !data?.client?.id) {
      throw new Error('로그인 응답 형식이 올바르지 않습니다.');
    }
    this.setToken(data.token);
    return data;
  },

  /**
   * Exchange the admin credentials for a real JWT.
   *
   * Before this existed the admin console authenticated entirely in the
   * browser, so an admin session carried no token: every protected list
   * endpoint answered 401/403 and the dashboard silently rendered whatever
   * was cached in that device's localStorage. That is why 코치 회원 검색
   * only ever surfaced the single locally-cached coach while the student
   * app's /api/coaches/search returned the real rows.
   */
  async loginAdmin(email: string, password: string): Promise<{ token: string }> {
    const data = await req<{ token: string }>('POST', '/api/auth/login/admin', { email, password });
    if (!data?.token) {
      throw new Error('로그인 응답 형식이 올바르지 않습니다.');
    }
    this.setToken(data.token);
    return data;
  },

  async requestPasswordReset(role: 'COACH' | 'CLIENT', email: string, phone: string): Promise<void> {
    await req('POST', '/api/auth/password/recover', {
      role: role === 'COACH' ? 'coach' : 'client',
      email,
      phone,
    });
  },

  // ── Lessons ───────────────────────────────────────────────────────────────

  async getLessons(): Promise<Lesson[]> {
    const data = await req<{ lessons: Lesson[] }>('GET', '/api/lessons');
    return data.lessons.map(normalizeLessonMediaUrls);
  },

  async saveLesson(lesson: Lesson): Promise<Lesson> {
    if (lesson.id) {
      try {
        const data = await req<{ lesson: Lesson }>(
          'PUT',
          `/api/lessons/${lesson.id}`,
          lesson
        );
        return normalizeLessonMediaUrls(data.lesson);
      } catch (error) {
        const { status, message } = parseErrorDetails(error);
        const isMissingLesson =
          status === 404 ||
          message === LESSON_NOT_FOUND_ERROR ||
          message === HTTP_404_ERROR;
        if (!isMissingLesson) throw error;
      }
    }
    const data = await req<{ lesson: Lesson }>('POST', '/api/lessons', lesson);
    return normalizeLessonMediaUrls(data.lesson);
  },

  async deleteLesson(lessonId: string): Promise<void> {
    await req('DELETE', `/api/lessons/${lessonId}`);
  },

  async processLessonMedia(lesson: Lesson): Promise<Lesson> {
    const processed = { ...lesson };
    const id = lesson.id || crypto.randomUUID();
    const timestamp = Date.now();

    if (lesson.videoUrl?.startsWith('blob:')) {
      const ext = lesson.mediaType === 'image' ? 'jpg' : 'mp4';
      const key = `lessons/${id}/main.${ext}`;
      processed.videoUrl = await processBlobUrl(lesson.videoUrl, key);
      processed.videoKey = key;
    }

    if (lesson.additionalMedia?.length) {
      const mediaExtMap: Record<string, string> = { video: 'mp4', audio: 'webm', image: 'jpg' };
      processed.additionalMedia = await Promise.all(
        lesson.additionalMedia.map(async (item, idx) => {
          if (item.url?.startsWith('blob:')) {
            const ext = mediaExtMap[item.type] ?? 'bin';
            const url = await processBlobUrl(item.url, `lessons/${id}/additional_${idx}_${Date.now()}.${ext}`);
            return { ...item, url };
          }
          return item;
        })
      );
    }

    if (lesson.scorecardDetail?.holes?.length) {
      processed.scorecardDetail = {
        ...lesson.scorecardDetail,
        holes: await Promise.all(
          lesson.scorecardDetail.holes.map(async (hole) => {
            const voiceUrls =
              hole.voiceUrls && hole.voiceUrls.length > 0
                ? hole.voiceUrls
                : hole.voiceUrl
                ? [hole.voiceUrl]
                : [];

            if (voiceUrls.length === 0) return hole;

            const uploadedVoiceUrls = await Promise.all(
              voiceUrls.map((voiceUrl, idx) =>
                processLocalMediaUrl(
                  voiceUrl,
                  `lessons/${id}/hole_${hole.holeNumber}_${idx}_${timestamp}.mp4`
                )
              )
            );

            return {
              ...hole,
              voiceUrls: uploadedVoiceUrls,
              voiceUrl: uploadedVoiceUrls[uploadedVoiceUrls.length - 1] ?? hole.voiceUrl,
            };
          })
        ),
      };
    }

    if (lesson.clientFeedback?.voiceUrl) {
      processed.clientFeedback = {
        ...lesson.clientFeedback,
        voiceUrl: await processLocalMediaUrl(
          lesson.clientFeedback.voiceUrl,
          `lessons/${id}/feedback_${timestamp}.mp4`
        ),
      };
    }

    return processed;
  },

  async uploadEditedVideo(videoBlob: Blob, lessonId: string, userId: string): Promise<string> {
    return uploadBlobToR2(videoBlob, `edited-videos/${userId}/${lessonId}_${Date.now()}.mp4`);
  },

  async uploadCompareVideo(videoBlob: Blob, lessonId: string, userId: string): Promise<string> {
    return uploadBlobToR2(videoBlob, `compare-videos/${userId}/${lessonId}_${Date.now()}.mp4`);
  },

  /**
   * Upload a student's practice-drill clip to the storage layer.
   *
   * The redesign's 5d flow lands the video against a brand-new lesson UUID
   * so it flows through the same `lessons/{uuid}/main.mp4` key path the
   * signed-token gate already recognises — no widening of the presign
   * allowlist required. The returned absolute URL is safe to drop straight
   * into `<video src>` because it carries the HMAC token from
   * `/api/files/presign` (added in PR #313, issue #308).
   *
   * Caller is responsible for creating the matching lesson row via
   * POST /api/lessons afterwards; this method only handles the R2 hop.
   */
  async uploadPracticeVideo(videoBlob: Blob, lessonId: string): Promise<string> {
    const ext = (videoBlob.type.split('/')[1] || 'mp4').toLowerCase();
    return uploadBlobToR2(videoBlob, `lessons/${lessonId}/main.${ext}`);
  },

  /**
   * Upload a file the student attached in the AI chat.
   *
   * Rides the same `lessons/{uuid}/main.{ext}` key the presign guard already
   * allows (see server/src/routes/files.ts) rather than a `chat/…` namespace
   * that would be rejected outright. `attachmentId` is a fresh UUID, which
   * doubles as the lesson id when the student files the attachment as a
   * practice record — so the upload and the eventual row always line up.
   */
  async uploadChatAttachment(file: Blob, attachmentId: string): Promise<string> {
    const subtype = file.type.split('/')[1] || '';
    // Strip codec/parameter suffixes ("quicktime;codecs=…") and any path
    // separator so the key can never escape the attachment's own prefix.
    const ext = (subtype.split(';')[0].replace(/[^a-z0-9]/gi, '') || 'bin').toLowerCase();
    return uploadBlobToR2(file, `lessons/${attachmentId}/main.${ext}`);
  },

  // ── Clients ───────────────────────────────────────────────────────────────

  async getMyClientProfile(): Promise<ClientProfile> {
    const data = await req<{ client: ClientProfile }>('GET', '/api/clients/me');
    return data.client;
  },

  async updateMyClientProfile(patch: Partial<ClientProfile>): Promise<ClientProfile> {
    const data = await req<{ client: ClientProfile }>('PUT', '/api/clients/me', patch);
    return data.client;
  },

  async getClients(): Promise<ClientProfile[]> {
    const data = await req<{ clients: ClientProfile[] }>('GET', '/api/clients');
    return data.clients;
  },

  async saveClients(clients: ClientProfile[]): Promise<void> {
    await Promise.all(
      clients.map(c =>
        c.id
          ? req('PUT', `/api/clients/${c.id}`, c)
          : req('POST', '/api/clients', c)
      )
    );
  },

  async deleteClient(client: ClientProfile): Promise<void> {
    if (client.id) await req('DELETE', `/api/clients/${client.id}`);
  },

  // ── Coaches ───────────────────────────────────────────────────────────────

  async getCoaches(): Promise<CoachProfile[]> {
    try {
      const data = await req<{ coaches: CoachProfile[] }>('GET', '/api/coaches');
      return data.coaches;
    } catch (error) {
      console.warn(
        '[apiService] Failed to load coaches from /api/coaches, falling back to /api/coaches/me:',
        error
      );
    }
    try {
      const data = await req<{ coach: CoachProfile }>('GET', '/api/coaches/me');
      return [data.coach];
    } catch {
      return [];
    }
  },

  /**
   * Return the coach profile identified by the current auth token.
   *
   * Session restore MUST use this instead of fetching /api/coaches and
   * matching by local-storage email — the local email can be stale from a
   * previous login on the same device (this is why PC and mobile were
   * showing different member lists for the same account: each device
   * derived `currentUser.id` from its own local email, and the client-side
   * `client.coachId === currentUser.id` filter then hid the server-scoped
   * member list on whichever device had the wrong local email).
   */
  async getMyCoachProfile(): Promise<CoachProfile> {
    const data = await req<{ coach: CoachProfile }>('GET', '/api/coaches/me');
    return data.coach;
  },

  async saveCoach(coach: CoachProfile): Promise<void> {
    await req('PUT', '/api/coaches/me', coach);
  },

  // ── Lesson Packages ───────────────────────────────────────────────────────

  async getLessonPackages(coachId: string): Promise<LessonPackage[]> {
    const data = await req<{ packages: LessonPackage[] }>('GET', `/api/lesson-packages?coachId=${coachId}`);
    return data.packages;
  },

  async saveLessonPackage(pkg: LessonPackage): Promise<void> {
    if (pkg.id) {
      await req('PUT', `/api/lesson-packages/${pkg.id}`, pkg);
    } else {
      await req('POST', '/api/lesson-packages', pkg);
    }
  },

  async deleteLessonPackage(packageId: string): Promise<void> {
    await req('DELETE', `/api/lesson-packages/${packageId}`);
  },

  // ── Training Programs (Phase 2) ───────────────────────────────────────────

  async getTrainingPrograms(_coachId: string): Promise<TrainingProgram[]> {
    return [];
  },

  async saveTrainingProgram(_program: TrainingProgram): Promise<void> {},
  async deleteTrainingProgram(_programId: string): Promise<void> {},

  // ── Coach management ──────────────────────────────────────────────────────

  async deleteCoach(_coach: CoachProfile): Promise<void> {
    // Phase 2: full coach deletion
  },

  async getCoachById(coachId: string): Promise<CoachProfile | null> {
    try {
      const data = await req<{ coach: CoachProfile }>('GET', `/api/coaches/${coachId}`);
      return data.coach;
    } catch {
      return null;
    }
  },

  async searchCoachesByName(name: string): Promise<CoachProfile[]> {
    const trimmed = name.trim();
    if (!trimmed) return [];
    try {
      const data = await req<{ coaches: CoachProfile[] }>(
        'GET',
        `/api/coaches/search?q=${encodeURIComponent(trimmed)}`
      );
      return data.coaches ?? [];
    } catch (e) {
      console.warn('[apiService] searchCoachesByName failed:', e);
      return [];
    }
  },

  async findCoach(name: string, phone: string): Promise<CoachProfile | null> {
    try {
      const coaches = await this.getCoaches();
      return coaches.find(c => c.name === name && c.phone === phone) ?? null;
    } catch {
      return null;
    }
  },

  // ── Homework (Phase 1 server promotion) ───────────────────────────────────

  async getHomework(clientId?: string): Promise<Homework[]> {
    const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : '';
    const data = await req<{ homework: Homework[] }>('GET', `/api/homework${qs}`);
    return data.homework ?? [];
  },

  async saveHomeworkBatch(homework: Homework[]): Promise<void> {
    if (homework.length === 0) return;
    await req('POST', '/api/homework', { homework });
  },

  async updateHomeworkStatus(homeworkId: string, isCompleted: boolean): Promise<void> {
    await req('PATCH', `/api/homework/${homeworkId}`, { isCompleted });
  },

  async deleteHomework(homeworkId: string): Promise<void> {
    await req('DELETE', `/api/homework/${homeworkId}`);
  },

  // ── Point ledger (Phase 1 server promotion) ───────────────────────────────

  /** Own ledger rows (server scopes by token: client ids or coach_<id>). */
  async getPointTransactions(): Promise<PointTransaction[]> {
    const data = await req<{ transactions: PointTransaction[] }>(
      'GET',
      '/api/points/transactions'
    );
    return data.transactions ?? [];
  },

  /**
   * Append one ledger row; the server applies the balance atomically and
   * returns it. The transaction id is the idempotency key.
   */
  async addPointTransaction(
    transaction: PointTransaction
  ): Promise<{ transaction: PointTransaction; balance: number | null }> {
    return req<{ transaction: PointTransaction; balance: number | null }>(
      'POST',
      '/api/points/transactions',
      { transaction }
    );
  },

  /** Audit-only backfill of device-local history — never touches balances. */
  async importPointTransactions(transactions: PointTransaction[]): Promise<void> {
    if (transactions.length === 0) return;
    await req('POST', '/api/points/transactions/import', { transactions });
  },

  // ── Lesson reservations (Phase 1 server promotion) ────────────────────────

  /**
   * List reservations visible to the current token. Coaches get their own
   * calendar; clients get their own bookings, or — with coachId — that
   * coach's calendar with other students' PII stripped server-side.
   */
  async getReservations(coachId?: string): Promise<LessonReservation[]> {
    const qs = coachId ? `?coachId=${encodeURIComponent(coachId)}` : '';
    const data = await req<{ reservations: LessonReservation[] }>(
      'GET',
      `/api/reservations${qs}`
    );
    return data.reservations ?? [];
  },

  /** Single reservation, or null when it doesn't exist / isn't visible. */
  async getReservation(reservationId: string): Promise<LessonReservation | null> {
    try {
      const data = await req<{ reservation: LessonReservation }>(
        'GET',
        `/api/reservations/${reservationId}`
      );
      return data.reservation ?? null;
    } catch (error) {
      const { status } = parseErrorDetails(error);
      if (status === 404) return null;
      throw error;
    }
  },

  /** Full-document upsert; the client-generated UUID id is the idempotency key. */
  async upsertReservation(reservation: LessonReservation): Promise<LessonReservation> {
    const data = await req<{ reservation: LessonReservation }>(
      'PUT',
      `/api/reservations/${reservation.id}`,
      reservation
    );
    return data.reservation;
  },

  async deleteReservation(reservationId: string): Promise<void> {
    await req('DELETE', `/api/reservations/${reservationId}`);
  },
};
