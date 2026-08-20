/**
 * Regression tests for the coach 대화 tab's own header being unreachable.
 *
 * CoachAIHome started life as `fixed inset-0 z-50` — a full-bleed surface
 * whose header was *the* header. ab54168 dropped it to z-30 so the bottom tab
 * bar would show through, which also put it under the app shell's header
 * (z-40, opaque). From then on the CoachX mark (and the typing blink added in
 * 3564a8d), the TTS toggle, the 스윙 분석 link and the 대시보드 button were
 * painted over: hit-testing the wordmark's centre in a real browser returned
 * the app header's row, so those controls were focusable but not clickable.
 *
 * The fix follows what the student 대화 tab already does: one header, owned
 * by the chat surface, carrying the hamburger. App.tsx stops rendering its
 * own bar on this view and the coach profile stays in the drawer.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CoachAIHome } from '../components/CoachAIHome';
import { LanguageProvider } from '../components/LanguageContext';
import { CoachProfile } from '../types';

vi.mock('../services/geminiService', () => ({
  generateCoachXChatResponseStream: vi.fn().mockResolvedValue('ok'),
}));

const COACH: CoachProfile = {
  id: 'coach-1',
  name: '박코치',
  email: 'coach@coachx.kr',
  phone: '010-0000-0000',
};

const renderHome = (onOpenMenu?: () => void) =>
  render(
    <LanguageProvider>
      <CoachAIHome
        coachProfile={COACH}
        allLessons={[]}
        clients={[]}
        todayLessons={[]}
        onNavigateToDashboard={vi.fn()}
        onOpenMenu={onOpenMenu}
      />
    </LanguageProvider>
  );

describe('CoachAIHome header', () => {
  it('carries the hamburger, so hiding the app bar costs no navigation', () => {
    const onOpenMenu = vi.fn();
    renderHome(onOpenMenu);

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    expect(onOpenMenu).toHaveBeenCalledTimes(1);
  });

  it('still surfaces its own actions next to it', () => {
    renderHome(vi.fn());

    // These are the controls the app header used to paint over.
    expect(screen.getByText('CoachX AI')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /대시보드|dashboard/i })).toBeInTheDocument();
    // The standalone swing-analysis shortcut is feature-gated off in the
    // companion-lesson-first relaunch (FEATURES.swingAnalysisShortcut).
    expect(screen.queryByRole('link', { name: /스윙|swing/i })).toBeNull();
  });

  it('takes the top inset itself now that it reaches the top of the screen', () => {
    const { container } = renderHome(vi.fn());

    const shell = container.querySelector('.fixed.inset-x-0.top-0');
    expect(shell).not.toBeNull();
    expect(shell!.className).toContain('pt-safe');
  });
});

describe('coach app shell header', () => {
  const appSource = readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');

  it('does not render a second header over the 대화 tab', () => {
    expect(appSource).toContain("{coachView !== 'COACHX' && (");
  });

  it('hands the drawer opener to the screen that replaced it', () => {
    expect(appSource).toMatch(/<CoachAIHome[\s\S]{0,400}?onOpenMenu=\{\(\) => setHamburgerOpen\(true\)\}/);
  });
});
