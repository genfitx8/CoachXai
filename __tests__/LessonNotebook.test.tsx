/**
 * LessonNotebook — 종이 노트 필기 뷰.
 *
 * 핵심 계약:
 *  - 타임스탬프는 표시하지 않는다 — 코치가 읽는 것은 시각이 아니라 흐름.
 *  - 가까운 조각들은 한 문단으로 이어져 대화 문장처럼 읽힌다. 발화 사이가
 *    크게 벌어지면(PARAGRAPH_GAP_SEC) 문단이 끊긴다.
 *  - 마운트 시점에 이미 있던 조각은 애니메이션 없이 즉시 전부 보인다
 *    (복구/재진입 시 우르르 재타이핑되면 안 된다).
 *  - 마운트 후 도착한 조각은 글자 단위로 드러난다(받아 적기 애니메이션).
 *  - 요약 불릿과 "정리 중…" 상태가 하단 요약 노트에 표시된다.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { LessonNotebook, type NotebookLine } from '../components/LessonNotebook';

/** 기본은 5초 간격 — 같은 문단으로 이어지는 연속 발화. */
const line = (id: number, text: string, atSec = id * 5): NotebookLine => ({
  id,
  atSec,
  text,
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('LessonNotebook', () => {
  it('마운트 시점의 기존 줄은 즉시 전부 렌더링된다', () => {
    render(
      <LessonNotebook
        lines={[line(0, '그립을 조금 짧게 잡아볼게요'), line(1, '백스윙 탑에서 멈췄다가')]}
        writing={false}
        summary=""
        summaryUpdating={false}
      />
    );
    expect(screen.getByText('그립을 조금 짧게 잡아볼게요')).toBeInTheDocument();
    expect(screen.getByText('백스윙 탑에서 멈췄다가')).toBeInTheDocument();
    // 타임스탬프는 더 이상 그리지 않는다
    expect(screen.queryByText('0:05')).toBeNull();
    expect(screen.queryByText('0:10')).toBeNull();
  });

  it('가까운 조각들은 한 문단으로 이어져 문장처럼 읽힌다', () => {
    const { container } = render(
      <LessonNotebook
        lines={[
          line(0, '드라이버 슬라이스를', 20),
          line(1, '교정하는', 24),
          line(2, '레슨 좀 할 건데요', 28),
        ]}
        writing={false}
        summary=""
        summaryUpdating={false}
      />
    );
    const paragraphs = container.querySelectorAll('p');
    const body = Array.from(paragraphs).find((p) =>
      p.textContent?.includes('드라이버')
    );
    expect(body?.textContent).toBe('드라이버 슬라이스를 교정하는 레슨 좀 할 건데요');
  });

  it('발화 사이가 크게 벌어지면 문단이 끊긴다', () => {
    const { container } = render(
      <LessonNotebook
        lines={[
          line(0, '드라이버 슬라이스를 교정할게요', 10),
          // 60초 침묵 뒤 새 화제 — 앞 문단에 붙으면 안 된다
          line(1, '어제 라운딩은 어땠어요', 70),
        ]}
        writing={false}
        summary=""
        summaryUpdating={false}
      />
    );
    const texts = Array.from(container.querySelectorAll('p')).map(
      (p) => p.textContent
    );
    expect(texts).toContain('드라이버 슬라이스를 교정할게요');
    expect(texts).toContain('어제 라운딩은 어땠어요');
  });

  it('잠정 텍스트는 진행 중인 문단 끝에 이어 붙는다', () => {
    const { container } = render(
      <LessonNotebook
        lines={[line(0, '그립을 짧게 잡고', 10)]}
        writing
        interim="스윙 해볼게요"
        animateNewLines={false}
        summary=""
        summaryUpdating={false}
      />
    );
    const body = Array.from(container.querySelectorAll('p')).find((p) =>
      p.textContent?.includes('그립을')
    );
    expect(body?.textContent).toBe('그립을 짧게 잡고 스윙 해볼게요');
  });

  it('마운트 후 도착한 줄은 글자 단위로 적힌다', async () => {
    vi.useFakeTimers();
    const first = [line(0, '기존 필기')];
    const { rerender } = render(
      <LessonNotebook lines={first} writing summary="" summaryUpdating={false} />
    );

    const incoming = '임팩트에서 헤드업 조심';
    rerender(
      <LessonNotebook
        lines={[...first, line(1, incoming)]}
        writing
        summary=""
        summaryUpdating={false}
      />
    );

    // 아직 전체 문장이 보이면 안 된다
    expect(screen.queryByText(incoming)).toBeNull();

    // 글자 수 × 간격만큼 진행하면 전부 적힌다
    await act(async () => {
      await vi.advanceTimersByTimeAsync(incoming.length * 60 + 200);
    });
    expect(screen.getByText(incoming)).toBeInTheDocument();
  });

  it('요약 불릿과 갱신 상태를 표시한다', () => {
    render(
      <LessonNotebook
        lines={[]}
        writing={false}
        summary={'- 오버스윙 교정\n- 캐리 210m'}
        summaryUpdating
      />
    );
    expect(screen.getByText('오늘의 요약')).toBeInTheDocument();
    expect(screen.getByText('- 오버스윙 교정')).toBeInTheDocument();
    expect(screen.getByText('- 캐리 210m')).toBeInTheDocument();
    expect(screen.getByText('정리 중…')).toBeInTheDocument();
  });

  it('필기가 없으면 안내 문구를 보여준다', () => {
    render(
      <LessonNotebook lines={[]} writing={false} summary="" summaryUpdating={false} />
    );
    expect(screen.getByText('코칭 멘트가 들리면 여기에 받아 적혀요')).toBeInTheDocument();
    expect(screen.getByText('필기가 5분쯤 쌓이면 여기에 정리돼요')).toBeInTheDocument();
  });
});
