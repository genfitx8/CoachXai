import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClientApp } from '../components/ClientApp';
import { LanguageProvider } from '../components/LanguageContext';
import { ClientProfile, Lesson } from '../types';

vi.mock('../services/firebase', () => ({
  firebaseService: {
    isInitialized: vi.fn().mockReturnValue(false),
    getStudentContext: vi.fn().mockResolvedValue(null),
    saveStudentContext: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../services/storage', () => ({
  storageService: {
    getHomework: vi.fn().mockReturnValue([]),
    getQuickLogsByClient: vi.fn().mockReturnValue([]),
    searchCoachesByName: vi.fn().mockReturnValue([]),
    getStudentContext: vi.fn().mockReturnValue(null),
    saveStudentContext: vi.fn(),
  },
}));

const clientProfile: ClientProfile = {
  name: '김회원',
  phone: '010-1111-2222',
  currentPoints: 1000,
  subscriptionPlan: 'FREE',
};

const today = new Date().toISOString().slice(0, 10);

const lessons: Lesson[] = [
  {
    id: 'lesson-1',
    clientName: '김회원',
    clientPhone: '010-1111-2222',
    createdBy: 'CLIENT',
    date: today,
    title: '드라이버 스윙',
    videoUrl: '',
    mediaType: 'video',
    coachNotes: '',
    tags: [],
    createdAt: Date.now(),
  },
];

const renderClientApp = (onDeleteLesson = vi.fn()) =>
  render(
    <LanguageProvider>
      <ClientApp
        clientProfile={clientProfile}
        allLessons={lessons}
        onLogout={vi.fn()}
        onUpdateLesson={vi.fn()}
        onDeleteLesson={onDeleteLesson}
      />
    </LanguageProvider>
  );

const openLessonDetailFromGrowth = () => {
  // Growth tab in the bottom nav.
  const nav = screen.getByRole('navigation', { name: /student navigation/i });
  const growthTab = nav.querySelector('button:last-child') as HTMLButtonElement;
  fireEvent.click(growthTab);

  // Growth tab renders the lesson row — click it to open DETAIL.
  fireEvent.click(screen.getByText('드라이버 스윙'));
};

describe('ClientApp saved lesson delete action (post-redesign)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes a lesson from the detail view when the user confirms', () => {
    const onDeleteLesson = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderClientApp(onDeleteLesson);
    openLessonDetailFromGrowth();
    fireEvent.click(screen.getByRole('button', { name: /레슨 기록 삭제하기/ }));

    expect(confirmSpy).toHaveBeenCalledWith(
      '정말 이 레슨 기록을 삭제하시겠습니까? 복구할 수 없습니다.'
    );
    expect(onDeleteLesson).toHaveBeenCalledWith('lesson-1');
  });

  it('does not delete a lesson when the user cancels the confirm dialog', () => {
    const onDeleteLesson = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderClientApp(onDeleteLesson);
    openLessonDetailFromGrowth();
    fireEvent.click(screen.getByRole('button', { name: /레슨 기록 삭제하기/ }));

    expect(onDeleteLesson).not.toHaveBeenCalled();
  });
});
