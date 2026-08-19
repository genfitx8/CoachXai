/**
 * ai_training 동의 게이트 (docs/DATA_ARCHITECTURE.md §8.2).
 *
 * 이 스위치가 프롬프트·응답 원문 저장의 유일한 근거다. 소급 동의는
 * 불가능하므로 "가입 때 물어보고, 설정에서 언제든 바꾸고, 실패해도
 * 가입은 막지 않는다"는 세 가지 성질을 못 박아 둔다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/apiService', () => ({
  apiService: {
    isAvailable: vi.fn().mockReturnValue(true),
    getToken: vi.fn().mockReturnValue('token'),
    getConsents: vi.fn(),
    setConsent: vi.fn(),
  },
}));

import { apiService } from '../services/apiService';
import { consentService } from '../services/consentService';

const getConsents = vi.mocked(apiService.getConsents);
const setConsent = vi.mocked(apiService.setConsent);

const granted = {
  policyVersion: '2026-08-01',
  consents: [
    {
      purpose: 'ai_training' as const,
      granted: true,
      grantedAt: '2026-08-19T00:00:00.000Z',
      revokedAt: null,
      policyVersion: '2026-08-01',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiService.isAvailable).mockReturnValue(true);
  vi.mocked(apiService.getToken).mockReturnValue('token');
});

describe('consentService', () => {
  it('동의 현황을 읽는다', async () => {
    getConsents.mockResolvedValueOnce(granted);
    expect(await consentService.isGranted('ai_training')).toBe(true);
  });

  it('조회 실패는 "동의 없음"으로 떨어진다 — 애매할 때 원문을 쌓지 않는 쪽이 안전하다', async () => {
    getConsents.mockRejectedValueOnce(new Error('offline'));
    expect(await consentService.isGranted('ai_training')).toBe(false);
  });

  it('설정 화면에서의 변경은 source=settings 로 기록된다', async () => {
    setConsent.mockResolvedValueOnce(granted);
    await consentService.set('ai_training', true);
    expect(setConsent).toHaveBeenCalledWith('ai_training', true, 'settings');
  });

  it('설정 변경 실패는 호출부로 던진다 — 사용자가 결과를 알아야 한다', async () => {
    setConsent.mockRejectedValueOnce(new Error('boom'));
    await expect(consentService.set('ai_training', false)).rejects.toThrow('boom');
  });

  it('가입 시 동의는 source=signup 으로 남고, 실패해도 가입을 막지 않는다', async () => {
    setConsent.mockRejectedValueOnce(new Error('offline'));
    expect(() => consentService.setAtSignup('ai_training', true)).not.toThrow();
    expect(setConsent).toHaveBeenCalledWith('ai_training', true, 'signup');
    await Promise.resolve();
  });

  it('가입 시 동의하지 않으면 아무것도 기록하지 않는다 (opt-in)', () => {
    consentService.setAtSignup('ai_training', false);
    expect(setConsent).not.toHaveBeenCalled();
  });

  it('서버 모드가 아니면 동의 UI 자체가 의미 없다', async () => {
    vi.mocked(apiService.getToken).mockReturnValue(null);
    expect(consentService.isSupported()).toBe(false);
    expect(await consentService.list()).toEqual([]);
    expect(getConsents).not.toHaveBeenCalled();
  });
});
