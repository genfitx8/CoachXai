import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authService } from '../services/authService';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';

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
  },
}));

describe('authService logout and auto-login preference', () => {
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

  it('saveSession with isAutoLogin=true stores AUTO_LOGIN_PREF and session in localStorage', () => {
    authService.saveSession('COACH', undefined, true);

    expect(localStorage.getItem('swingnote_auto_login_pref')).toBe('1');
    expect(localStorage.getItem('swingnote_session_role')).toBe('COACH');
    expect(sessionStorage.getItem('swingnote_session_role')).toBeNull();
  });

  it('saveSession with isAutoLogin=false clears AUTO_LOGIN_PREF and uses sessionStorage', () => {
    // First save with auto-login true
    authService.saveSession('COACH', undefined, true);
    expect(localStorage.getItem('swingnote_auto_login_pref')).toBe('1');

    // Now save with auto-login false
    authService.saveSession('COACH', undefined, false);

    expect(localStorage.getItem('swingnote_auto_login_pref')).toBeNull();
    expect(sessionStorage.getItem('swingnote_session_role')).toBe('COACH');
    expect(localStorage.getItem('swingnote_session_role')).toBeNull();
  });

  it('logout clears AUTO_LOGIN_PREF so auto-login is disabled after logout', () => {
    authService.saveSession('COACH', undefined, true);
    expect(localStorage.getItem('swingnote_auto_login_pref')).toBe('1');

    authService.logout();

    expect(localStorage.getItem('swingnote_auto_login_pref')).toBeNull();
    expect(localStorage.getItem('swingnote_session_role')).toBeNull();
    expect(sessionStorage.getItem('swingnote_session_role')).toBeNull();
  });

  it('getAutoLoginPref returns true when preference is set', () => {
    authService.saveSession('COACH', undefined, true);
    expect(authService.getAutoLoginPref()).toBe(true);
  });

  it('getAutoLoginPref returns false when preference is not set', () => {
    expect(authService.getAutoLoginPref()).toBe(false);
  });

  it('getAutoLoginPref returns false after logout (was true before)', () => {
    authService.saveSession('COACH', undefined, true);
    expect(authService.getAutoLoginPref()).toBe(true);

    authService.logout();
    expect(authService.getAutoLoginPref()).toBe(false);
  });

  it('restoreSession returns null after logout', () => {
    authService.saveSession('COACH', undefined, true);
    expect(authService.restoreSession()).not.toBeNull();

    authService.logout();
    expect(authService.restoreSession()).toBeNull();
  });
});
