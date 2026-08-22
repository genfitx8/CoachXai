/**
 * LessonStoryView 렌더 테스트.
 *
 * 조판 규칙은 lessonStoryComposer.test.ts 가 잡고 있으므로, 여기서는
 * 렌더러가 블록 배열을 화면으로 옮기면서 지켜야 할 것만 본다:
 *
 *  - 문단 사이에 사진이 실제로 끼어 들어가는가(DOM 순서)
 *  - 영상은 탭하기 전까지 <video> 를 만들지 않는가
 *  - 필기 원문은 접힌 동안 DOM 에 없는가
 *  - 접근성 — 캡션이 alt 가 되고, 없으면 위치 폴백이 붙는가
 *  - 초안 표시가 코치에게만 뜨는가
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { LessonStoryView } from '../components/LessonStoryView';
import { MAIN_MEDIA_ID } from '../services/lessonStoryComposer';
import type { Lesson } from '../types';

const lesson = (over: Partial<Lesson> = {}): Lesson => ({
  id: 'l1',
  clientName: '이수진',
  clientPhone: '01000000000',
  createdBy: 'COACH',
  date: '2026-08-19',
  title: '드라이버 교정',
  videoUrl: 'https://cdn.test/main.mp4',
  mediaType: 'video',
  coachNotes: '',
  tags: [],
  createdAt: 1,
  ...over,
});

const media = {
  [MAIN_MEDIA_ID]: { url: 'https://cdn.test/main.mp4', type: 'video' as const },
  shot: { url: 'https://cdn.test/shot.jpg', type: 'image' as const, poster: 'https://cdn.test/shot.jpg' },
  clip: { url: 'https://cdn.test/clip.mp4', type: 'video' as const },
};

const wordy = {
  todayCovered: '오늘은 슬라이스를 잡았어요',
  feedback: '첫째 문단\n둘째 문단\n셋째 문단\n넷째 문단',
};

describe('LessonStoryView', () => {
  it('표지의 제목과 날짜·회차·코치명을 그린다', () => {
    render(
      <LessonStoryView
        lesson={lesson({ story: { headline: '오른팔이 붙기 시작한 날' }, sessionNumber: 3 })}
        viewer="CLIENT"
        coachName="김도현"
        media={media}
      />
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      '오른팔이 붙기 시작한 날'
    );
    expect(screen.getByText('2026.08.19 · 3회차 · 김도현 코치')).toBeInTheDocument();
  });

  it('표지에는 사진을 걸지 않는다 — 자료는 전부 본문으로 내려간다', () => {
    const { container } = render(
      <LessonStoryView
        lesson={lesson({
          reviewSections: wordy,
          additionalMedia: [
            { id: 'shot', url: 'https://cdn.test/shot.jpg', type: 'image', createdAt: 1 },
          ],
        })}
        viewer="CLIENT"
        media={media}
      />
    );
    // 표지(<header>) 안에는 어떤 자료도 없다.
    const header = container.querySelector('header');
    expect(header).not.toBeNull();
    expect(header!.querySelector('img')).toBeNull();
    expect(header!.querySelector('video')).toBeNull();
    expect(header!.querySelector('button')).toBeNull();
    // 사진은 본문에 있다.
    expect(container.querySelector('figure img')).not.toBeNull();
  });

  it('사진이 문단 사이에 들어간다 — 갤러리처럼 뭉치지 않는다', () => {
    const { container } = render(
      <LessonStoryView
        lesson={lesson({
          reviewSections: wordy,
          additionalMedia: [
            { id: 'shot', url: 'https://cdn.test/shot.jpg', type: 'image', createdAt: 1 },
          ],
        })}
        viewer="CLIENT"
        media={media}
      />
    );
    // 본문 컨테이너의 직계 자식 순서에서 figure 앞뒤가 모두 문단이어야 한다.
    const figure = container.querySelector('figure');
    expect(figure).not.toBeNull();
    expect(figure!.previousElementSibling?.tagName).toBe('P');
    expect(figure!.nextElementSibling?.tagName).toBe('P');
  });

  it('영상은 탭하기 전까지 <video> 를 만들지 않는다', () => {
    const { container } = render(
      <LessonStoryView
        lesson={lesson({
          videoUrl: '',
          reviewSections: wordy,
          additionalMedia: [
            { id: 'clip', url: 'https://cdn.test/clip.mp4', type: 'video', createdAt: 1 },
          ],
        })}
        viewer="CLIENT"
        media={media}
      />
    );
    expect(container.querySelector('video')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '레슨 자료 1/1 재생' }));
    expect(container.querySelector('video')).not.toBeNull();
  });

  it('캡션이 있으면 alt 로 쓰고, 없으면 위치 폴백을 붙인다', () => {
    const { rerender } = render(
      <LessonStoryView
        lesson={lesson({
          videoUrl: '',
          reviewSections: wordy,
          additionalMedia: [
            { id: 'shot', url: 'https://cdn.test/shot.jpg', type: 'image', createdAt: 1 },
          ],
        })}
        viewer="CLIENT"
        media={media}
      />
    );
    expect(screen.getByAltText('레슨 자료 1/1')).toBeInTheDocument();

    rerender(
      <LessonStoryView
        lesson={lesson({
          videoUrl: '',
          reviewSections: wordy,
          additionalMedia: [
            { id: 'shot', url: 'https://cdn.test/shot.jpg', type: 'image', createdAt: 1 },
          ],
          story: { captions: { shot: '탑에서 팔꿈치 붙은 순간' } },
        })}
        viewer="CLIENT"
        media={media}
      />
    );
    expect(screen.getByAltText('탑에서 팔꿈치 붙은 순간')).toBeInTheDocument();
  });

  it('필기 원문은 접힌 동안 DOM 에 없고, 펼치면 나타난다', () => {
    render(
      <LessonStoryView
        lesson={lesson({
          reviewSections: wordy,
          liveLessonDetail: {
            recordedDurationSec: 2520,
            transcript: [{ startSec: 0, text: '오른팔을 붙여서 쳐보세요' }],
          },
        })}
        viewer="COACH"
        media={media}
      />
    );
    expect(screen.queryByText(/오른팔을 붙여서 쳐보세요/)).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /그날의 필기/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);

    expect(screen.getByText(/오른팔을 붙여서 쳐보세요/)).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('할 일은 학생 뷰에서만 체크된다', () => {
    const withActions = lesson({
      reviewSections: { ...wordy, nextActions: ['타월 드릴 20회'] },
    });

    const student = render(
      <LessonStoryView lesson={withActions} viewer="CLIENT" media={media} />
    );
    const task = student.getByRole('button', { name: /타월 드릴 20회/ });
    expect(task).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(task);
    expect(task).toHaveAttribute('aria-pressed', 'true');
    student.unmount();

    render(<LessonStoryView lesson={withActions} viewer="COACH" media={media} />);
    expect(screen.queryByRole('button', { name: /타월 드릴 20회/ })).not.toBeInTheDocument();
    expect(screen.getByText('타월 드릴 20회')).toBeInTheDocument();
  });

  it('초안 표시는 코치에게만 뜬다', () => {
    const draft = lesson({ reviewSections: wordy, approvalStatus: 'draft' });

    const coach = render(<LessonStoryView lesson={draft} viewer="COACH" media={media} />);
    expect(coach.getByText(/학생에게 아직 보이지 않아요/)).toBeInTheDocument();
    coach.unmount();

    render(<LessonStoryView lesson={draft} viewer="CLIENT" media={media} />);
    expect(screen.queryByText(/학생에게 아직 보이지 않아요/)).not.toBeInTheDocument();
  });

  it('한마디가 없으면 학생에게 입력 유도를 띄우고 자료 탭으로 넘긴다', () => {
    const onWriteReply = vi.fn();
    render(
      <LessonStoryView
        lesson={lesson({ reviewSections: wordy })}
        viewer="CLIENT"
        media={media}
        onWriteReply={onWriteReply}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /한마디 남기기/ }));
    expect(onWriteReply).toHaveBeenCalledTimes(1);
  });

  it('자료가 사라진 첨부는 빈칸이 아니라 안내로 그린다', () => {
    render(
      <LessonStoryView
        lesson={lesson({
          reviewSections: wordy,
          additionalMedia: [
            { id: 'gone', url: 'idb://missing', type: 'image', createdAt: 1 },
          ],
        })}
        viewer="CLIENT"
        // 'gone' 이 맵에 없다 — 해석에 실패한 상황
        media={media}
      />
    );
    expect(screen.getByText('자료를 불러오지 못했어요')).toBeInTheDocument();
  });

  it('미디어도 글도 없는 기록은 표지와 서명만으로 성립한다', () => {
    const { container } = render(
      <LessonStoryView
        lesson={{ ...lesson(), videoUrl: '' }}
        viewer="COACH"
        coachName="김도현"
        media={{}}
      />
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('드라이버 교정');
    // 대표컷이 없으면 표지 메타와 서명이 나란히 붙는다 — 서명 쪽을 집어 확인한다.
    expect(screen.getByText(/^— 김도현 코치/)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('샷 데이터는 값이 있는 항목만 숫자 스트립으로 그린다', () => {
    render(
      <LessonStoryView
        lesson={lesson({
          reviewSections: wordy,
          golfData: { carryDistance: 218, smashFactor: 1.44, ballSpeed: undefined },
        })}
        viewer="CLIENT"
        media={media}
      />
    );
    expect(screen.getByText('Carry')).toBeInTheDocument();
    expect(screen.getByText('218')).toBeInTheDocument();
    expect(screen.getByText('1.44')).toBeInTheDocument();
    expect(screen.queryByText('Ball')).not.toBeInTheDocument();
  });

  it('레슨 전/후 영상은 비교 블록으로 나란히 놓인다', () => {
    render(
      <LessonStoryView
        lesson={lesson({
          reviewSections: wordy,
          additionalMedia: [
            { id: 'b', url: 'https://cdn.test/b.mp4', type: 'video', role: 'BEFORE', createdAt: 1 },
            { id: 'a', url: 'https://cdn.test/a.mp4', type: 'video', role: 'AFTER', createdAt: 1 },
          ],
        })}
        viewer="CLIENT"
        media={{
          ...media,
          b: { url: 'https://cdn.test/b.mp4', type: 'video' },
          a: { url: 'https://cdn.test/a.mp4', type: 'video' },
        }}
      />
    );
    expect(screen.getByText('레슨 전')).toBeInTheDocument();
    expect(screen.getByText('레슨 후')).toBeInTheDocument();
  });

  it('MEDIA_ONLY 로 공유된 기록은 학생에게 글 없이 사진첩으로 보인다', () => {
    const { container } = render(
      <LessonStoryView
        lesson={lesson({
          videoUrl: '',
          shareOption: 'MEDIA_ONLY',
          reviewSections: wordy,
          additionalMedia: [
            { id: 'shot', url: 'https://cdn.test/shot.jpg', type: 'image', createdAt: 1 },
          ],
        })}
        viewer="CLIENT"
        media={media}
      />
    );
    expect(screen.queryByText('첫째 문단')).not.toBeInTheDocument();
    expect(screen.queryByText('오늘은 슬라이스를 잡았어요')).not.toBeInTheDocument();
    // 그래도 빈 화면은 아니다
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(within(container).getByAltText(/레슨 사진 1/)).toBeInTheDocument();
  });
});
