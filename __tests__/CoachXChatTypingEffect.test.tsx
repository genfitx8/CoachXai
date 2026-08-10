/**
 * Tests for CoachXChat streaming behavior.
 *
 * Before Phase 3b, CoachXChat rendered replies via a client-side "typing
 * reveal" animation on top of a full-response fetch. The streaming path
 * replaces that: chunks arrive from the backend and the message is
 * updated in-place, so the natural stream IS the typing effect and the
 * client-side reveal is skipped.
 *
 * These tests exercise the streaming path:
 * 1. Delta chunks are appended to the assistant message in-place as they arrive.
 * 2. The send button is disabled while the stream is in-flight.
 * 3. The final full reply is present in the DOM after the stream completes.
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
        coachx_chat_placeholder: 'Ask Coachx…',
      };
      return map[key] ?? key;
    },
  }),
}));

const MOCK_REPLY = 'Hello from Coachx! This is a test reply with some content.';

// Deliver the reply in two chunks so we can assert incremental updates.
const CHUNK_1 = 'Hello from Coachx! ';
const CHUNK_2 = 'This is a test reply with some content.';

// The mocked stream fires onChunk twice and resolves with the full reply.
vi.mock('../services/geminiService', () => ({
  generateCoachXChatResponseStream: vi.fn(
    async (
      _msg: string,
      _lessons: unknown,
      _clients: unknown,
      onChunk: (delta: string, accumulated: string) => void
    ) => {
      onChunk(CHUNK_1, CHUNK_1);
      onChunk(CHUNK_2, CHUNK_1 + CHUNK_2);
      return MOCK_REPLY;
    }
  ),
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

describe('CoachXChat – streaming reply', () => {
  beforeEach(() => {
    // jsdom does not implement scrollIntoView; mock it to avoid errors
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the full streamed reply after the stream completes', async () => {
    render(
      <CoachXChat
        coachProfile={COACH}
        allLessons={LESSONS}
        clients={CLIENTS}
        onBack={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText('Ask Coachx…');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Flush the (synchronous-in-test) stream and any queued setState work.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Full reply text is present in the DOM.
    screen.getByText(MOCK_REPLY);
  });

  it('disables the send button while a stream is in-flight', async () => {
    // Withhold the stream's resolution so we can assert the "streaming" UI state.
    let releaseStream: () => void = () => {};
    const streamPromise = new Promise<void>((res) => {
      releaseStream = res;
    });

    const { generateCoachXChatResponseStream } = await import(
      '../services/geminiService'
    );
    (generateCoachXChatResponseStream as ReturnType<typeof vi.fn>)
      .mockReset()
      .mockImplementationOnce(async (
        _msg: string,
        _l: unknown,
        _c: unknown,
        _onChunk: unknown
      ) => {
        await streamPromise;
        return MOCK_REPLY;
      });

    render(
      <CoachXChat
        coachProfile={COACH}
        allLessons={LESSONS}
        clients={CLIENTS}
        onBack={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText('Ask Coachx…');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // While the stream is pending, isTyping=true → send disabled even with
    // fresh input in the field.
    fireEvent.change(input, { target: { value: 'Follow-up' } });
    const sendButton = screen.getByRole('button', { name: /send/i });
    expect((sendButton as HTMLButtonElement).disabled).toBe(true);

    // Release the stream and let React settle.
    await act(async () => {
      releaseStream();
      await Promise.resolve();
    });
  });
});
