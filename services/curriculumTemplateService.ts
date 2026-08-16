import { CurriculumPartTemplate } from '../types/curriculum';
import { resolveApiBaseUrl } from './apiBase';
import { apiService } from './apiService';

const BASE_URL = resolveApiBaseUrl();
// Legacy shared secret (server ADMIN_API_TOKEN) typed in by hand. Admins who
// signed in through the admin login screen carry a JWT instead and never need
// this; it stays for server-to-server callers and as a break-glass path.
const ADMIN_TOKEN_KEY = 'coachxai_admin_api_token';

export function getAdminToken(): string {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
}

/** True when the browser holds any credential the admin API would accept. */
export function hasAdminCredential(): boolean {
  return !!apiService.getAdminToken() || !!getAdminToken();
}

export function setAdminToken(token: string): void {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function req<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const sessionToken = apiService.getAdminToken();
  if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
  const legacyToken = getAdminToken();
  if (legacyToken) headers['x-admin-token'] = legacyToken;
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
      if (text) message = `HTTP ${res.status}: ${text.replace(/<[^>]*>/g, ' ').trim().slice(0, 150)}`;
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export async function listCurriculumTemplates(): Promise<CurriculumPartTemplate[]> {
  return req<CurriculumPartTemplate[]>('GET', '/api/curriculum-templates');
}

export async function updateCurriculumTemplate(
  partKey: string,
  data: { title: string; content?: string; keyPoints?: string[] }
): Promise<CurriculumPartTemplate> {
  return req<CurriculumPartTemplate>('PUT', `/api/curriculum-templates/${partKey}`, data);
}
