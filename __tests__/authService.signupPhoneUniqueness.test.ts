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

describe('authService signup phone uniqueness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.clear();
    (firebaseService.isInitialized as any).mockReturnValue(false);
    (storageService.getClients as any).mockReturnValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects coach signup when phone matches an existing coach with different format', async () => {
    localStorage.setItem(
      'swingnote_coach_profile',
      JSON.stringify({
        id: 'coach-1',
        name: '기존코치',
        email: 'existing@coach.com',
        phone: '01012345678',
      })
    );

    await expect(
      authService.signupCoach(
        '새코치',
        'new@coach.com',
        'password123',
        '010-1234-5678'
      )
    ).rejects.toBe('이미 가입된 휴대폰 번호입니다.');
  });

  it('rejects coach signup when phone is entered as +82 010 format', async () => {
    localStorage.setItem(
      'swingnote_coach_profile',
      JSON.stringify({
        id: 'coach-1',
        name: '기존코치',
        email: 'existing@coach.com',
        phone: '01012345678',
      })
    );

    await expect(
      authService.signupCoach(
        '새코치',
        'new2@coach.com',
        'password123',
        '+82 010-1234-5678'
      )
    ).rejects.toBe('이미 가입된 휴대폰 번호입니다.');
  });

  it('rejects client signup when phone matches an existing account with different format', async () => {
    (storageService.getClients as any).mockReturnValue([
      {
        name: '기존회원',
        phone: '01012345678',
        email: 'existing@client.com',
        password: 'password123',
      },
    ]);

    const signupPromise = authService.signupClient(
      '새회원',
      'new@client.com',
      'password123',
      '010-1234-5678'
    );

    const rejection = expect(signupPromise).rejects.toBe(
      '이미 가입된 휴대폰 번호입니다.'
    );
    await vi.advanceTimersByTimeAsync(500);
    await rejection;
  });

  it('allows upgrading a legacy client profile with same normalized phone and name', async () => {
    const legacyProfile = {
      name: '홍길동',
      phone: '01012345678',
      isSubscribed: false,
      subscriptionPlan: 'FREE' as const,
      currentPoints: 0,
    };
    (storageService.getClients as any).mockReturnValue([legacyProfile]);

    const signupPromise = authService.signupClient(
      '홍길동',
      'legacy@client.com',
      'password123',
      '010-1234-5678'
    );

    await vi.advanceTimersByTimeAsync(500);
    const profile = await signupPromise;

    expect(profile.email).toBe('legacy@client.com');
    expect(storageService.saveClients).toHaveBeenCalledWith([
      expect.objectContaining({
        name: '홍길동',
        phone: '01012345678',
        email: 'legacy@client.com',
      }),
    ]);
  });
});
