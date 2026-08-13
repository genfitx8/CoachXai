import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClientApp } from '../components/ClientApp';
import { LanguageProvider } from '../components/LanguageContext';
import type { ClientProfile } from '../types';

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
  name: '테스트학생',
  phone: '010-3333-4444',
  currentPoints: 0,
  subscriptionPlan: 'FREE',
};

const renderClientApp = () =>
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

/**
 * Regression: ClientApp's `showMedia` useState initializer used to call
 * `JSON.parse(localStorage.getItem('client_showMedia'))` with no guard.
 * A poisoned entry left over from an old write (literal "undefined" from a
 * `JSON.stringify(undefined)`, a hand-edited value, another script)
 * therefore threw `SyntaxError: "undefined" is not valid JSON` *inside*
 * render — React unmounted the whole subtree, and the student saw the app
 * "튕김" the instant login was supposed to hand them off to the AI Home.
 *
 * ClientApp must mount cleanly and heal the offending slot regardless of
 * what garbage is sitting in `client_showMedia`.
 */
describe('ClientApp — poisoned client_showMedia self-heal', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  const poisonedShapes = ['undefined', 'null', '', '{not-json', '"maybe"', '42'];

  for (const raw of poisonedShapes) {
    it(`mounts without throwing when client_showMedia = ${JSON.stringify(raw)}`, () => {
      localStorage.setItem('client_showMedia', raw);
      expect(() => renderClientApp()).not.toThrow();
      // Hamburger button belongs to the AI-Home header — if it's on screen,
      // the component actually rendered instead of crashing during mount.
      expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument();
      // Corrupt entries are cleared so the next boot starts clean.
      if (raw !== '' && raw !== 'null') {
        expect(localStorage.getItem('client_showMedia')).not.toBe(raw);
      }
    });
  }

  it('honors a legitimately stored `true` / `false`', () => {
    localStorage.setItem('client_showMedia', 'true');
    renderClientApp();
    // Pref survived — the healing path only kicks in on corrupt values.
    expect(localStorage.getItem('client_showMedia')).toBe('true');
  });
});
