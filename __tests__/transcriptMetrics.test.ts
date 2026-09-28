/**
 * 레슨 필기 채점 함수. 평가 스크립트가 내는 숫자를 믿으려면 채점 자체가
 * 맞아야 한다.
 */
import { describe, expect, it } from 'vitest';
import {
  characterErrorRate,
  editDistance,
  extractTermList,
  normalizeForScoring,
  termRecall,
} from '../services/transcriptMetrics';

describe('normalizeForScoring', () => {
  it('화자 표기·타임스탬프·공백·문장부호를 지운다', () => {
    expect(normalizeForScoring('코치: 페이스가 열렸어요.\n학생: 네!')).toBe('페이스가열렸어요네');
    expect(normalizeForScoring('[0:10–0:20] Smash Factor 1.4')).toBe('smashfactor14');
  });
});

describe('editDistance / characterErrorRate', () => {
  it('편집 거리를 센다', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('같다', '같다')).toBe(0);
  });

  it('띄어쓰기·화자 표기 차이는 오류로 세지 않는다', () => {
    expect(characterErrorRate('코치: 테이크 어웨이를 낮게', '테이크어웨이를 낮게')).toBe(0);
  });

  it('틀린 글자 수를 정답 길이로 나눈다', () => {
    // "페이스가열렸다"(7자) 중 1자가 틀렸다.
    expect(characterErrorRate('페이스가 열렸다', '페이서가 열렸다')).toBeCloseTo(1 / 7);
  });
});

describe('extractTermList', () => {
  it('머리말을 버리고 괄호 안 대안까지 편다', () => {
    const terms = extractTermList(
      '[셋업] 그립(스트롱/위크, 인터로킹), 어드레스\n[구질] 슬라이스, 훅'
    );
    expect(terms).toEqual(
      expect.arrayContaining(['그립', '스트롱', '위크', '인터로킹', '어드레스', '슬라이스'])
    );
    // 한 글자 용어는 우연히 겹치기 쉬워 뺀다.
    expect(terms).not.toContain('훅');
    expect(terms.some((t) => t.includes('['))).toBe(false);
  });
});

describe('termRecall', () => {
  const terms = ['섕크', '다운블로', '얼리 익스텐션', '익스텐션', '페이스'];

  it('정답에 나온 용어가 바른 표기로 적힌 비율을 잰다', () => {
    const r = termRecall(
      '코치: 섕크 나면 다운블로로 치세요. 페이스 보세요. 페이스!',
      '코치: 생크 나면 다운 블로로 치세요. 페이스 보세요. 페이서!',
      terms
    );
    // 섕크 0/1, 다운블로 1/1(공백 무시), 페이스 1/2
    expect(r.expected).toBe(4);
    expect(r.found).toBe(2);
    expect(r.recall).toBe(0.5);
    expect(r.missed).toEqual(
      expect.arrayContaining([
        { term: '섕크', expected: 1, found: 0 },
        { term: '페이스', expected: 2, found: 1 },
      ])
    );
  });

  it('긴 용어 안의 짧은 용어를 두 번 세지 않는다', () => {
    const r = termRecall('얼리 익스텐션이 나와요', '얼리 익스텐션이 나와요', terms);
    expect(r.expected).toBe(1);
    expect(r.recall).toBe(1);
  });

  it('정답에 용어가 없으면 재현율 1', () => {
    expect(termRecall('오늘 날씨 좋네요', '오늘 날씨 좋네요', terms).recall).toBe(1);
  });
});
