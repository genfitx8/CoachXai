import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClientApp } from '../components/ClientApp';
import { LanguageProvider } from '../components/LanguageContext';
import { ClientProfile } from '../types';

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
  currentPoints: 0,
  subscriptionPlan: 'FREE',
};

/**
 * Post-redesign: the "recent records" list is now the Growth tab, so the
 * refresh signal that used to fire when the user tapped 최근 기록 now fires
 * when the user switches to Growth.
 */
describe('ClientApp growth-tab refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onRefreshLessons when the user switches to the Growth tab', () => {
    const onRefreshLessons = vi.fn();

    render(
      <LanguageProvider>
        <ClientApp
          clientProfile={clientProfile}
          allLessons={[]}
          onLogout={vi.fn()}
          onUpdateLesson={vi.fn()}
          onRefreshLessons={onRefreshLessons}
        />
      </LanguageProvider>
    );

    // Growth tab lives in the bottom nav labelled "성장" (ko default).
    fireEvent.click(screen.getByRole('button', { name: '성장' }));

    expect(onRefreshLessons).toHaveBeenCalledTimes(1);
  });

  it('does not throw when onRefreshLessons is not provided', () => {
    render(
      <LanguageProvider>
        <ClientApp
          clientProfile={clientProfile}
          allLessons={[]}
          onLogout={vi.fn()}
          onUpdateLesson={vi.fn()}
        />
      </LanguageProvider>
    );

    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: '성장' }))
    ).not.toThrow();
  });
});
