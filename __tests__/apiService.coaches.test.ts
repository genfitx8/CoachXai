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
