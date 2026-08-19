/**
 * LessonNotebook — 종이 노트 필기 뷰.
 *
 * 핵심 계약:
 *  - 마운트 시점에 이미 있던 줄은 애니메이션 없이 즉시 전부 보인다
 *    (복구/재진입 시 우르르 재타이핑되면 안 된다).
 *  - 마운트 후 도착한 줄은 글자 단위로 드러난다(받아 적기 애니메이션).
 *  - 요약 불릿과 "정리 중…" 상태가 하단 요약 노트에 표시된다.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { LessonNotebook, type NotebookLine } from '../components/LessonNotebook';

const line = (id: number, text: string): NotebookLine => ({
  id,
  atSec: id * 10,
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
    // 마진 타임스탬프
    expect(screen.getByText('0:10')).toBeInTheDocument();
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
