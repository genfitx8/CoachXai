/**
 * Tests for the coach bottom navigation (companion-lesson-first relaunch):
 * 1. It renders exactly the three primary tabs (홈 / 동반 레슨 / 학생).
 * 2. The 기록/예약 tabs are gone — recording starts from the agent home or
 *    the hamburger, reservations are feature-gated off.
 * 3. Tapping a tab reports the tab key to the parent.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { CoachBottomNav } from '../components/CoachBottomNav';

// ─── LanguageProvider mock ────────────────────────────────────────────────────
// CoachBottomNav only reads `language` to pick its label table.
vi.mock('../components/LanguageContext', () => ({
  useLanguage: () => ({ language: 'ko', t: (key: string) => key }),
}));

describe('CoachBottomNav', () => {
  it('renders the three primary tabs and no 기록/예약 tabs', () => {
    render(<CoachBottomNav activeTab="LESSON" onTabChange={vi.fn()} />);

    const nav = screen.getByRole('navigation', { name: /coach navigation/i });
    const tabs = nav.querySelectorAll('button');
    expect(tabs).toHaveLength(3);

    expect(screen.getByText('홈')).toBeInTheDocument();
    expect(screen.getByText('동반 레슨')).toBeInTheDocument();
    expect(screen.getByText('학생')).toBeInTheDocument();

    expect(screen.queryByText('기록')).toBeNull();
    expect(screen.queryByText('예약')).toBeNull();
    expect(screen.queryByText('레슨 기록')).toBeNull();
  });

  it('marks the active tab and reports taps to the parent', () => {
    const onTabChange = vi.fn();
    render(<CoachBottomNav activeTab="CLIENTS" onTabChange={onTabChange} />);

    const active = screen
      .getByRole('navigation', { name: /coach navigation/i })
      .querySelector('[aria-current="page"]');
    expect(active).toHaveTextContent('학생');

    fireEvent.click(screen.getByText('동반 레슨'));
    expect(onTabChange).toHaveBeenCalledWith('LIVE');
  });

  it('raises the 동반 레슨 button as the emphasized center action', () => {
    render(<CoachBottomNav activeTab="LESSON" onTabChange={vi.fn()} />);

    const liveTab = screen.getByText('동반 레슨').closest('button');
    expect(liveTab).not.toBeNull();
    // The circular pad floats above the bar (-top-*) and carries the brand
    // emerald — the visual cue that this is the service's core action.
    const pad = liveTab!.querySelector('span[aria-hidden]');
    expect(pad).not.toBeNull();
    expect(pad!.className).toContain('rounded-full');
    expect(pad!.className).toMatch(/-top-/);
    expect(pad!.className).toMatch(/emerald/);
  });
});
