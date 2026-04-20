import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  currentPoints: 1200,
  subscriptionPlan: 'FREE',
};

const renderClientApp = (lessons: Lesson[] = []) => {
  return render(
    <LanguageProvider>
      <ClientApp
        clientProfile={clientProfile}
        allLessons={lessons}
        onLogout={vi.fn()}
        onUpdateLesson={vi.fn()}
      />
    </LanguageProvider>
  );
};

describe('ClientApp CoachX premium dark alignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders member app shell with dark premium surface styling', () => {
    const { container } = renderClientApp();

    const root = container.firstElementChild as HTMLDivElement;
    expect(root.className).toContain('from-[#05070A]');
    expect(root.className).toContain('text-slate-100');

    expect(screen.getByText('김회원님')).toBeInTheDocument();
    expect(screen.queryByText('멤버십 플랜')).toBeNull();
    expect(screen.queryByText('PRO 멤버십 바로 결제하기')).toBeNull();
    expect(screen.getByRole('button', { name: '멤버십 결제' })).toBeInTheDocument();
    expect(screen.queryByText('예약')).toBeNull();
  });

  it('uses CoachX cool accent styling for member primary actions', () => {
    renderClientApp();

    expect(screen.getByText('레슨 기록 시작').closest('button')?.className).toContain('from-indigo-600');
    expect(screen.queryByRole('button', { name: '레슨 예약' })).toBeNull();
    expect(screen.getByRole('button', { name: '상세 통계' }).className).toContain('bg-slate-950/70');
  });
});
