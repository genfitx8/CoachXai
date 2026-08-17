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
    // Resolving the designated coach runs on mount whenever coachId is set.
    getCoachById: vi.fn().mockReturnValue(null),
  },
}));

const BASE_PROFILE: ClientProfile = {
  name: '김회원',
  phone: '010-1111-2222',
  currentPoints: 0,
  subscriptionPlan: 'FREE',
};

const renderClientApp = (profile: ClientProfile) =>
  render(
    <LanguageProvider>
      <ClientApp
        clientProfile={profile}
        allLessons={[]}
        onLogout={vi.fn()}
        onUpdateLesson={vi.fn()}
      />
    </LanguageProvider>
  );

/**
 * Designating a coach from the student app is the only thing that links a
 * student account to a coach account — the coach app has no member
 * registration form. These tests pin the prompt that gets an unlinked
 * student there, and the deep link into the coach-designation section.
 */
describe('ClientApp – student-driven coach linking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prompts an unlinked student to connect a coach', () => {
    renderClientApp(BASE_PROFILE);
    expect(screen.getByTestId('client-connect-coach-cta')).toBeInTheDocument();
  });

  it('hides the prompt once a coach is designated', () => {
    renderClientApp({ ...BASE_PROFILE, coachId: 'coach-1', designatedCoach: '박코치' });
    expect(screen.queryByTestId('client-connect-coach-cta')).toBeNull();
  });

  it('opens the coach-designation section when the prompt is tapped', () => {
    renderClientApp(BASE_PROFILE);

    fireEvent.click(screen.getByTestId('client-connect-coach-cta'));

    expect(screen.getByTestId('client-coach-search-section')).toBeInTheDocument();
  });
});
