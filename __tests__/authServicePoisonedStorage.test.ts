import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authService } from '../services/authService';
import { apiService } from '../services/apiService';

vi.mock('../services/firebase', () => ({
  firebaseService: { isInitialized: vi.fn().mockReturnValue(false), getCoaches: vi.fn(), getClients: vi.fn() },
}));

vi.mock('../services/storage', () => ({
  storageService: { getClients: vi.fn().mockReturnValue([]) },
}));

/**
 * Regression: a malformed login response used to write `JSON.stringify(undefined)`
 * — which is `undefined`, not a string — into localStorage. The browser then
 * coerced the value to the literal string `"undefined"`, and every subsequent
 * read of `swingnote_coach_profile` / `swingnote_api_token` crashed with
 * `SyntaxError: "undefined" is not valid JSON`. The app was unrecoverable
 * from that point on and appeared to "crash after login" every session.
 */
describe('authService — poisoned storage self-heal', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns null (and clears) when coach profile is the literal "undefined" string', () => {
    localStorage.setItem('swingnote_coach_profile', 'undefined');
    expect(() => authService.getCoachProfile()).not.toThrow();
    expect(authService.getCoachProfile()).toBeNull();
    expect(localStorage.getItem('swingnote_coach_profile')).toBeNull();
  });

  it('returns null when coach profile contains malformed JSON', () => {
    localStorage.setItem('swingnote_coach_profile', '{not-json');
    expect(authService.getCoachProfile()).toBeNull();
    expect(localStorage.getItem('swingnote_coach_profile')).toBeNull();
  });

  it('restoreSession tolerates a poisoned client-session payload', () => {
    sessionStorage.setItem('swingnote_session_role', 'CLIENT');
    sessionStorage.setItem('swingnote_session_client_data', 'undefined');
    expect(authService.restoreSession()).toBeNull();
    expect(sessionStorage.getItem('swingnote_session_client_data')).toBeNull();
  });

  it('restoreSession tolerates a poisoned branch-admin payload', () => {
    sessionStorage.setItem('swingnote_session_role', 'BRANCH_ADMIN');
    sessionStorage.setItem('swingnote_session_branch_admin_data', 'not-json{');
    expect(authService.restoreSession()).toBeNull();
    expect(sessionStorage.getItem('swingnote_session_branch_admin_data')).toBeNull();
  });

  it('apiService.setToken refuses undefined instead of storing "undefined"', () => {
    // Simulate a malformed login response where token came back undefined.
    // @ts-expect-error — we're deliberately passing the wrong type.
    apiService.setToken(undefined);
    expect(apiService.getToken()).toBeNull();
    expect(localStorage.getItem('swingnote_api_token')).toBeNull();
  });

  it('apiService.getToken heals the literal "undefined" string left by earlier bad writes', () => {
    localStorage.setItem('swingnote_api_token', 'undefined');
    expect(apiService.getToken()).toBeNull();
    expect(localStorage.getItem('swingnote_api_token')).toBeNull();
  });
});
