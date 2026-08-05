import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClientApp } from '../components/ClientApp';
import { LanguageProvider } from '../components/LanguageContext';
import { ClientProfile } from '../types';

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
  currentPoints: 0,
  subscriptionPlan: 'FREE',
};

describe('ClientApp recent-records refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onRefreshLessons when the recent-records button is tapped so a lesson the coach just saved shows up without a page reload', () => {
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

    fireEvent.click(screen.getByRole('button', { name: /최근 기록/i }));

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
      fireEvent.click(screen.getByRole('button', { name: /최근 기록/i }))
    ).not.toThrow();
  });
});
