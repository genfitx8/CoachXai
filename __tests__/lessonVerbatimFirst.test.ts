/**
 * "들린 대로 먼저, 보정은 나중" — 레슨 필기의 제1원칙.
 *
 * 코치가 한 말이 **다른 말로 적히는 것**은 오탈자보다 나쁘다. 기록을 못
 * 믿게 되기 때문이다. 그래서 두 자리를 막는다.
 *  1. 라이브 전사 프롬프트는 "들린 대로"만 시키고, 앞 문장을 이어 쓰도록
 *     부추기지 않는다(그게 실제로 없던 말을 만들어 냈다).
 *  2. 오타 교정은 단어를 되돌릴 뿐, 문장을 새로 쓰지 못한다.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/geminiService', () => ({
  invokeBackendAI: vi.fn(),
  getResponseText: (r: unknown) => (typeof r === 'string' ? r : null),
}));
vi.mock('../services/promptService', () => ({
  promptService: { getActiveSystemPrompt: vi.fn(async () => 'SYSTEM') },
}));
vi.mock('../services/firebase', () => ({
  firebaseService: { isInitialized: () => false },
}));

import {
  buildLiveTranscribePrompt,
  isAcceptableRepair,
  transcriptSimilarity,
} from '../services/lessonAudioPipeline';

describe('라이브 전사 프롬프트', () => {
  const prompt = buildLiveTranscribePrompt({
    studentName: '김회원',
    index: 3,
    startSec: 24,
    durationSec: 8,
    previousKeyPoints: [],
    previousTurns: [{ speaker: 'coach', text: '체중을 왼발에 실어 보세요' }],
  });

  it('들린 대로 적고, 못 알아들은 부분은 비우라고 시킨다', () => {
    expect(prompt).toContain('실제로 들리는 말만');
    expect(prompt).toContain('비워 두세요');
    expect(prompt).toContain('짐작해 채우지 마세요');
  });

  it('앞 문장을 프롬프트에 싣지 않는다 — 이어 쓰기를 유도하면 없던 말이 생긴다', () => {
    expect(prompt).not.toContain('체중을 왼발에 실어 보세요');
  });
});

describe('transcriptSimilarity', () => {
  it('단어 하나를 되돌린 문장은 원문과 닮은 것으로 본다', () => {
    expect(
      transcriptSimilarity(
        '얼리 익스텐숀이 나오니까 골반을 뒤로 빼주세요',
        '얼리 익스텐션이 나오니까 골반을 뒤로 빼주세요'
      )
    ).toBeGreaterThan(0.7);
  });

  it('완전히 다른 문장은 닮지 않은 것으로 본다', () => {
    expect(
      transcriptSimilarity(
        '얼리 익스텐숀이 나오니까 골반을 뒤로 빼주세요',
        '오늘 날씨가 좋아서 라운딩 나가기 딱 좋겠어요'
      )
    ).toBeLessThan(0.2);
  });
});

describe('isAcceptableRepair', () => {
  it('오인식 용어를 되돌린 교정은 받아들인다', () => {
    expect(
      isAcceptableRepair(
        '얼리 익스텐숀이 나오니까 골반을 뒤로 빼주세요',
        '얼리 익스텐션이 나오니까 골반을 뒤로 빼주세요'
      )
    ).toBe(true);
  });

  it('길이가 비슷해도 다른 말로 바꿔 오면 버린다', () => {
    // 예전에는 길이 비율만 봐서 이런 응답이 그대로 필기에 실렸다.
    expect(
      isAcceptableRepair(
        '얼리 익스텐숀이 나오니까 골반을 뒤로 빼주세요',
        '오늘 날씨가 좋아서 라운딩 나가기 딱 좋겠어요'
      )
    ).toBe(false);
  });

  it('설명을 붙여 늘린 응답은 버린다', () => {
    expect(
      isAcceptableRepair(
        '골반을 뒤로 빼주세요',
        '골반을 뒤로 빼주세요. 이는 얼리 익스텐션을 방지하기 위한 동작입니다.'
      )
    ).toBe(false);
  });

  it('짧은 줄의 단어 교정은 닮음을 따지지 않고 받아들인다', () => {
    // "페이서" → "페이스" 는 정당한 교정인데 문자 겹침은 낮게 나온다.
    expect(isAcceptableRepair('페이서 각도', '페이스 각도')).toBe(true);
  });
});
