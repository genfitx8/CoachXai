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
    getToken: vi.fn().mockReturnValue(null),
    getTokenExpiryMs: vi.fn().mockReturnValue(null),
    isTokenExpired: vi.fn().mockReturnValue(false),
    refreshToken: vi.fn(),
  },
}));

describe('authService logout and session persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    (firebaseService.isInitialized as any).mockReturnValue(false);
    (storageService.getClients as any).mockReturnValue([]);
    (apiService.getToken as any).mockReturnValue(null);
    (apiService.getTokenExpiryMs as any).mockReturnValue(null);
    (apiService.isTokenExpired as any).mockReturnValue(false);
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('keeps a coach session across app restarts (localStorage)', () => {
    authService.saveSession('COACH');

    expect(localStorage.getItem('swingnote_session_role')).toBe('COACH');
    expect(sessionStorage.getItem('swingnote_session_role')).toBeNull();

    // A relaunch drops sessionStorage but not localStorage.
    sessionStorage.clear();
    expect(authService.restoreSession()).toEqual({ role: 'COACH' });
  });

  it('keeps a client session across app restarts (localStorage)', () => {
    authService.saveSession('CLIENT', { name: 'client', phone: '010-1111-2222' });

    sessionStorage.clear();
    expect(authService.restoreSession()).toEqual({
      role: 'CLIENT',
      clientData: { name: 'client', phone: '010-1111-2222' },
    });
  });

  it('keeps admin consoles tab-scoped (sessionStorage)', () => {
    authService.saveSession('ADMIN');

    expect(sessionStorage.getItem('swingnote_session_role')).toBe('ADMIN');
    expect(localStorage.getItem('swingnote_session_role')).toBeNull();

    sessionStorage.clear();
    expect(authService.restoreSession()).toBeNull();
  });

  it('saveSession clears a session left behind in the other store', () => {
    localStorage.setItem('swingnote_session_role', 'COACH');
    localStorage.setItem(
      'swingnote_session_client_data',
      JSON.stringify({ name: 'n', phone: 'p' })
    );

    authService.saveSession('BRANCH_ADMIN', undefined, {
      branchId: 'b1',
      branchName: '지점',
      username: 'staff',
      adminId: 'b1:staff',
    });

    expect(localStorage.getItem('swingnote_session_role')).toBeNull();
    expect(sessionStorage.getItem('swingnote_session_role')).toBe('BRANCH_ADMIN');
    expect(authService.restoreSession()).toEqual({
      role: 'BRANCH_ADMIN',
      branchAdminData: {
        branchId: 'b1',
        branchName: '지점',
        username: 'staff',
        adminId: 'b1:staff',
      },
    });
  });

  it('restoreSession drops a persistent session whose token has expired', () => {
    authService.saveSession('COACH');
    (apiService.isTokenExpired as any).mockReturnValue(true);

    expect(authService.restoreSession()).toBeNull();
    expect(localStorage.getItem('swingnote_session_role')).toBeNull();
    expect(apiService.clearToken).toHaveBeenCalled();
  });

  it('restoreSession still reads a legacy sessionStorage-only session', () => {
    sessionStorage.setItem('swingnote_session_role', 'COACH');

    expect(authService.restoreSession()).toEqual({ role: 'COACH' });
  });

  it('renewSessionToken refreshes a token that is close to expiry', async () => {
    (apiService.isAvailable as any).mockReturnValue(true);
    (apiService.getToken as any).mockReturnValue('jwt');
    (apiService.getTokenExpiryMs as any).mockReturnValue(Date.now() + 60 * 60 * 1000);
    (apiService.refreshToken as any).mockResolvedValue(true);

    await expect(authService.renewSessionToken()).resolves.toBe(true);
    expect(apiService.refreshToken).toHaveBeenCalledTimes(1);
  });

  it('renewSessionToken leaves a still-fresh token alone', async () => {
    (apiService.isAvailable as any).mockReturnValue(true);
    (apiService.getToken as any).mockReturnValue('jwt');
    (apiService.getTokenExpiryMs as any).mockReturnValue(
      Date.now() + 29 * 24 * 60 * 60 * 1000
    );

    await expect(authService.renewSessionToken()).resolves.toBe(false);
    expect(apiService.refreshToken).not.toHaveBeenCalled();
  });

  it('renewSessionToken keeps the session when the refresh call just fails', async () => {
    authService.saveSession('COACH');
    (apiService.isAvailable as any).mockReturnValue(true);
    (apiService.getToken as any).mockReturnValue('jwt');
    (apiService.getTokenExpiryMs as any).mockReturnValue(Date.now() + 1000);
    (apiService.refreshToken as any).mockRejectedValue(
      Object.assign(new Error('네트워크 오류'), { status: 0 })
    );

    await expect(authService.renewSessionToken()).resolves.toBe(false);
    expect(localStorage.getItem('swingnote_session_role')).toBe('COACH');
  });

  it('renewSessionToken ends the session when the server rejects the token', async () => {
    authService.saveSession('COACH');
    (apiService.isAvailable as any).mockReturnValue(true);
    (apiService.getToken as any).mockReturnValue('jwt');
    (apiService.getTokenExpiryMs as any).mockReturnValue(Date.now() + 1000);
    (apiService.refreshToken as any).mockRejectedValue(
      Object.assign(new Error('Account no longer exists'), { status: 401 })
    );

    await expect(authService.renewSessionToken()).resolves.toBe(false);
    expect(localStorage.getItem('swingnote_session_role')).toBeNull();
    expect(apiService.clearToken).toHaveBeenCalled();
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
