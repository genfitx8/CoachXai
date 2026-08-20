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
 * A 404 the API routes produced ("no such row") must stay distinguishable from
 * a 404 that never reached a route handler ("no such endpoint"): the second one
 * is what surfaced to coaches as a bare "HTTP 404" on the booking form.
 */
describe('apiService – endpoint-missing detection', () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.setItem('swingnote_api_token', 'token1');
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const respond = (status: number, body: unknown, ok = false) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok,
        status,
        json: async () => {
          if (body === undefined) throw new SyntaxError('Unexpected token < in JSON');
          return body;
        },
      })
    );
  };

  it('flags an HTML 404 (no route handler) as a missing endpoint', async () => {
    respond(404, undefined);
    const { apiService, isEndpointMissingError } = await import('../services/apiService');

    const error = await apiService
      .getReservations('coach1')
      .then(() => null, (e) => e);

    expect(error).toBeTruthy();
    expect(error.status).toBe(404);
    expect(error.message).toBe('HTTP 404');
    expect(isEndpointMissingError(error)).toBe(true);
  });

  it("flags the server's own unrouted-path envelope as a missing endpoint", async () => {
    respond(404, { error: 'Endpoint not found: PUT /api/reservations/res1' });
    const { apiService, isEndpointMissingError } = await import('../services/apiService');

    const error = await apiService
      .getReservations()
      .then(() => null, (e) => e);

    expect(isEndpointMissingError(error)).toBe(true);
  });

  it('does not flag a 404 the reservations router produced', async () => {
    respond(404, { error: 'Client not found' });
    const { apiService, isEndpointMissingError } = await import('../services/apiService');

    const error = await apiService
      .getReservations()
      .then(() => null, (e) => e);

    expect(error.message).toBe('Client not found');
    expect(isEndpointMissingError(error)).toBe(false);
  });

  it('does not flag other statuses', async () => {
    respond(500, { error: 'Internal server error' });
    const { isEndpointMissingError, apiService } = await import('../services/apiService');

    const error = await apiService
      .getReservations()
      .then(() => null, (e) => e);

    expect(isEndpointMissingError(error)).toBe(false);
  });

  it('getReservation still returns null for a row-level 404', async () => {
    respond(404, { error: 'Reservation not found' });
    const { apiService } = await import('../services/apiService');

    await expect(apiService.getReservation('res1')).resolves.toBeNull();
  });

  it('getReservation rethrows when the endpoint itself is missing', async () => {
    respond(404, undefined);
    const { apiService } = await import('../services/apiService');

    await expect(apiService.getReservation('res1')).rejects.toThrow('HTTP 404');
  });
});
