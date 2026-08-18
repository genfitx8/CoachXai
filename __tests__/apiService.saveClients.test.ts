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

/**
 * 내 회원 = 학생이 나를 담당 코치로 지정한 회원.
 *
 * saveClients used to POST any client row lacking a server id to
 * POST /api/clients, which created a brand-new member owned by whoever was
 * signed in — so stale device-cache rows became "내 회원" the moment a coach
 * logged in. Member accounts are created only by the student signing up;
 * the coach-side save may therefore only UPDATE rows that already exist.
 */
describe('apiService saveClients', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('PUTs rows that have a server id', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (
        url === `${MOCK_BASE_URL}/api/clients/client-1` &&
        init?.method === 'PUT'
      ) {
        return new Response(JSON.stringify({ id: 'client-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { apiService } = await import('../services/apiService');
    await apiService.saveClients([
      { id: 'client-1', name: '회원', phone: '01011112222' } as any,
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${MOCK_BASE_URL}/api/clients/client-1`,
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('never POSTs a row without a server id (no member creation from the coach side)', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { apiService } = await import('../services/apiService');
    await apiService.saveClients([
      // Local-only artifact: stale cache / legacy demo row with no server id.
      { name: '캐시잔재', phone: '01000000000' } as any,
    ]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('updates rows with ids and skips id-less rows in the same batch', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT' && url.startsWith(`${MOCK_BASE_URL}/api/clients/`)) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { apiService } = await import('../services/apiService');
    await apiService.saveClients([
      { id: 'client-a', name: '회원A', phone: '01011112222' } as any,
      { name: '아이디없음', phone: '01033334444' } as any,
      { id: 'client-b', name: '회원B', phone: '01055556666' } as any,
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toContain(`${MOCK_BASE_URL}/api/clients/client-a`);
    expect(urls).toContain(`${MOCK_BASE_URL}/api/clients/client-b`);
  });
});
