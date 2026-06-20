import {
  Textbook, TextbookChapter, StudentTextbookProgress,
  QuizAttempt, ChapterLessonRecord,
} from '../types/textbook';

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
    const err = await res.json().catch(() => ({ error: 'Server error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Textbooks ─────────────────────────────────────────────────────────────

export async function listTextbooks(): Promise<Textbook[]> {
  return req<Textbook[]>('GET', '/api/textbooks');
}

export async function getTextbook(id: string): Promise<Textbook & { chapters: TextbookChapter[] }> {
  return req<Textbook & { chapters: TextbookChapter[] }>('GET', `/api/textbooks/${id}`);
}

export async function createTextbook(data: {
  title: string;
  description?: string;
  targetLevel?: string;
}): Promise<Textbook> {
  return req<Textbook>('POST', '/api/textbooks', data);
}

export async function updateTextbook(id: string, data: {
  title: string;
  description?: string;
  targetLevel?: string;
}): Promise<Textbook> {
  return req<Textbook>('PUT', `/api/textbooks/${id}`, data);
}

export async function deleteTextbook(id: string): Promise<void> {
  await req('DELETE', `/api/textbooks/${id}`);
}

export async function seedOfficialTextbook(): Promise<{ ok: boolean; chaptersSeeded: number }> {
  return req('POST', '/api/textbooks/seed-official');
}

// ── Chapters ──────────────────────────────────────────────────────────────

export async function createChapter(textbookId: string, data: Partial<TextbookChapter>): Promise<TextbookChapter> {
  return req<TextbookChapter>('POST', `/api/textbooks/${textbookId}/chapters`, data);
}

export async function updateChapter(textbookId: string, chapterId: string, data: Partial<TextbookChapter>): Promise<TextbookChapter> {
  return req<TextbookChapter>('PUT', `/api/textbooks/${textbookId}/chapters/${chapterId}`, data);
}

export async function deleteChapter(textbookId: string, chapterId: string): Promise<void> {
  await req('DELETE', `/api/textbooks/${textbookId}/chapters/${chapterId}`);
}

// ── Student assignment & progress ─────────────────────────────────────────

export async function assignTextbook(textbookId: string, studentIds: string[]): Promise<void> {
  await req('POST', `/api/textbooks/${textbookId}/assign`, { studentIds });
}

export async function getTextbookProgress(textbookId: string): Promise<StudentTextbookProgress[]> {
  return req<StudentTextbookProgress[]>('GET', `/api/textbooks/${textbookId}/progress`);
}

// ── Quiz attempts ─────────────────────────────────────────────────────────

export async function submitQuizAttempt(data: {
  chapterId: string;
  textbookId: string;
  answers: { questionId: string; answer: string; isCorrect: boolean; pointsEarned: number }[];
  score: number;
  passed: boolean;
}): Promise<{ id: string; attemptNumber: number; score: number; passed: boolean; takenAt: number }> {
  return req('POST', '/api/textbooks/attempts', data);
}

export async function getQuizAttempts(chapterId?: string): Promise<QuizAttempt[]> {
  const qs = chapterId ? `?chapterId=${chapterId}` : '';
  return req<QuizAttempt[]>('GET', `/api/textbooks/attempts${qs}`);
}

// ── Chapter Lesson Records ─────────────────────────────────────────────────

export async function listLessonRecords(params: {
  chapterId?: string;
  studentId?: string;
}): Promise<ChapterLessonRecord[]> {
  const qs = new URLSearchParams();
  if (params.chapterId) qs.set('chapterId', params.chapterId);
  if (params.studentId) qs.set('studentId', params.studentId);
  return req<ChapterLessonRecord[]>('GET', `/api/textbooks/lesson-records?${qs}`);
}

export async function createLessonRecord(data: Omit<ChapterLessonRecord, 'id' | 'coachId' | 'createdAt' | 'updatedAt'>): Promise<ChapterLessonRecord> {
  return req<ChapterLessonRecord>('POST', '/api/textbooks/lesson-records', data);
}

export async function updateLessonRecord(id: string, data: Partial<ChapterLessonRecord>): Promise<void> {
  await req('PUT', `/api/textbooks/lesson-records/${id}`, data);
}

export async function deleteLessonRecord(id: string): Promise<void> {
  await req('DELETE', `/api/textbooks/lesson-records/${id}`);
}
