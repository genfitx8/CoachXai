/**
 * 로그인 유지(persistent session)를 떠받치는 토큰 계층 테스트.
 *
 * - 저장된 JWT의 만료 시각을 읽어 낸다 (isTokenExpired / getTokenExpiryMs)
 * - POST /api/auth/refresh 로 토큰을 밀어 준다 (refreshToken)
 * - 보호된 요청이 401을 받으면 토큰을 버리고 앱에 알린다
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const MOCK_BASE_URL = 'https://api.example.com';
vi.stubEnv('VITE_API_BASE_URL', MOCK_BASE_URL);

const TOKEN_KEY = 'swingnote_api_token';

/** Build an unsigned JWT whose payload carries the given `exp` (seconds). */
function makeToken(expSeconds: number): string {
  const b64 = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ id: 'u1', role: 'coach', exp: expSeconds })}.sig`;
}

describe('apiService session token', () => {
  let apiService: typeof import('../services/apiService').apiService;
  let SESSION_EXPIRED_EVENT: string;

  beforeEach(async () => {
    localStorage.clear();
    const mod = await import('../services/apiService');
    apiService = mod.apiService;
    SESSION_EXPIRED_EVENT = mod.SESSION_EXPIRED_EVENT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('reads the expiry out of the stored token', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    apiService.setToken(makeToken(exp));

    expect(apiService.getTokenExpiryMs()).toBe(exp * 1000);
    expect(apiService.isTokenExpired()).toBe(false);
  });

  it('reports an already-expired token as expired', () => {
    apiService.setToken(makeToken(Math.floor(Date.now() / 1000) - 60));
    expect(apiService.isTokenExpired()).toBe(true);
  });

  it('treats an unreadable token as "let the server decide"', () => {
    apiService.setToken('not-a-jwt');
    expect(apiService.getTokenExpiryMs()).toBeNull();
    expect(apiService.isTokenExpired()).toBe(false);
  });

  it('refreshToken stores the new token the server hands back', async () => {
    apiService.setToken(makeToken(Math.floor(Date.now() / 1000) + 60));
    const fresh = makeToken(Math.floor(Date.now() / 1000) + 30 * 24 * 3600);
    let requestedUrl: string | null = null;
    const fetchMock = vi.fn(async (url: string) => {
      requestedUrl = url;
      return new Response(JSON.stringify({ token: fresh, role: 'coach' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiService.refreshToken()).resolves.toBe(true);
    expect(apiService.getToken()).toBe(fresh);
    expect(requestedUrl).toBe(`${MOCK_BASE_URL}/api/auth/refresh`);
  });

  it('refreshToken does nothing when there is no token to renew', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiService.refreshToken()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('drops the token and announces the expiry when a protected call 401s', async () => {
    apiService.setToken(makeToken(Math.floor(Date.now() / 1000) + 3600));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    const onExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);

    await expect(apiService.getMyCoachProfile()).rejects.toThrow();

    expect(apiService.getToken()).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);
    window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  });

  it('keeps the session when a login form gets a 401 (wrong password)', async () => {
    apiService.setToken(makeToken(Math.floor(Date.now() / 1000) + 3600));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'Invalid credentials' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    const onExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);

    await expect(apiService.loginCoach('a@b.com', 'nope')).rejects.toThrow();

    expect(apiService.getToken()).not.toBeNull();
    expect(onExpired).not.toHaveBeenCalled();
    window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  });
});
