import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authService } from '../services/authService';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';

vi.mock('../services/firebase', () => ({
  firebaseService: {
    isInitialized: vi.fn(),
    getCoaches: vi.fn(),
    saveCoach: vi.fn(),
    getClients: vi.fn(),
    saveClients: vi.fn(),
  },
}));

vi.mock('../services/storage', () => ({
  storageService: {
    getClients: vi.fn(),
    saveClients: vi.fn(),
  },
}));

const PASSWORD_POLICY_ERROR =
  '비밀번호는 8자 이상이며 문자, 숫자, 특수문자를 모두 포함해야 합니다.';

describe('authService password policy', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    (firebaseService.isInitialized as any).mockReturnValue(false);
    (storageService.getClients as any).mockReturnValue([]);
  });

  it('rejects coach signup when password does not meet policy', async () => {
    await expect(
      authService.signupCoach('코치', 'coach@example.com', 'password1', '010-1111-2222')
    ).rejects.toBe(PASSWORD_POLICY_ERROR);
  });

  it('rejects client signup when password does not meet policy', async () => {
    await expect(
      authService.signupClient('회원', 'client@example.com', 'password1', '010-3333-4444')
    ).rejects.toBe(PASSWORD_POLICY_ERROR);
  });

  it('allows signup when password meets policy', async () => {
    const coach = await authService.signupCoach(
      '코치',
      'coach@example.com',
      'Strong!123',
      '010-1111-2222'
    );

    expect(coach.email).toBe('coach@example.com');
    expect(coach.password).toBe('Strong!123');
  });
});
