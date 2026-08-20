/**
 * Regression tests for the student AND coach apps overlapping the phone's own
 * top and bottom UI (status bar / notch, home indicator / gesture bar,
 * Android nav buttons).
 *
 * The WebView runs edge-to-edge on both platforms, so nothing stays clear of
 * the system bars unless it asks for the inset. Three distinct faults stacked
 * up here:
 *
 *  1. The 대화 tab's chat column was a flat `100dvh`, i.e. it ended exactly
 *     where the fixed bottom nav paints, so the input row rendered *behind*
 *     the tab bar. A `pb-20` on the parent could not lift it — padding only
 *     adds scrollable space after the column. The column has to be shorter
 *     than the viewport instead.
 *  2. That same `pb-20` (80px) was the clearance for a nav that is 64px plus
 *     the device inset, so the tail of the 예약 / 기록 tabs sat under the bar
 *     on every phone with a gesture bar.
 *  3. `pb-safe pb-4` reads like "gutter, and more on a notched phone" but is
 *     the opposite: `.pb-safe` is declared outside every cascade layer and
 *     unlayered rules outrank all layered utilities, so `pb-4` never applied
 *     and the padding collapsed to the raw inset — 0px anywhere the platform
 *     reports none.
 *
 * The coach app carried the same faults in its own dialect: a flat `pb-24`
 * under a 65px bar, a `4rem` literal for the bar's stop on the 대화 home, the
 * same `pb-safe pb-4` pair on that home's input row, and a full-height
 * drawer / full-screen 동반 overlay with no top inset.
 *
 * Android needs one more thing that no stylesheet can supply: its WebView
 * only reports a display cutout through `env(safe-area-inset-*)`, never the
 * system bars, so the insets below all resolve to 0px there. The native shell
 * has to apply the real window insets — see the capacitor config assertions.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ClientApp } from '../components/ClientApp';
import { StudentBottomNav } from '../components/StudentBottomNav';
import { StudentHamburgerMenu } from '../components/StudentHamburgerMenu';
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
    getCoachById: vi.fn().mockReturnValue(null),
  },
}));

const repoFile = (...rel: string[]) =>
  readFileSync(path.join(__dirname, '..', ...rel), 'utf8');

const css = repoFile('index.css');

const PROFILE: ClientProfile = {
  name: '김회원',
  phone: '010-1111-2222',
  currentPoints: 0,
  subscriptionPlan: 'FREE',
};

const renderClientApp = (profile: ClientProfile = PROFILE) =>
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

describe('student safe-area utilities', () => {
  it('reserves the student nav height plus the device inset for scrolling tabs', () => {
    expect(css).toMatch(
      /\.student-nav-clearance\s*\{[^}]*padding-bottom:\s*calc\(var\(--student-nav-height\)\s*\+\s*env\(safe-area-inset-bottom/
    );
  });

  it('sizes the full-height student column to the viewport MINUS the nav', () => {
    // Padding cannot solve this one — the column is measured off the
    // viewport, so it has to be shortened, not padded.
    expect(css).toMatch(
      /\.student-nav-viewport\s*\{[^}]*height:\s*calc\(100dvh\s*-\s*var\(--student-nav-height\)\s*-\s*env\(safe-area-inset-bottom/
    );
  });

  it('counts the nav border into the height everything above it reserves', () => {
    // Reserving only the 64px row leaves the last pixel of content under the
    // bar's own top hairline — verified in a browser, not by eye.
    expect(css).toMatch(/--student-nav-row-height:\s*\d+px/);
    expect(css).toMatch(
      /--student-nav-height:\s*calc\(var\(--student-nav-row-height\)\s*\+\s*1px\)/
    );
  });

  it('offers an additive safe-area gutter, since pb-safe REPLACES padding', () => {
    expect(css).toMatch(
      /\.pb-safe-gutter\s*\{\s*padding-bottom:\s*calc\(1rem\s*\+\s*env\(safe-area-inset-bottom/
    );
  });
});

describe('StudentBottomNav', () => {
  it('pins its row to --student-nav-row-height so the clearance math stays true', () => {
    render(
      <LanguageProvider>
        <StudentBottomNav activeTab="HOME" onTabChange={vi.fn()} />
      </LanguageProvider>
    );

    const nav = screen.getByRole('navigation', { name: /student navigation/i });
    // The bar itself still clears the home indicator / gesture bar.
    expect(nav.className).toContain('pb-safe');

    const row = nav.querySelector('div');
    expect(row).not.toBeNull();
    expect(row!.className).toContain('h-[var(--student-nav-row-height)]');
  });
});

describe('ClientApp chrome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('never falls back to a hard-coded pb-20 for nav clearance', () => {
    // 80px is less than the 64px bar + a gesture bar, which is what put the
    // bottom of every tab under the nav in the first place.
    expect(repoFile('components', 'ClientApp.tsx')).not.toContain('pb-20');
  });

  it('lets the 대화 tab size itself instead of padding it from the outside', () => {
    const { container } = renderClientApp();

    const chatShell = container.querySelector('.student-nav-viewport');
    expect(chatShell).not.toBeNull();

    // Nothing may wrap the chat in bottom padding: that would push the input
    // row back down behind the tab bar instead of lifting it.
    let ancestor = chatShell!.parentElement;
    while (ancestor && ancestor !== container) {
      expect(ancestor.className).not.toMatch(/\bpb-\d/);
      ancestor = ancestor.parentElement;
    }
  });

  it('keeps the chat input row above the fixed bottom nav', () => {
    const { container } = renderClientApp();

    const sendButton = screen.getByRole('button', { name: /send/i });
    const inputBar = sendButton.closest('div.border-t');
    expect(inputBar).not.toBeNull();

    // Inside the reserved column the bar keeps a plain gutter — the nav below
    // owns the device inset. What it must never carry again is the
    // `pb-safe` + `pb-4` pair, where the first silently deletes the second.
    expect(inputBar!.className).toContain('pb-4');
    expect(inputBar!.className).not.toMatch(/\bpb-safe\b/);

    // And the bar has to sit inside the shortened column, not below it.
    expect(inputBar!.closest('.student-nav-viewport')).not.toBeNull();
    expect(container.querySelector('.student-nav-viewport')).not.toBeNull();
  });

  it('scrolls the connect-coach prompt inside the chat column', () => {
    // Stacked above the column it would push the chat down by its own
    // height, putting the input row back under the tab bar for exactly the
    // students who have not linked a coach yet.
    const { container } = renderClientApp();

    const cta = screen.getByTestId('client-connect-coach-cta');
    expect(cta.closest('.student-nav-viewport')).not.toBeNull();
    expect(container.querySelector('.student-nav-viewport')).not.toBeNull();
  });

  it('gives the scrolling tabs the full nav clearance', () => {
    const { container } = renderClientApp();

    fireEvent.click(screen.getByRole('button', { name: '기록' }));

    expect(container.querySelector('.student-nav-clearance')).not.toBeNull();
  });

  it('insets every full-screen sub-view from the status bar and the gesture bar', () => {
    const { container } = renderClientApp();

    fireEvent.click(screen.getByTestId('client-connect-coach-cta'));

    const shell = container.querySelector('.min-h-screen.pt-safe.pb-safe');
    expect(shell).not.toBeNull();
  });
});

describe('StudentHamburgerMenu', () => {
  it('keeps the drawer header and the logout row off the system bars', () => {
    const { container } = render(
      <LanguageProvider>
        <StudentHamburgerMenu
          open
          onClose={vi.fn()}
          clientProfile={PROFILE}
          onAction={vi.fn()}
        />
      </LanguageProvider>
    );

    // Full-height drawer: its first row reaches the notch and its last row
    // the gesture bar.
    const panel = container.querySelector('aside');
    expect(panel).not.toBeNull();
    expect(panel!.className).toContain('pt-safe');
    expect(panel!.className).toContain('pb-safe');
  });
});

describe('NewLessonForm shell (student 기록 flow)', () => {
  const source = repoFile('components', 'NewLessonForm.tsx');

  it('insets the full-screen shell at the top', () => {
    expect(source).toMatch(/fixed inset-0 z-50[^'`]*pt-safe/);
  });

  it('gives the student shell the bottom inset the coach gets from the nav clearance', () => {
    expect(source).toContain(
      "userRole === 'COACH' ? ' above-coach-bottom-nav' : ' pb-safe'"
    );
  });

  it('no longer stacks safe-bottom on a footer that already has its own gutter', () => {
    // `safe-bottom` is unlayered too, so it overwrote the footer's `p-5`
    // rather than adding to it.
    expect(source).not.toContain('safe-bottom');
  });
});

describe('coach safe-area utilities', () => {
  it('counts the nav border into the height everything above it reserves', () => {
    expect(css).toMatch(/--coach-nav-row-height:\s*\d+px/);
    expect(css).toMatch(
      /--coach-nav-height:\s*calc\(var\(--coach-nav-row-height\)\s*\+\s*1px\)/
    );
  });

  it('drives both clearance spellings off that token instead of a literal', () => {
    // `.above-coach-bottom-nav` predates `.coach-nav-clearance` and repeated
    // the 64px by hand, so it silently kept the old, border-less reservation.
    expect(css).toMatch(
      /\.above-coach-bottom-nav\s*\{[^}]*padding-bottom:\s*calc\(var\(--coach-nav-height\)/
    );
    expect(css).not.toMatch(/\.above-coach-bottom-nav\s*\{[^}]*64px/);
  });

  it('offers a clearance variant that keeps the page gutter', () => {
    expect(css).toMatch(
      /\.coach-nav-clearance-gutter\s*\{[^}]*calc\(var\(--coach-nav-height\)[^}]*\+\s*2rem\)/
    );
  });
});

describe('coach app shell', () => {
  const appSource = repoFile('App.tsx');
  const homeSource = repoFile('components', 'CoachAIHome.tsx');

  // The single-surface relaunch removed the coach bottom tab bar entirely:
  // the agent home reaches the bottom edge and owns the home-indicator
  // inset itself, and sub-views only need an ordinary bottom gutter.

  it('no longer reserves tab-bar clearance under the coach content area', () => {
    expect(appSource).not.toContain('coach-nav-clearance-gutter');
    expect(appSource).not.toContain('CoachBottomNav');
  });

  it('runs the agent home to the bottom edge and pads the dock by the inset', () => {
    expect(homeSource).toMatch(/fixed inset-x-0 top-0 bottom-0/);
    expect(homeSource).toMatch(/env\(safe-area-inset-bottom/);
  });

  it('does not pair pb-safe with pb-4 on the coach input row', () => {
    expect(homeSource).not.toContain('pb-safe pb-4');
  });

  it('keeps the coach drawer off the status bar and the gesture bar', () => {
    const drawer = repoFile('components', 'CoachHamburgerMenu.tsx');
    expect(drawer).toMatch(/<aside className="[^"]*pt-safe[^"]*pb-safe/);
  });

  it('keeps the full-screen 동반 overlay off the status bar and gesture bar', () => {
    // fixed inset-0 over the app header: nothing else owns its insets.
    expect(repoFile('components', 'LiveLessonCompanion.tsx')).toMatch(
      /fixed inset-0[^"]*pt-safe[^"]*pb-safe/
    );
  });
});

describe('native shells', () => {
  it.each(['capacitor.student.config.ts', 'capacitor.coach.config.ts'])(
    '%s applies the real window insets on Android, where CSS env() reports none',
    (file) => {
      // targetSdk 35 forces edge-to-edge on Android 15 and the legacy opt-outs
      // (including StatusBar.overlaysWebView) are ignored. Without this the
      // WebView spans the whole display and no stylesheet can tell.
      expect(repoFile(file)).toMatch(/adjustMarginsForEdgeToEdge:\s*'(auto|force)'/);
    }
  );
});
