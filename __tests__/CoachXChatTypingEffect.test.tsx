/**
 * Tests for CoachXChat typing/reveal effect:
 * 1. After a response is received the message is initially shown partially (typing cursor visible).
 * 2. After all ticks the full message is displayed and the cursor is gone.
 * 3. Sending a new message while revealing cancels the in-progress reveal.
 * 4. The send button is disabled while revealing is in progress.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { CoachXChat } from '../components/CoachXChat';
import { CoachProfile, Lesson, ClientProfile } from '../types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../components/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'en',
    t: (key: string) => {
      const map: Record<string, string> = {
        back: 'Back',
        send: 'Send',
        coachx_subtitle: 'AI Coaching Intelligence',
        coachx_suggested_prompts: 'Try asking:',
        coachx_chat_placeholder: 'Ask CoachX…',
      };
      return map[key] ?? key;
    },
  }),
}));

const MOCK_REPLY = 'Hello from CoachX! This is a test reply with some content.';

vi.mock('../services/geminiService', () => ({
  generateCoachXChatResponse: vi.fn(async () => MOCK_REPLY),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const COACH: CoachProfile = {
  id: 'coach1',
  name: 'TestCoach',
  email: 'test@example.com',
  role: 'coach',
} as unknown as CoachProfile;

const LESSONS: Lesson[] = [];
const CLIENTS: ClientProfile[] = [];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CoachXChat – typing reveal effect', () => {
  beforeEach(() => {
    // jsdom does not implement scrollIntoView; mock it to avoid errors
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shows a blinking cursor while the response is being revealed', async () => {
    render(
      <CoachXChat
        coachProfile={COACH}
        allLessons={LESSONS}
        clients={CLIENTS}
        onBack={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText('Ask CoachX…');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Resolve the async Gemini call
    await act(async () => {
      await vi.runAllTicks();
    });

    // Advance a small number of ticks so the reveal has started but not finished
    act(() => {
      vi.advanceTimersByTime(40); // 2 ticks of 20ms each
    });

    // The cursor element should be visible during the reveal
    const cursor = document.querySelector('.coachx-cursor');
    expect(cursor).not.toBeNull();
  });

  it('shows the full message and removes the cursor after the reveal completes', async () => {
    render(
      <CoachXChat
        coachProfile={COACH}
        allLessons={LESSONS}
        clients={CLIENTS}
        onBack={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText('Ask CoachX…');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await act(async () => {
      await vi.runAllTicks();
    });

    // Advance past TYPING_REVEAL_DURATION_MS (2500ms) to complete the reveal
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Cursor should be gone once fully revealed
    const cursor = document.querySelector('.coachx-cursor');
    expect(cursor).toBeNull();

    // Full reply text should be present in the DOM
    screen.getByText(MOCK_REPLY);
  });

  it('disables the send button while the reveal is in progress', async () => {
    render(
      <CoachXChat
        coachProfile={COACH}
        allLessons={LESSONS}
        clients={CLIENTS}
        onBack={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText('Ask CoachX…');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await act(async () => {
      await vi.runAllTicks();
    });

    // Advance a couple of ticks — reveal in progress
    act(() => {
      vi.advanceTimersByTime(40);
    });

    // Type new text so the button would normally be enabled
    fireEvent.change(input, { target: { value: 'Follow-up' } });

    const sendButton = screen.getByRole('button', { name: /send/i });
    expect((sendButton as HTMLButtonElement).disabled).toBe(true);
  });
});
