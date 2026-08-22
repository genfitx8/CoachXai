/**
 * 코치가 스토리 위에서 글자를 고치는 흐름 테스트.
 *
 * 지켜야 할 것:
 *  - 학생 화면에는 편집 자국도, 빈 자리를 채우라는 안내도 없다
 *  - 고친 값이 patch 로 올라가고 editedByCoach 가 함께 붙는다
 *    (그래야 AI 가 코치의 제목을 덮지 않는다)
 *  - 캡션을 비우면 키가 남지 않는다 — "비웠다"와 "안 썼다"를 구분하려고
 *    빈 문자열을 남기면 다음 조판이 빈 캡션을 그린다
 *  - Escape 로 되돌리면 저장되지 않는다
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LessonStoryView } from '../components/LessonStoryView';
import { MAIN_MEDIA_ID } from '../services/lessonStoryComposer';
import type { Lesson, LessonStory } from '../types';

const lesson = (over: Partial<Lesson> = {}): Lesson => ({
  id: 'l1',
  clientName: '이수진',
  clientPhone: '01000000000',
  createdBy: 'COACH',
  date: '2026-08-19',
  title: '드라이버 교정',
  videoUrl: '',
  mediaType: 'video',
  coachNotes: '',
  tags: [],
  createdAt: 1,
  reviewSections: {
    todayCovered: '오늘은 슬라이스를 잡았어요',
    feedback: '첫째 문단\n둘째 문단\n셋째 문단\n넷째 문단',
  },
  additionalMedia: [
    { id: 'shot', url: 'https://cdn.test/shot.jpg', type: 'image', createdAt: 1 },
  ],
  ...over,
});

const media = {
  [MAIN_MEDIA_ID]: { url: 'https://cdn.test/main.mp4', type: 'video' as const },
  shot: { url: 'https://cdn.test/shot.jpg', type: 'image' as const },
};

const renderStory = (over: Partial<Lesson> = {}, editable = true) => {
  const onStoryChange = vi.fn<(patch: Partial<LessonStory>) => void>();
  render(
    <LessonStoryView
      lesson={lesson(over)}
      viewer={editable ? 'COACH' : 'CLIENT'}
      coachName="김도현"
      media={media}
      editable={editable}
      onStoryChange={onStoryChange}
    />
  );
  return onStoryChange;
};

/** 편집 자리를 열고 값을 넣은 뒤 확정한다. */
const editField = (name: RegExp | string, next: string) => {
  fireEvent.click(screen.getByRole('button', { name }));
  const field = screen.getByRole('textbox', { name });
  fireEvent.change(field, { target: { value: next } });
  fireEvent.blur(field);
};

describe('스토리 저작 — 학생 화면', () => {
  it('학생에게는 편집 자리가 보이지 않는다', () => {
    renderStory({}, false);
    expect(screen.queryByRole('button', { name: /제목 고치기/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /캡션 달기/ })).not.toBeInTheDocument();
    expect(screen.queryByText('＋ 캡션 달기')).not.toBeInTheDocument();
  });

  it('학생에게는 비어 있는 리드가 아예 없는 것으로 보인다', () => {
    renderStory({}, false);
    expect(screen.queryByText(/한 줄 덧붙이기/)).not.toBeInTheDocument();
  });
});

describe('스토리 저작 — 제목과 리드', () => {
  it('제목을 고치면 editedByCoach 와 함께 올라간다', () => {
    const onStoryChange = renderStory();
    editField(/제목 고치기/, '오른팔이 붙기 시작한 날');
    expect(onStoryChange).toHaveBeenCalledWith({
      headline: '오른팔이 붙기 시작한 날',
      editedByCoach: true,
    });
  });

  it('비어 있던 리드를 채울 수 있다', () => {
    const onStoryChange = renderStory();
    editField(/리드 고치기/, '3주째 잡던 슬라이스가 줄었다');
    expect(onStoryChange).toHaveBeenCalledWith({
      dek: '3주째 잡던 슬라이스가 줄었다',
      editedByCoach: true,
    });
  });

  it('리드를 비우면 undefined 로 지운다', () => {
    const onStoryChange = renderStory({ story: { dek: '지울 리드' } });
    editField(/리드 고치기/, '   ');
    expect(onStoryChange).toHaveBeenCalledWith({ dek: undefined, editedByCoach: true });
  });

  it('값이 그대로면 저장하지 않는다 — 열었다 닫기만 한 경우', () => {
    const onStoryChange = renderStory({ story: { headline: '그대로' } });
    fireEvent.click(screen.getByRole('button', { name: /제목 고치기/ }));
    fireEvent.blur(screen.getByRole('textbox', { name: /제목 고치기/ }));
    expect(onStoryChange).not.toHaveBeenCalled();
  });

  it('Escape 로 되돌리면 저장되지 않는다', () => {
    const onStoryChange = renderStory({ story: { headline: '원래 제목' } });
    fireEvent.click(screen.getByRole('button', { name: /제목 고치기/ }));
    const field = screen.getByRole('textbox', { name: /제목 고치기/ });
    fireEvent.change(field, { target: { value: '고치다 말았다' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onStoryChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /제목 고치기/ })).toHaveTextContent('원래 제목');
  });

  it('제목이 비어 있으면 코치에게 안내가 보인다', () => {
    renderStory({ title: '' });
    // 조판기가 lesson.title 폴백까지 비면 '레슨 기록' 을 넣으므로,
    // 실제로 빈 자리가 되는 것은 리드다.
    expect(screen.getByRole('button', { name: /리드 고치기/ })).toHaveTextContent(
      '한 줄 덧붙이기'
    );
  });
});

describe('스토리 저작 — 사진 캡션', () => {
  it('사진 밑에서 캡션을 쓸 수 있다', () => {
    const onStoryChange = renderStory();
    editField(/캡션 달기/, '탑에서 팔꿈치 붙은 순간');
    expect(onStoryChange).toHaveBeenCalledWith({
      captions: { shot: '탑에서 팔꿈치 붙은 순간' },
      editedByCoach: true,
    });
  });

  it('다른 사진의 캡션을 지우지 않고 합친다', () => {
    const onStoryChange = renderStory({
      story: { captions: { 다른사진: '기존 캡션' } },
    });
    editField(/캡션 달기/, '새 캡션');
    expect(onStoryChange).toHaveBeenCalledWith({
      captions: { 다른사진: '기존 캡션', shot: '새 캡션' },
      editedByCoach: true,
    });
  });

  it('캡션을 비우면 빈 문자열이 아니라 키가 사라진다', () => {
    const onStoryChange = renderStory({ story: { captions: { shot: '지울 캡션' } } });
    editField(/캡션 달기/, '  ');
    expect(onStoryChange).toHaveBeenCalledWith({ captions: {}, editedByCoach: true });
  });

  it('캡션이 없는 사진에는 코치에게만 안내가 뜬다', () => {
    renderStory();
    expect(screen.getByRole('button', { name: /캡션 달기/ })).toHaveTextContent(
      '＋ 캡션 달기'
    );
  });
});
