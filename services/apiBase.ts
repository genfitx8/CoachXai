/**
 * Shared API base URL resolver.
 *
 * When `VITE_API_BASE_URL` is unset (the default for a freshly deployed
 * frontend), the app falls back to the deployed backend on Render so that
 * production users don't hit the frontend origin (Vercel) with API requests
 * and see HTML 404 responses. Local dev keeps an empty string so devs must
 * set `VITE_API_BASE_URL` to opt in, mirroring the previous behavior.
 *
 * This is the same logic that was added to `apiService.ts` in commit
 * `152bae4`; it lives here so every service can share it and stay in sync.
 */
const DEPLOYED_BACKEND_FALLBACK = 'https://coachxai-server.onrender.com';

/**
 * localStorage slot holding the API JWT. Kept in sync with `apiService`'s
 * own `TOKEN_KEY`; duplicated here rather than imported so that services
 * needing only the header (aiStream, geminiService) don't pull in the whole
 * apiService module graph.
 */
const TOKEN_KEY = 'swingnote_api_token';

/**
 * Authorization header for the current session, or `{}` when signed out.
 *
 * `/api/ai/*` requires a JWT — the endpoint bills to our Gemini key, so it
 * can't be left open to anonymous callers. Every AI caller must send this.
 */
export function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return {};
  }
  try {
    const token = window.localStorage.getItem(TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    // Storage blocked (private mode / embedded webview) — the request will
    // fail auth and surface the normal signed-out path.
    return {};
  }
}

export function resolveApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return DEPLOYED_BACKEND_FALLBACK;
    }
  }
  return '';
}
