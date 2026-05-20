import type { Lesson, ClientProfile, CoachProfile, LessonPackage, TrainingProgram, Homework } from '../types';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const TOKEN_KEY = 'swingnote_api_token';

async function req<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Server error' }));
    throw err.error || `HTTP ${res.status}`;
  }
  return res.json() as Promise<T>;
}

async function uploadBlobToR2(blob: Blob, key: string): Promise<string> {
  console.log(`[upload] Requesting presign for key="${key}" contentType="${blob.type || 'application/octet-stream'}"`);
  const { uploadUrl, fileUrl } = await req<{ uploadUrl: string; fileUrl: string }>(
    'POST', '/api/files/presign', { key, contentType: blob.type || 'application/octet-stream' }
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

async function processBlobUrl(blobUrl: string, key: string): Promise<string> {
  if (!blobUrl || !blobUrl.startsWith('blob:')) return blobUrl;
  const res = await fetch(blobUrl);
  const blob = await res.blob();
  return uploadBlobToR2(blob, key);
}

export const apiService = {
  isAvailable(): boolean {
    return !!(import.meta.env.VITE_API_BASE_URL);
  },

  setToken(token: string) { localStorage.setItem(TOKEN_KEY, token); },
  clearToken() { localStorage.removeItem(TOKEN_KEY); },
  getToken(): string | null { return localStorage.getItem(TOKEN_KEY); },

  // ── Auth ──────────────────────────────────────────────────────────────────

  async signupCoach(name: string, email: string, password: string, phone: string): Promise<{ token: string; coach: CoachProfile }> {
    const data = await req<{ token: string; coach: CoachProfile }>('POST', '/api/auth/signup/coach', { name, email, password, phone });
    this.setToken(data.token);
    return data;
  },

  async loginCoach(email: string, password: string): Promise<{ token: string; coach: CoachProfile }> {
    const data = await req<{ token: string; coach: CoachProfile }>('POST', '/api/auth/login/coach', { email, password });
    this.setToken(data.token);
    return data;
  },

  async signupClient(name: string, email: string, password: string, phone: string): Promise<{ token: string; client: ClientProfile }> {
    const data = await req<{ token: string; client: ClientProfile }>('POST', '/api/auth/signup/client', { name, email, password, phone });
    this.setToken(data.token);
    return data;
  },

  async loginClient(email: string, password: string): Promise<{ token: string; client: ClientProfile }> {
    const data = await req<{ token: string; client: ClientProfile }>('POST', '/api/auth/login/client', { email, password });
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
    return data.lessons;
  },

  async saveLesson(lesson: Lesson): Promise<Lesson> {
    if (lesson.id) {
      try {
        const data = await req<{ lesson: Lesson }>(
          'PUT',
          `/api/lessons/${lesson.id}`,
          lesson
        );
        return data.lesson;
      } catch (error) {
        const message = typeof error === 'string'
          ? error
          : (error as { message?: string })?.message || '';
        const isMissingLesson =
          message === 'Lesson not found or access denied' ||
          message.includes('HTTP 404');
        if (!isMissingLesson) throw error;
      }
    }
    const data = await req<{ lesson: Lesson }>('POST', '/api/lessons', lesson);
    return data.lesson;
  },

  async deleteLesson(lessonId: string): Promise<void> {
    await req('DELETE', `/api/lessons/${lessonId}`);
  },

  async processLessonMedia(lesson: Lesson): Promise<Lesson> {
    const processed = { ...lesson };
    const id = lesson.id || crypto.randomUUID();

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

    return processed;
  },

  async uploadEditedVideo(videoBlob: Blob, lessonId: string, userId: string): Promise<string> {
    return uploadBlobToR2(videoBlob, `edited-videos/${userId}/${lessonId}_${Date.now()}.mp4`);
  },

  async uploadCompareVideo(videoBlob: Blob, lessonId: string, userId: string): Promise<string> {
    return uploadBlobToR2(videoBlob, `compare-videos/${userId}/${lessonId}_${Date.now()}.mp4`);
  },

  // ── Clients ───────────────────────────────────────────────────────────────

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
      const data = await req<{ coach: CoachProfile }>('GET', '/api/coaches/me');
      return [data.coach];
    } catch {
      return [];
    }
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

  async findCoach(name: string, phone: string): Promise<CoachProfile | null> {
    try {
      const coaches = await this.getCoaches();
      return coaches.find(c => c.name === name && c.phone === phone) ?? null;
    } catch {
      return null;
    }
  },

  // ── Homework (Phase 2) ────────────────────────────────────────────────────

  async saveHomeworkBatch(_homework: Homework[]): Promise<void> {},
};
