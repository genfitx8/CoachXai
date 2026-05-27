import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authService } from '../services/authService';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import { apiService } from '../services/apiService';

vi.mock('../services/firebase', () => ({
  firebaseService: {
    isInitialized: vi.fn(),
    getCoaches: vi.fn(),
    getClients: vi.fn(),
    saveCoach: vi.fn(),
    saveClients: vi.fn(),
  },
}));

vi.mock('../services/storage', () => ({
  storageService: {
    getClients: vi.fn(),
    saveClients: vi.fn(),
  },
}));

vi.mock('../services/apiService', () => ({
  apiService: {
    isAvailable: vi.fn().mockReturnValue(false),
    signupCoach: vi.fn(),
    signupClient: vi.fn(),
    loginCoach: vi.fn(),
    loginClient: vi.fn(),
    setToken: vi.fn(),
    clearToken: vi.fn(),
  },
}));

describe('authService logout and session persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    (firebaseService.isInitialized as any).mockReturnValue(false);
    (storageService.getClients as any).mockReturnValue([]);
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('saveSession always uses sessionStorage', () => {
    authService.saveSession('COACH');

    expect(sessionStorage.getItem('swingnote_session_role')).toBe('COACH');
    expect(localStorage.getItem('swingnote_session_role')).toBeNull();
  });

  it('saveSession prefers sessionStorage even when localStorage has stale session values', () => {
    localStorage.setItem('swingnote_session_role', 'COACH');
    localStorage.setItem(
      'swingnote_session_client_data',
      JSON.stringify({ name: 'n', phone: 'p' })
    );

    authService.saveSession('CLIENT', { name: 'client', phone: '010-1111-2222' });

    expect(localStorage.getItem('swingnote_session_role')).toBe('COACH');
    expect(sessionStorage.getItem('swingnote_session_role')).toBe('CLIENT');
    expect(authService.restoreSession()).toEqual({
      role: 'CLIENT',
      clientData: { name: 'client', phone: '010-1111-2222' },
    });
  });

  it('logout clears session so login is not persisted', () => {
    authService.saveSession('COACH');

    authService.logout();

    expect(localStorage.getItem('swingnote_session_role')).toBeNull();
    expect(sessionStorage.getItem('swingnote_session_role')).toBeNull();
  });

  it('restoreSession returns null after logout', () => {
    authService.saveSession('COACH');
    expect(authService.restoreSession()).not.toBeNull();

    authService.logout();
    expect(authService.restoreSession()).toBeNull();
  });

  it('loginCoach in API mode persists returned JWT token', async () => {
    const coach = { id: 'coach-1', name: 'Coach', email: 'coach@test.com', phone: '010-0000-0000' };
    (apiService.isAvailable as any).mockReturnValue(true);
    (apiService.loginCoach as any).mockResolvedValue({ token: 'jwt-coach-token', coach });

    await authService.loginCoach('coach@test.com', 'password123');

    expect(apiService.setToken).toHaveBeenCalledWith('jwt-coach-token');
    expect(localStorage.getItem('swingnote_coach_profile')).toEqual(JSON.stringify(coach));
  });

  it('signupClient in API mode persists returned JWT token', async () => {
    const client = { id: 'client-1', name: 'Client', email: 'client@test.com', phone: '010-1111-1111' };
    (apiService.isAvailable as any).mockReturnValue(true);
    (apiService.signupClient as any).mockResolvedValue({ token: 'jwt-client-token', client });

    await authService.signupClient('Client', 'client@test.com', 'password123', '010-1111-1111');

    expect(apiService.setToken).toHaveBeenCalledWith('jwt-client-token');
  });

  it('signupCoach still uses API when availability flag is false (default-base mode)', async () => {
    const coach = { id: 'coach-2', name: 'Coach', email: 'coach@test.com', phone: '010-3333-3333' };
    (apiService.isAvailable as any).mockReturnValue(false);
    (apiService.signupCoach as any).mockResolvedValue({ token: 'jwt-coach-token-2', coach });

    await authService.signupCoach(' Coach ', ' Coach@Test.com ', 'password123', ' 010-3333-3333 ');

    expect(apiService.signupCoach).toHaveBeenCalledWith('Coach', 'coach@test.com', 'password123', '010-3333-3333');
    expect(apiService.setToken).toHaveBeenCalledWith('jwt-coach-token-2');
  });

  it('loginClient still uses API when availability flag is false (default-base mode)', async () => {
    const client = { id: 'client-2', name: 'Client', email: 'client@test.com', phone: '010-4444-4444' };
    (apiService.isAvailable as any).mockReturnValue(false);
    (apiService.loginClient as any).mockResolvedValue({ token: 'jwt-client-token-2', client });

    await authService.loginClient(' Client@Test.com ', 'password123');

    expect(apiService.loginClient).toHaveBeenCalledWith('client@test.com', 'password123');
    expect(apiService.setToken).toHaveBeenCalledWith('jwt-client-token-2');
  });

  it('loginCoach rejects when API login fails even if local profile exists', async () => {
    (apiService.isAvailable as any).mockReturnValue(false);
    (apiService.loginCoach as any).mockRejectedValueOnce(new Error('network down'));
    localStorage.setItem(
      'swingnote_coach_profile',
      JSON.stringify({
        id: 'coach-fallback-2',
        name: 'Fallback Coach',
        email: 'fallback@test.com',
        phone: '010-5555-5555',
        password: 'pw1234',
      })
    );

    await expect(
      authService.loginCoach(' Fallback@Test.com ', 'pw1234')
    ).rejects.toBe('로그인을 위해 서버 연결이 필요합니다.');
    expect(apiService.loginCoach).toHaveBeenCalledWith('fallback@test.com', 'pw1234');
  });

  it('loginCoach does not allow local fallback auth without API mode', async () => {
    (apiService.isAvailable as any).mockReturnValue(false);
    (apiService.loginCoach as any).mockRejectedValueOnce(new Error('api unavailable'));
    localStorage.setItem(
      'swingnote_coach_profile',
      JSON.stringify({
        id: 'coach-fallback',
        name: 'Fallback Coach',
        email: 'fallback@test.com',
        phone: '010-2222-2222',
        password: 'pw1234',
      })
    );

    await expect(authService.loginCoach('fallback@test.com', 'pw1234')).rejects.toBe(
      '로그인을 위해 서버 연결이 필요합니다.'
    );
    expect(apiService.setToken).not.toHaveBeenCalled();
  });

  it('logout clears persisted API JWT token', () => {
    authService.logout();
    expect(apiService.clearToken).toHaveBeenCalledTimes(1);
  });
});
