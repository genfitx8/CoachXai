/**
 * consentService — 목적별 동의 (docs/DATA_ARCHITECTURE.md §8.2).
 *
 * `ai_training` 동의가 이 앱에서 가장 값비싼 스위치다: 이 동의가 있는
 * 사용자의 호출만 프롬프트·응답 **원문**이 저장되고, 그 원문만 §6.3
 * 데이터셋 추출에 포함된다. 소급 동의는 불가능하므로 동의를 받지 못한
 * 기간의 대화는 영원히 학습에 쓸 수 없다.
 *
 * 서버 모드에서만 의미가 있다 — 동의는 서버 DB의 상태이지 기기의
 * 설정값이 아니다(기기를 바꿔도 따라와야 하고, 감사 대상이다).
 */

import { ConsentPurpose, ConsentRecord } from '../types';
import { apiService } from './apiService';
import { createLogger } from '../utils/logger';

const log = createLogger('consent');

const isApiMode = (): boolean => apiService.isAvailable() && !!apiService.getToken();

export const consentService = {
  isSupported: isApiMode,

  /** 내 동의 현황. 서버 모드가 아니거나 조회 실패 시 빈 배열. */
  async list(): Promise<ConsentRecord[]> {
    if (!isApiMode()) return [];
    try {
      const data = await apiService.getConsents();
      return data.consents;
    } catch (err) {
      log.warn('failed to load consents', err);
      return [];
    }
  },

  async isGranted(purpose: ConsentPurpose): Promise<boolean> {
    const consents = await this.list();
    return consents.some((c) => c.purpose === purpose && c.granted);
  },

  /** 동의 설정/철회. 실패는 호출부가 사용자에게 알려야 하므로 throw 한다. */
  async set(
    purpose: ConsentPurpose,
    granted: boolean,
    source: 'signup' | 'settings' = 'settings'
  ): Promise<ConsentRecord[]> {
    if (!isApiMode()) return [];
    const data = await apiService.setConsent(purpose, granted, source);
    return data.consents;
  },

  /**
   * 가입 직후 호출 — 실패해도 가입 플로우를 막지 않는다. 동의를 놓치면
   * 사용자가 설정에서 다시 켤 수 있지만, 가입이 실패하면 돌이킬 수 없다.
   */
  setAtSignup(purpose: ConsentPurpose, granted: boolean): void {
    if (!granted || !isApiMode()) return;
    void apiService.setConsent(purpose, true, 'signup').catch((err) => {
      log.warn('failed to record signup consent', err);
    });
  },
};
