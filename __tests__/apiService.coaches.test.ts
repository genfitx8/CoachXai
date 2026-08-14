import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const MOCK_BASE_URL = 'https://api.example.com';

vi.stubEnv('VITE_API_BASE_URL', MOCK_BASE_URL);

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

describe('apiService getCoaches', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns full coach list from /api/coaches', async () => {
    const coaches = [
      { id: 'coach-1', name: '코치1', email: 'coach1@example.com' },
      { id: 'coach-2', name: '코치2', email: 'coach2@example.com' },
    ];

    const fetchMock = vi.fn(async (url: string) => {
      if (url === `${MOCK_BASE_URL}/api/coaches`) {
        return new Response(JSON.stringify({ coaches }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { apiService } = await import('../services/apiService');
    const result = await apiService.getCoaches();

    expect(result).toEqual(coaches);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${MOCK_BASE_URL}/api/coaches`,
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('searchCoachesByName calls /api/coaches/search with the trimmed query', async () => {
    const coaches = [
      { id: 'coach-a', name: '홍길동', phone: '01012345678' },
      { id: 'coach-b', name: '홍코치', phone: '01098765432' },
    ];

    const fetchMock = vi.fn(async (url: string) => {
      if (url === `${MOCK_BASE_URL}/api/coaches/search?q=%ED%99%8D`) {
        return new Response(JSON.stringify({ coaches }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { apiService } = await import('../services/apiService');
    const result = await apiService.searchCoachesByName('  홍  ');

    expect(result).toEqual(coaches);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${MOCK_BASE_URL}/api/coaches/search?q=%ED%99%8D`,
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('searchCoachesByName returns [] for empty input without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { apiService } = await import('../services/apiService');
    const result = await apiService.searchCoachesByName('   ');

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('updateMyClientProfile PUTs /api/clients/me with the payload', async () => {
    const updated = {
      id: 'client-1',
      name: '학생',
      phone: '01011112222',
      coachId: 'coach-a',
      designatedCoach: '홍길동',
    };

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === `${MOCK_BASE_URL}/api/clients/me` && init?.method === 'PUT') {
        return new Response(JSON.stringify({ client: updated }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { apiService } = await import('../services/apiService');
    const result = await apiService.updateMyClientProfile({
      coachId: 'coach-a',
      designatedCoach: '홍길동',
    });

    expect(result).toEqual(updated);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ coachId: 'coach-a', designatedCoach: '홍길동' });
  });

  it('getMyCoachProfile hits /api/coaches/me and returns the coach identified by the token', async () => {
    // Regression guard for the PC/mobile member-list mismatch: session
    // restore must resolve the current coach from the token, not by
    // matching a stale localStorage email against /api/coaches.
    const meCoach = {
      id: 'coach-me',
      name: '나코치',
      email: 'me@example.com',
    };

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (
        url === `${MOCK_BASE_URL}/api/coaches/me` &&
        (!init?.method || init.method === 'GET')
      ) {
        return new Response(JSON.stringify({ coach: meCoach }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { apiService } = await import('../services/apiService');
    const result = await apiService.getMyCoachProfile();

    expect(result).toEqual(meCoach);
    // Must NOT fall back to /api/coaches (which was the source of the drift).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${MOCK_BASE_URL}/api/coaches/me`);
  });

  it('falls back to /api/coaches/me when /api/coaches is unavailable', async () => {
    const meCoach = { id: 'coach-me', name: '나코치', email: 'me@example.com' };

    const fetchMock = vi.fn(async (url: string) => {
      if (url === `${MOCK_BASE_URL}/api/coaches`) {
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === `${MOCK_BASE_URL}/api/coaches/me`) {
        return new Response(JSON.stringify({ coach: meCoach }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { apiService } = await import('../services/apiService');
    const result = await apiService.getCoaches();

    expect(result).toEqual([meCoach]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(`${MOCK_BASE_URL}/api/coaches`);
    expect(fetchMock.mock.calls[1][0]).toBe(`${MOCK_BASE_URL}/api/coaches/me`);
  });
});
