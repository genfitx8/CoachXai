import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClientApp } from '../components/ClientApp';
import { LanguageProvider } from '../components/LanguageContext';
import { Lesson, ClientProfile } from '../types';

vi.mock('../services/firebase', () => ({
  firebaseService: {
    isInitialized: vi.fn().mockReturnValue(false),
  },
}));

vi.mock('../services/storage', () => ({
  storageService: {
    getHomework: vi.fn().mockReturnValue([]),
    getQuickLogsByClient: vi.fn().mockReturnValue([]),
    searchCoachesByName: vi.fn().mockReturnValue([]),
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

describe('ClientApp saved lesson delete action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes a lesson when user confirms', () => {
    const onDeleteLesson = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderClientApp(onDeleteLesson);
    fireEvent.click(screen.getByRole('button', { name: /최근 기록/i }));
    fireEvent.click(screen.getByTitle('삭제'));

    expect(confirmSpy).toHaveBeenCalledWith('이 레슨을 삭제하시겠습니까?');
    expect(onDeleteLesson).toHaveBeenCalledWith('lesson-1');
  });

  it('does not delete a lesson when user cancels', () => {
    const onDeleteLesson = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderClientApp(onDeleteLesson);
    fireEvent.click(screen.getByRole('button', { name: /최근 기록/i }));
    fireEvent.click(screen.getByTitle('삭제'));

    expect(onDeleteLesson).not.toHaveBeenCalled();
  });
});
