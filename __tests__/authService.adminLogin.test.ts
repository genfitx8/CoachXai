import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authService } from '../services/authService';
import { apiService } from '../services/apiService';

vi.mock('../services/firebase', () => ({
  firebaseService: {
    isInitialized: vi.fn().mockReturnValue(false),
    getCoaches: vi.fn(),
    getClients: vi.fn(),
    saveCoach: vi.fn(),
    saveClients: vi.fn(),
  },
}));

vi.mock('../services/storage', () => ({
  storageService: {
    getClients: vi.fn().mockReturnValue([]),
    saveClients: vi.fn(),
  },
}));

vi.mock('../services/apiService', () => ({
  apiService: {
    isAvailable: vi.fn().mockReturnValue(true),
    loginAdmin: vi.fn(),
    setToken: vi.fn(),
    clearToken: vi.fn(),
    setAdminToken: vi.fn(),
    clearAdminToken: vi.fn(),
    getAdminToken: vi.fn(),
  },
}));

describe('authService.loginAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('delegates verification to the server with a normalized email', async () => {
    (apiService.loginAdmin as any).mockResolvedValue({ token: 'admin-jwt' });

    await expect(authService.loginAdmin('  Admin@CoachX.KR ', 'pw')).resolves.toBe(true);

    expect(apiService.loginAdmin).toHaveBeenCalledWith('admin@coachx.kr', 'pw');
  });

  it('never accepts credentials without the server, so no secret lives in the bundle', async () => {
    (apiService.loginAdmin as any).mockRejectedValue(
      Object.assign(new Error('관리자 로그인 정보가 일치하지 않습니다.'), { status: 401 })
    );

    await expect(authService.loginAdmin('admin@coachx.kr', 'admin1234')).rejects.toBe(
      '관리자 로그인 정보가 일치하지 않습니다.'
    );
  });

  it('surfaces the server message when the admin account is not configured', async () => {
    (apiService.loginAdmin as any).mockRejectedValue(
      Object.assign(
        new Error(
          '관리자 계정이 서버에 설정되어 있지 않습니다. ADMIN_EMAIL / ADMIN_PASSWORD_HASH 환경변수를 확인하세요.'
        ),
        { status: 500 }
      )
    );

    await expect(authService.loginAdmin('admin@coachx.kr', 'pw')).rejects.toContain(
      'ADMIN_EMAIL / ADMIN_PASSWORD_HASH'
    );
  });

  it('logout clears the admin session token', () => {
    authService.logout();

    expect(apiService.clearAdminToken).toHaveBeenCalledTimes(1);
  });
});
