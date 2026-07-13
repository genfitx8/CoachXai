import {
  Curriculum, CurriculumPart, StudentCurriculumProgress,
  PartStatus, PartLessonRecord,
} from '../types/curriculum';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
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
    let message = `HTTP ${res.status}`;
    const text = await res.text().catch(() => '');
    try {
      const err = JSON.parse(text);
      if (err?.error) message = err.error;
    } catch {
      // Non-JSON error body (e.g. an HTML 404/502 page from a stale deploy) —
      // surface a short snippet so the real cause is visible instead of a generic message.
      if (text) message = `HTTP ${res.status}: ${text.replace(/<[^>]*>/g, ' ').trim().slice(0, 150)}`;
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

// ── Curriculums ───────────────────────────────────────────────────────────

export async function listCurriculums(): Promise<Curriculum[]> {
  return req<Curriculum[]>('GET', '/api/curriculums');
}

export async function getCurriculum(id: string): Promise<Curriculum & { parts: CurriculumPart[] }> {
  return req<Curriculum & { parts: CurriculumPart[] }>('GET', `/api/curriculums/${id}`);
}

export async function createCurriculum(data: {
  title: string;
  description?: string;
}): Promise<Curriculum & { parts: CurriculumPart[] }> {
  return req('POST', '/api/curriculums', data);
}

export async function updateCurriculum(id: string, data: {
  title: string;
  description?: string;
}): Promise<Curriculum> {
  return req<Curriculum>('PUT', `/api/curriculums/${id}`, data);
}

export async function deleteCurriculum(id: string): Promise<void> {
  await req('DELETE', `/api/curriculums/${id}`);
}

// ── Parts ─────────────────────────────────────────────────────────────────

export async function updateCurriculumPart(
  curriculumId: string,
  partId: string,
  data: { title: string; content?: string; keyPoints?: string[] }
): Promise<CurriculumPart> {
  return req<CurriculumPart>('PUT', `/api/curriculums/${curriculumId}/parts/${partId}`, data);
}

// ── Student assignment & progress ─────────────────────────────────────────

export async function assignCurriculum(curriculumId: string, studentIds: string[]): Promise<void> {
  await req('POST', `/api/curriculums/${curriculumId}/assign`, { studentIds });
}

export async function getCurriculumProgress(curriculumId: string): Promise<StudentCurriculumProgress[]> {
  return req<StudentCurriculumProgress[]>('GET', `/api/curriculums/${curriculumId}/progress`);
}

export async function setPartStatus(
  curriculumId: string,
  studentId: string,
  partKey: string,
  status: PartStatus
): Promise<void> {
  await req('PUT', `/api/curriculums/${curriculumId}/students/${studentId}/parts/${partKey}`, { status });
}

export async function setPartItemChecked(
  curriculumId: string,
  studentId: string,
  partKey: string,
  itemIndex: number,
  checked: boolean
): Promise<void> {
  await req(
    'PUT',
    `/api/curriculums/${curriculumId}/students/${studentId}/parts/${partKey}/items/${itemIndex}`,
    { checked }
  );
}

// ── Part Lesson Records ─────────────────────────────────────────────────────

export async function listPartLessonRecords(params: {
  partId?: string;
  studentId?: string;
}): Promise<PartLessonRecord[]> {
  const qs = new URLSearchParams();
  if (params.partId) qs.set('partId', params.partId);
  if (params.studentId) qs.set('studentId', params.studentId);
  return req<PartLessonRecord[]>('GET', `/api/curriculums/lesson-records?${qs}`);
}

export async function createPartLessonRecord(
  data: Omit<PartLessonRecord, 'id' | 'coachId' | 'createdAt' | 'updatedAt'>
): Promise<PartLessonRecord> {
  return req<PartLessonRecord>('POST', '/api/curriculums/lesson-records', data);
}

export async function updatePartLessonRecord(id: string, data: Partial<PartLessonRecord>): Promise<void> {
  await req('PUT', `/api/curriculums/lesson-records/${id}`, data);
}

export async function deletePartLessonRecord(id: string): Promise<void> {
  await req('DELETE', `/api/curriculums/lesson-records/${id}`);
}
