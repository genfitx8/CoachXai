/**
 * 학습 데이터 파이프라인의 순수 함수들 (docs/DATA_ARCHITECTURE.md §6.1, §6.3).
 *
 * 두 함수 모두 "쌓이는 데이터의 모양"을 결정한다. 여기가 틀어지면 학습쌍이
 * 조용히 오염되고, 몇 달 뒤 데이터셋을 뽑을 때에야 드러난다.
 */
import { describe, expect, it } from 'vitest';
import { scrubPii } from '../server/src/services/pii';
import { reviewSectionsToText } from '../server/src/services/reviewSections';

describe('scrubPii', () => {
  it('휴대폰·이메일·주민번호를 지운다', () => {
    const raw =
      '김한나 회원(010-1234-5678, hanna@example.com) 주민 900101-2345678 상담 기록';
    const out = scrubPii(raw)!;
    expect(out).not.toContain('010-1234-5678');
    expect(out).not.toContain('hanna@example.com');
    expect(out).not.toContain('900101-2345678');
    expect(out).toContain('[PHONE]');
    expect(out).toContain('[EMAIL]');
    expect(out).toContain('[RRN]');
  });

  it('하이픈 없는 번호와 국가번호 형태도 잡는다', () => {
    expect(scrubPii('01012345678')).toBe('[PHONE]');
    expect(scrubPii('+82 10 1234 5678')).toBe('[PHONE]');
    expect(scrubPii('02-123-4567')).toBe('[PHONE]');
  });

  it('스윙 수치는 건드리지 않는다 — 학습 데이터의 본체다', () => {
    const raw = '7번 아이언 118m, 헤드스피드 74 mph, 발사각 15.6°, 백스핀 6200rpm';
    expect(scrubPii(raw)).toBe(raw);
  });

  it('빈 입력은 null', () => {
    expect(scrubPii('')).toBeNull();
    expect(scrubPii(undefined)).toBeNull();
  });
});

describe('reviewSectionsToText', () => {
  it('섹션을 라벨 비교용 평문으로 편다', () => {
    const text = reviewSectionsToText({
      todayCovered: '드라이버 슬라이스 교정',
      feedback: '백스윙에서 오른팔이 매달립니다.',
      nextActions: ['타월 드릴 10분', '하프스윙 30개'],
    });
    expect(text).toBe(
      '[오늘 다룬 것]\n드라이버 슬라이스 교정\n\n' +
        '[피드백]\n백스윙에서 오른팔이 매달립니다.\n\n' +
        '[다음 액션]\n- 타월 드릴 10분\n- 하프스윙 30개'
    );
  });

  it('자유 메모는 빼서, 코치 개인 메모가 초안≠최종본 차이를 만들지 않게 한다', () => {
    const draft = { todayCovered: '아이언 셋업', feedback: '체중 이동 부족' };
    const final = { ...draft, freeMemo: '다음 주 결제 안내할 것' };
    expect(reviewSectionsToText(final)).toBe(reviewSectionsToText(draft));
  });

  it('빈 액션 항목은 버린다', () => {
    const text = reviewSectionsToText({
      feedback: 'ok',
      nextActions: ['', '   ', '퍼팅 20개'],
    });
    expect(text).toBe('[피드백]\nok\n\n[다음 액션]\n- 퍼팅 20개');
  });

  it('내용이 없으면 null — 빈 학습쌍을 만들지 않는다', () => {
    expect(reviewSectionsToText({})).toBeNull();
    expect(reviewSectionsToText({ freeMemo: '메모만 있음' })).toBeNull();
    expect(reviewSectionsToText(null)).toBeNull();
  });
});
