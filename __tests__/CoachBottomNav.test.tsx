/**
 * Tests for the coach bottom navigation:
 * 1. It renders exactly the five primary tabs (대화 / 학생 / 기록 / 동반 / 예약).
 * 2. The "레슨 기록" tab is gone — that list is reached from the hamburger menu.
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
  it('renders the five primary tabs and no 레슨 기록 tab', () => {
    render(<CoachBottomNav activeTab="LESSON" onTabChange={vi.fn()} />);

    const nav = screen.getByRole('navigation', { name: /coach navigation/i });
    const tabs = nav.querySelectorAll('button');
    expect(tabs).toHaveLength(5);

    expect(screen.getByText('대화')).toBeInTheDocument();
    expect(screen.getByText('학생')).toBeInTheDocument();
    expect(screen.getByText('기록')).toBeInTheDocument();
    expect(screen.getByText('동반')).toBeInTheDocument();
    expect(screen.getByText('예약')).toBeInTheDocument();

    expect(screen.queryByText('레슨 기록')).toBeNull();
  });

  it('marks the active tab and reports taps to the parent', () => {
    const onTabChange = vi.fn();
    render(<CoachBottomNav activeTab="CLIENTS" onTabChange={onTabChange} />);

    const active = screen
      .getByRole('navigation', { name: /coach navigation/i })
      .querySelector('[aria-current="page"]');
    expect(active).toHaveTextContent('학생');

    fireEvent.click(screen.getByText('예약'));
    expect(onTabChange).toHaveBeenCalledWith('RESERVATIONS');
  });
});
