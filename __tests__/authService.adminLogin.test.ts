import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Regression guard for the admin/student coach-search mismatch.
 *
 * The admin console used to authenticate entirely in the browser against a
 * hardcoded credential pair and never obtained a JWT. Every protected list
 * endpoint therefore rejected the admin session, apiService fell back to
 * /api/coaches/me (rejected too), and the dashboard rendered the single coach
 * cached in that device's localStorage — while the student app's
 * /api/coaches/search queried the real table and returned every match.
 *
 * Admin login must now exchange the credentials for a real token.
 */

const MOCK_BASE_URL = 'https://api.example.com';
const TOKEN_KEY = 'swingnote_api_token';

const localStorageMock = (() => {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((key) => delete store[key]);
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });
Object.defineProperty(globalThis, 'sessionStorage', { value: localStorageMock });

describe('authService.loginAdmin', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores the admin token so protected endpoints accept the session', async () => {
    vi.stubEnv('VITE_API_BASE_URL', MOCK_BASE_URL);

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === `${MOCK_BASE_URL}/api/auth/login/admin` && init?.method === 'POST') {
        return new Response(JSON.stringify({ token: 'admin-jwt' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { authService } = await import('../services/authService');
    const ok = await authService.loginAdmin('  Admin@Swingnote.com ', 'admin1234');

    expect(ok).toBe(true);
    expect(localStorage.getItem(TOKEN_KEY)).toBe('admin-jwt');

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ email: 'admin@swingnote.com', password: 'admin1234' });
  });

  it('subsequent coach list requests carry the admin token', async () => {
    vi.stubEnv('VITE_API_BASE_URL', MOCK_BASE_URL);

    const coaches = [
      { id: 'coach-1', name: '손호석', email: 'a@example.com' },
      { id: 'coach-2', name: '손호석', email: 'b@example.com' },
      { id: 'coach-3', name: '손호석', email: 'c@example.com' },
      { id: 'coach-4', name: '손호석', email: 'd@example.com' },
    ];

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === `${MOCK_BASE_URL}/api/auth/login/admin`) {
        return new Response(JSON.stringify({ token: 'admin-jwt' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === `${MOCK_BASE_URL}/api/coaches`) {
        const auth = (init?.headers as Record<string, string>)?.Authorization;
        if (auth !== 'Bearer admin-jwt') {
          return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
        }
        return new Response(JSON.stringify({ coaches }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { authService } = await import('../services/authService');
    const { apiService } = await import('../services/apiService');

    await authService.loginAdmin('admin@swingnote.com', 'admin1234');
    // The admin must see every coach row, not the one cached on this device.
    await expect(apiService.getCoaches()).resolves.toEqual(coaches);
  });

  it('surfaces the server error message when the credentials are wrong', async () => {
    vi.stubEnv('VITE_API_BASE_URL', MOCK_BASE_URL);

    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: '관리자 로그인 정보가 일치하지 않습니다.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { authService } = await import('../services/authService');

    await expect(authService.loginAdmin('admin@swingnote.com', 'nope')).rejects.toBe(
      '관리자 로그인 정보가 일치하지 않습니다.'
    );
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('falls back to the local credential check when no backend is configured', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { authService } = await import('../services/authService');

    await expect(authService.loginAdmin('admin@swingnote.com', 'admin1234')).resolves.toBe(
      true
    );
    await expect(authService.loginAdmin('admin@swingnote.com', 'wrong')).rejects.toBe(
      '관리자 로그인 정보가 일치하지 않습니다.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
