import { beforeEach, describe, expect, it, vi } from 'vitest';

const { firebaseServiceMock, storageServiceMock } = vi.hoisted(() => ({
  firebaseServiceMock: {
    isInitialized: vi.fn().mockReturnValue(false),
    getSavedConfig: vi.fn(),
    init: vi.fn(),
    signInWithGoogle: vi.fn(),
    getClients: vi.fn(),
    saveClients: vi.fn(),
    getCoaches: vi.fn(),
    saveCoach: vi.fn(),
  },
  storageServiceMock: {
    getClients: vi.fn(),
    saveClients: vi.fn(),
  },
}));

vi.mock('../services/firebase', () => ({
  firebaseService: firebaseServiceMock,
}));

vi.mock('../services/storage', () => ({
  storageService: storageServiceMock,
}));

import { authService } from '../services/authService';

describe('authService.loginWithGoogle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firebaseServiceMock.isInitialized.mockReturnValue(false);
  });

  it('re-initializes Firebase from saved config before Google login', async () => {
    firebaseServiceMock.getSavedConfig.mockReturnValue({
      apiKey: 'api-key',
      authDomain: 'example.firebaseapp.com',
      projectId: 'project',
      storageBucket: 'project.appspot.com',
      messagingSenderId: '123',
      appId: 'app-id',
    });
    firebaseServiceMock.init.mockReturnValue(true);
    firebaseServiceMock.isInitialized
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    firebaseServiceMock.signInWithGoogle.mockResolvedValue({
      user: {
        displayName: 'Tester',
        email: 'tester@example.com',
        phoneNumber: null,
      },
    });
    firebaseServiceMock.getClients.mockResolvedValue([
      {
        name: 'Tester',
        email: 'tester@example.com',
        phone: '',
        isSubscribed: false,
        subscriptionPlan: 'FREE',
        currentPoints: 0,
      },
    ]);

    const profile = await authService.loginWithGoogle('CLIENT');

    expect(firebaseServiceMock.init).toHaveBeenCalledTimes(1);
    expect(firebaseServiceMock.signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(profile).toMatchObject({ email: 'tester@example.com' });
  });

  it('throws a clear message when Firebase config is unavailable', async () => {
    firebaseServiceMock.getSavedConfig.mockReturnValue(null);

    await expect(authService.loginWithGoogle('CLIENT')).rejects.toBe(
      'Firebase 설정이 불완전해 구글 로그인을 사용할 수 없습니다. 누락된 환경변수: VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID 값을 확인해주세요.'
    );
  });

  it('maps auth-domain Firebase error to actionable message', async () => {
    firebaseServiceMock.isInitialized.mockReturnValue(true);
    firebaseServiceMock.signInWithGoogle.mockRejectedValue({
      code: 'auth/auth-domain-config-required',
    });

    await expect(authService.loginWithGoogle('CLIENT')).rejects.toBe(
      'Firebase 인증 도메인 설정이 없어 구글 로그인을 진행할 수 없습니다. VITE_FIREBASE_AUTH_DOMAIN 값을 설정하고 Firebase Console에서 승인된 도메인을 확인해주세요.'
    );
  });

  it('maps unauthorized-domain Firebase error to actionable message', async () => {
    firebaseServiceMock.isInitialized.mockReturnValue(true);
    firebaseServiceMock.signInWithGoogle.mockRejectedValue({
      code: 'auth/unauthorized-domain',
    });

    await expect(authService.loginWithGoogle('CLIENT')).rejects.toBe(
      '현재 도메인이 Firebase 승인 도메인에 등록되어 있지 않아 구글 로그인을 진행할 수 없습니다. Firebase Console > Authentication > Settings > Authorized domains에서 현재 도메인을 추가해주세요.'
    );
  });
});
