import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '../services/apiService';
import { LessonReservation } from '../types';

/**
 * Regression coverage for the coach-made lesson booking failing with a bare
 * "HTTP 404": the deployed backend answered the reservation endpoints with a
 * bodyless 404 (no `/api/reservations` route), so every read came back empty
 * and every write blew up in the coach's face. The service now degrades to the
 * device-local backend and re-arms the local → server promotion.
 */

const mocks = vi.hoisted(() => ({
  api: {
    isAvailable: vi.fn(),
    getToken: vi.fn(),
    getReservations: vi.fn(),
    getReservation: vi.fn(),
    upsertReservation: vi.fn(),
    deleteReservation: vi.fn(),
    getCoachById: vi.fn(),
  },
  firebase: {
    isInitialized: vi.fn(),
    getReservations: vi.fn(),
    saveReservation: vi.fn(),
    updateReservation: vi.fn(),
    deleteReservation: vi.fn(),
    getCoachById: vi.fn(),
  },
  storage: {
    getReservations: vi.fn(),
    saveReservation: vi.fn(),
    updateReservation: vi.fn(),
    deleteReservation: vi.fn(),
    getCoachById: vi.fn(),
  },
}));

vi.mock('../services/apiService', async () => {
  const actual = await vi.importActual<typeof import('../services/apiService')>(
    '../services/apiService'
  );
  return { ...actual, apiService: mocks.api };
});

vi.mock('../services/firebase', () => ({ firebaseService: mocks.firebase }));
vi.mock('../services/storage', () => ({ storageService: mocks.storage }));

vi.mock('../services/reservationPushNotificationService', () => ({
  sendLessonReservationNotifications: vi.fn().mockResolvedValue(undefined),
  sendLessonReservationStatusNotifications: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/coachNotificationService', () => ({
  createReservationRequestNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/notificationPreferenceService', () => ({
  scheduleLessonReminders: vi.fn().mockResolvedValue(undefined),
  cancelLessonReminders: vi.fn().mockResolvedValue(undefined),
}));

const SYNC_FLAG = 'swingnote_reservations_synced_v1';

/** A 404 that never reached a route handler (HTML / empty body). */
const missingEndpoint = (method: string, path: string) =>
  new ApiError('HTTP 404', 404, method, path, true);

/** A 404 the reservations router itself produced. */
const serverSaid404 = (message: string, method: string, path: string) =>
  new ApiError(message, 404, method, path, false);

/** Fresh service instance so the sticky fallback flag never leaks between tests. */
async function loadService() {
  vi.resetModules();
  const mod = await import('../services/reservationService');
  return mod.reservationService;
}

function bookLesson(service: Awaited<ReturnType<typeof loadService>>) {
  return service.createCoachMadeLessonReservation(
    'coach1',
    '박코치',
    '한윤슬_01071544045',
    '한윤슬',
    '01071544045',
    '2026-08-20T09:00:00',
    '2026-08-20T10:00:00'
  );
}

describe('reservationService – missing server endpoint fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.api.isAvailable.mockReturnValue(true);
    mocks.api.getToken.mockReturnValue('token1');
    mocks.api.getReservations.mockResolvedValue([]);
    mocks.api.upsertReservation.mockResolvedValue(undefined);
    mocks.firebase.isInitialized.mockReturnValue(false);
    mocks.storage.getReservations.mockReturnValue([]);
  });

  it('saves the booking locally when the reservation endpoint is missing', async () => {
    mocks.api.getReservations.mockRejectedValue(
      missingEndpoint('GET', '/api/reservations')
    );
    mocks.api.upsertReservation.mockRejectedValue(
      missingEndpoint('PUT', '/api/reservations/res1')
    );
    const service = await loadService();

    const reservation = await bookLesson(service);

    expect(reservation.status).toBe('CONFIRMED');
    expect(reservation.clientName).toBe('한윤슬');
    expect(mocks.storage.saveReservation).toHaveBeenCalledWith(
      expect.objectContaining({ clientName: '한윤슬', createdByCoachId: 'coach1' })
    );
    expect(service.isUsingLocalFallback()).toBe(true);
  });

  it('falls back when only the write endpoint 404s', async () => {
    mocks.api.upsertReservation.mockRejectedValue(
      missingEndpoint('PUT', '/api/reservations/res1')
    );
    const service = await loadService();

    await bookLesson(service);

    expect(mocks.storage.saveReservation).toHaveBeenCalledTimes(1);
    expect(service.isUsingLocalFallback()).toBe(true);
  });

  it('re-arms the local → server promotion so the row syncs later', async () => {
    localStorage.setItem(SYNC_FLAG, 'token1');
    mocks.api.getReservations.mockRejectedValue(
      missingEndpoint('GET', '/api/reservations')
    );
    const service = await loadService();

    await bookLesson(service);

    expect(localStorage.getItem(SYNC_FLAG)).toBeNull();
  });

  it('still reports a conflict against locally stored reservations', async () => {
    const existing: LessonReservation = {
      id: '2f1a1d6e-0e2c-4a3a-9f2c-0b7c9d8e1234',
      coachId: 'coach1',
      coachName: '박코치',
      startTime: '2026-08-20T09:00:00',
      endTime: '2026-08-20T10:00:00',
      status: 'CONFIRMED',
      createdAt: 1000,
      updatedAt: 1000,
    };
    mocks.storage.getReservations.mockReturnValue([existing]);
    mocks.api.getReservations.mockRejectedValue(
      missingEndpoint('GET', '/api/reservations')
    );
    const service = await loadService();

    await expect(bookLesson(service)).rejects.toThrow('이미 다른 예약이 있습니다');
    expect(mocks.storage.saveReservation).not.toHaveBeenCalled();
  });

  it('reads local reservations instead of returning an empty calendar', async () => {
    const local: LessonReservation = {
      id: '2f1a1d6e-0e2c-4a3a-9f2c-0b7c9d8e1234',
      coachId: 'coach1',
      coachName: '박코치',
      startTime: '2026-08-20T09:00:00',
      endTime: '2026-08-20T10:00:00',
      status: 'CONFIRMED',
      createdAt: 1000,
      updatedAt: 1000,
    };
    mocks.storage.getReservations.mockReturnValue([local]);
    mocks.api.getReservations.mockRejectedValue(
      missingEndpoint('GET', '/api/reservations')
    );
    const service = await loadService();

    const result = await service.getCoachReservations('coach1');

    expect(result.map((r) => r.id)).toContain(local.id);
  });

  it('propagates a 404 the reservations router itself produced', async () => {
    mocks.api.getReservations.mockRejectedValue(
      serverSaid404('Client not found', 'GET', '/api/reservations')
    );
    const service = await loadService();

    await expect(bookLesson(service)).rejects.toThrow('Client not found');
    expect(mocks.storage.saveReservation).not.toHaveBeenCalled();
    expect(service.isUsingLocalFallback()).toBe(false);
  });

  it('propagates non-404 API failures', async () => {
    mocks.api.upsertReservation.mockRejectedValue(
      new ApiError('Internal server error', 500, 'PUT', '/api/reservations/res1')
    );
    const service = await loadService();

    await expect(bookLesson(service)).rejects.toThrow('Internal server error');
    expect(mocks.storage.saveReservation).not.toHaveBeenCalled();
    expect(service.isUsingLocalFallback()).toBe(false);
  });

  it('keeps using the server while it answers normally', async () => {
    const service = await loadService();

    await bookLesson(service);

    expect(mocks.api.upsertReservation).toHaveBeenCalledTimes(1);
    expect(mocks.storage.saveReservation).not.toHaveBeenCalled();
    expect(service.isUsingLocalFallback()).toBe(false);
  });
});
