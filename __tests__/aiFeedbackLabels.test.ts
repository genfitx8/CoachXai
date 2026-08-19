/**
 * 코치의 행동이 학습 라벨로 남는지 (docs/DATA_ARCHITECTURE.md §6.2).
 *
 * 이 배선이 끊기면 화면상으로는 아무 문제가 없다 — 별표도 눌리고 저장도
 * 된다. 몇 달 뒤 학습 데이터를 뽑을 때에야 라벨이 한 줄도 없다는 걸 알게
 * 된다(실제로 exemplar → few-shot 주입이 그렇게 조용히 끊겨 있었다,
 * evals/BASELINE.md v4). 그래서 배선 자체를 테스트로 못 박는다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/apiService', () => ({
  apiService: {
    isAvailable: vi.fn().mockReturnValue(true),
    getToken: vi.fn().mockReturnValue('token'),
    recordAiFeedback: vi.fn().mockResolvedValue(undefined),
    saveCoachStyleExemplar: vi.fn().mockResolvedValue(undefined),
    deleteCoachStyleExemplar: vi.fn().mockResolvedValue(undefined),
    getCoachStyleExemplars: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../services/firebase', () => ({
  firebaseService: {
    saveCoachStyleExemplar: vi.fn(),
    deleteCoachStyleExemplar: vi.fn(),
    getCoachStyleExemplars: vi.fn(),
  },
}));
vi.mock('../services/storage', () => ({
  storageService: {
    saveCoachStyleExemplar: vi.fn(),
    deleteCoachStyleExemplar: vi.fn(),
    getCoachStyleExemplars: vi.fn(() => []),
  },
}));

import { apiService } from '../services/apiService';
import { aiFeedbackService } from '../services/aiFeedbackService';
import { coachStyleService } from '../services/coachStyleService';
import type { CoachStyleExemplar, CoachStyleExemplarSource } from '../types';

const exemplar = (source: CoachStyleExemplarSource): CoachStyleExemplar => ({
  id: `ex-${source}`,
  coachId: 'coach-1',
  target: 'lesson_summary',
  input: '레슨 검토 · 김한나 · 2026-08-19',
  output: '오른팔 매달림을 먼저 잡읍시다.',
  source,
  tier: 1,
  reason: '코치가 이 표현을 선호',
  createdAt: 1,
});

const recordAiFeedback = vi.mocked(apiService.recordAiFeedback);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('aiFeedbackService', () => {
  it('서버 모드에서 라벨을 보낸다', async () => {
    aiFeedbackService.record({ kind: 'regenerated', entityType: 'lesson', entityId: 'l1' });
    expect(recordAiFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'regenerated', entityId: 'l1' })
    );
  });

  it('전송 실패가 호출부로 새어 나가지 않는다 — 라벨 때문에 코치 작업이 깨지면 안 된다', async () => {
    recordAiFeedback.mockRejectedValueOnce(new Error('offline'));
    expect(() => aiFeedbackService.record({ kind: 'starred' })).not.toThrow();
    await Promise.resolve();
  });

  it('토큰이 없으면 보내지 않는다 — 로컬에 쌓아 봐야 추출 파이프라인이 못 본다', () => {
    vi.mocked(apiService.getToken).mockReturnValueOnce(null);
    aiFeedbackService.record({ kind: 'starred' });
    expect(recordAiFeedback).not.toHaveBeenCalled();
  });
});

describe('coachStyleService.save → 라벨', () => {
  it('별표/수정/반려는 각각의 kind 로 남는다', async () => {
    await coachStyleService.save(exemplar('starred'), false);
    await coachStyleService.save(exemplar('edited'), false);
    await coachStyleService.save(exemplar('dissent'), false);

    const kinds = recordAiFeedback.mock.calls.map((c) => c[0].kind);
    expect(kinds).toEqual(['starred', 'edited', 'dissent']);
  });

  it('학생의 높은 평가(feedback)는 thumbs_up 으로 옮긴다', async () => {
    await coachStyleService.save(exemplar('feedback'), false);
    expect(recordAiFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'thumbs_up', tier: 1, target: 'lesson_summary' })
    );
  });

  it('auto(휴리스틱 자동 선정)는 사람의 판단이 아니므로 라벨로 남기지 않는다', async () => {
    await coachStyleService.save(exemplar('auto'), false);
    expect(recordAiFeedback).not.toHaveBeenCalled();
  });

  it('예시 저장 경로와 무관하게 라벨은 남는다 (Firebase 모드)', async () => {
    vi.mocked(apiService.getToken).mockReturnValue('token');
    await coachStyleService.save(exemplar('starred'), true);
    expect(recordAiFeedback).toHaveBeenCalledTimes(1);
  });
});
