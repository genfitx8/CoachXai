import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  currentPoints: 1200,
  subscriptionPlan: 'FREE',
};

const renderClientApp = (lessons: Lesson[] = []) =>
  render(
    <LanguageProvider>
      <ClientApp
        clientProfile={clientProfile}
        allLessons={lessons}
        onLogout={vi.fn()}
        onUpdateLesson={vi.fn()}
      />
    </LanguageProvider>
  );

/**
 * Post-redesign smoke tests for the student app shell:
 *   - AI Home is the landing tab (no dashboard cards).
 *   - Bottom nav exposes the three primary tabs.
 *   - The hamburger button is available in the header for secondary flows.
 */
describe('ClientApp AI-home shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the app with the dark premium surface tokens', () => {
    const { container } = renderClientApp();

    const root = container.firstElementChild as HTMLDivElement;
    expect(root.className).toContain('from-[#05070A]');
    expect(root.className).toContain('text-slate-100');
  });

  it('opens on the AI Home tab and shows the hamburger + bottom-nav shell', () => {
    renderClientApp();

    // Hamburger entry in the AI Home header.
    expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument();

    // Bottom nav — three tabs visible.
    const nav = screen.getByRole('navigation', { name: /student navigation/i });
    expect(nav).toBeInTheDocument();
    // Home tab is the active one and rendered with role=page.
    expect(nav.querySelector('[aria-current="page"]')).not.toBeNull();
  });

  it('does not render the legacy dashboard cards after the redesign', () => {
    renderClientApp();

    // Old dashboard buttons removed by the redesign.
    expect(screen.queryByText('레슨 기록 시작')).toBeNull();
    expect(screen.queryByRole('button', { name: '레슨 예약' })).toBeNull();
    expect(screen.queryByRole('button', { name: '멤버십 결제' })).toBeNull();
  });
});
