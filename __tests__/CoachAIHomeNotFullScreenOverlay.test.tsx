import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { CoachAIHome } from '../components/CoachAIHome';
import { LanguageProvider } from '../components/LanguageContext';
import type { CoachProfile } from '../types';

vi.mock('../services/geminiService', () => ({
  generateCoachXChatResponseStream: vi.fn().mockResolvedValue(''),
}));

/**
 * Regression: CoachAIHome used to render with `fixed inset-0 z-50`, which
 * fully covered the app header (z-40) and the coach bottom nav (z-40) — the
 * coach landed on the AI Home after login with no visible way to navigate to
 * Students / Reservations / hamburger / logout, and the app read as "crashed
 * after login." The root must NOT be a full-viewport overlay above the nav.
 */
describe('CoachAIHome — respects the app shell', () => {
  const coach: CoachProfile = {
    id: 'c1',
    name: '테스트코치',
    email: 't@c.com',
    phone: '01012345678',
  } as CoachProfile;

  it('root does not use `fixed inset-0 z-50` (would cover header/nav)', () => {
    const { container } = render(
      <LanguageProvider>
        <CoachAIHome
          coachProfile={coach}
          allLessons={[]}
          clients={[]}
          todayLessons={[]}
          onNavigateToDashboard={() => {}}
        />
      </LanguageProvider>
    );

    const root = container.firstChild as HTMLElement;
    expect(root).toBeTruthy();
    const cls = root.className;

    // The class-string form is what actually mattered — the previous bug
    // was literal `fixed inset-0 z-50` on the root. Assert both parts:
    //  1. Not a top-covering overlay (`top-0` / `inset-0`)
    //  2. Not `z-50` (would sit above header/nav at z-40)
    expect(cls).not.toMatch(/(^|\s)inset-0(\s|$)/);
    expect(cls).not.toMatch(/(^|\s)top-0(\s|$)/);
    expect(cls).not.toMatch(/(^|\s)z-50(\s|$)/);
  });
});
