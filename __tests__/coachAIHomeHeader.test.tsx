/**
 * The coach 대화 tab owns the only header on its surface — and that header is
 * now deliberately bare.
 *
 * History: CoachAIHome started as `fixed inset-0 z-50`, then ab54168 dropped
 * it to z-30, which put its header under the app shell's opaque z-40 bar and
 * made the wordmark, TTS toggle and 대시보드 button focusable but unclickable.
 * The shell stopped rendering its own bar on this view, so those controls
 * became reachable again — and then the cleanup pass removed them entirely:
 * the header carries the hamburger and nothing else, with 대시보드 and
 * 음성 읽기 relocated into the drawer, so the conversation is the screen.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CoachAIHome } from '../components/CoachAIHome';
import { CoachHamburgerMenu } from '../components/CoachHamburgerMenu';
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

  it('carries nothing else — no wordmark, no header actions', () => {
    renderHome(vi.fn());

    expect(screen.queryByText('CoachX AI')).toBeNull();
    expect(screen.queryByText(/코치 에이전트|coaching agent/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /대시보드|dashboard/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /음성 읽기|voice/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /스윙|swing/i })).toBeNull();
  });

  it('drops the pre-conversation guidance from the chat body', () => {
    renderHome(vi.fn());

    // Quick-prompt chips and the 오늘 schedule strip are gone; the input asks
    // for a message rather than explaining how to send one.
    expect(screen.queryByText('오늘 일정 알려줘')).toBeNull();
    expect(screen.queryByPlaceholderText(/말하거나 입력/)).toBeNull();
    expect(screen.getByPlaceholderText('CoachX에게 물어보기')).toBeInTheDocument();
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

  it('routes the relocated header actions through the drawer', () => {
    expect(appSource).toMatch(/case 'DASHBOARD':\s*\n\s*setCoachView\('COACHX_DASHBOARD'\);/);
    expect(appSource).toMatch(/<CoachHamburgerMenu[\s\S]{0,400}?onToggleTts=/);
  });
});

describe('coach drawer', () => {
  it('hosts 대시보드 and the 음성 읽기 toggle that left the chat header', () => {
    const onAction = vi.fn();
    const onToggleTts = vi.fn();
    render(
      <LanguageProvider>
        <CoachHamburgerMenu
          open
          onClose={vi.fn()}
          coachProfile={COACH}
          onAction={onAction}
          ttsEnabled
          onToggleTts={onToggleTts}
        />
      </LanguageProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: '대시보드' }));
    expect(onAction).toHaveBeenCalledWith('DASHBOARD');

    fireEvent.click(screen.getByRole('switch', { name: /음성 읽기/ }));
    expect(onToggleTts).toHaveBeenCalledTimes(1);
  });
});
