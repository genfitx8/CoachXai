/**
 * Tests for the coach bottom nav's 홈 tab icon:
 * 1. The tab renders the CoachX 교차 마크 (emerald accent stroke), not a generic chat bubble.
 * 2. The mark follows the tab's active/inactive color via currentColor.
 * 3. The mark is aria-hidden so the button's accessible name stays "홈".
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { CoachBottomNav } from '../components/CoachBottomNav';

vi.mock('../components/LanguageContext', () => ({
  useLanguage: () => ({ language: 'ko', t: (key: string) => key }),
}));

const markOf = (button: HTMLElement) => button.querySelector('svg[viewBox="0 0 40 40"]');

describe('CoachBottomNav 홈 tab icon', () => {
  it('renders the CoachX mark with its emerald accent stroke', () => {
    render(<CoachBottomNav activeTab="LESSON" onTabChange={() => {}} />);

    const chatTab = screen.getByRole('button', { name: '홈' });
    const mark = markOf(chatTab);
    expect(mark).not.toBeNull();

    const strokes = Array.from(mark!.querySelectorAll('line')).map(l => l.getAttribute('stroke'));
    expect(strokes).toContain('#10B981');
    // ink stroke follows the tab's text color instead of a hard-coded value
    expect(strokes).toContain('currentColor');
  });

  it('keeps the mark decorative so the button name is just the label', () => {
    render(<CoachBottomNav activeTab="CLIENTS" onTabChange={() => {}} />);

    const chatTab = screen.getByRole('button', { name: '홈' });
    expect(markOf(chatTab)!.getAttribute('aria-hidden')).toBe('true');
  });
});
