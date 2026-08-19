/**
 * aiFeedbackService — 코치의 행동을 학습 라벨로 남긴다
 * (docs/DATA_ARCHITECTURE.md §5.5, §6.2).
 *
 * 별도의 라벨링 UI는 만들지 않는다. 코치가 이미 하는 일 — 별표, 초안
 * 수정, 반려, 재생성 요청, 승인 취소 — 가 그대로 신호다. 여기서는 그
 * 신호를 서버 `ai_feedback_events` 로 흘려보내기만 한다.
 *
 * 원칙:
 * - **본 작업을 절대 막지 않는다.** 실패는 삼키고 로그만 남긴다. 라벨을
 *   못 남겼다고 코치의 승인이 실패해서는 안 된다.
 * - 서버 모드가 아니면 아무 일도 하지 않는다. localStorage 에 라벨을
 *   쌓아 봐야 추출 파이프라인이 볼 수 없어 학습에 쓰이지 못한다.
 */

import { AiFeedbackEventInput } from '../types';
import { apiService } from './apiService';
import { createLogger } from '../utils/logger';

const log = createLogger('aiFeedback');

const isApiMode = (): boolean => apiService.isAvailable() && !!apiService.getToken();

export const aiFeedbackService = {
  /** Fire-and-forget. 호출부는 await 하지 않아도 된다. */
  record(event: AiFeedbackEventInput): void {
    if (!isApiMode()) return;
    void apiService.recordAiFeedback(event).catch((err) => {
      log.warn('failed to record feedback event', err);
    });
  },
};
