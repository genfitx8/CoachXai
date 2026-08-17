/**
 * Tests for the student AI chat transcript persistence:
 * 1. chatHistoryService round-trips a transcript and scopes it per client.
 * 2. chatHistoryService self-heals corrupt / poisoned localStorage entries.
 * 3. chatHistoryService keeps only the newest MAX_PERSISTED_MESSAGES entries.
 * 4. StudentAIChat persists the conversation as messages are exchanged.
 * 5. StudentAIChat restores the conversation on remount (app relaunch / tab
 *    switch) instead of resetting to the greeting.
 * 6. StudentAIChat resumes a reply that was cut short by the app going away.
 * 7. "New conversation" clears the stored transcript.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StudentAIChat } from '../components/StudentAIChat';
import {
  loadChatHistory,
  saveChatHistory,
  clearChatHistory,
  chatHistoryKey,
  MAX_PERSISTED_MESSAGES,
} from '../services/chatHistoryService';
import { generateStudentChatResponse } from '../services/geminiService';
import type { ClientProfile } from '../types';
import type { CoachXChatMessage } from '../services/coachXService';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/geminiService', () => ({
  generateStudentChatResponse: vi.fn().mockResolvedValue('AI 답변입니다.'),
}));

vi.mock('../services/reservationService', () => ({
  reservationService: {
    getAvailableSlots: vi.fn().mockResolvedValue([]),
    requestReservation: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../components/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'ko',
    setLanguage: vi.fn(),
  }),
}));

// The voice hooks touch Web Speech APIs jsdom doesn't provide.
vi.mock('../hooks/useTextToSpeech', () => ({
  useTextToSpeech: () => ({ isSpeaking: false, speak: vi.fn(), stopSpeaking: vi.fn() }),
}));

vi.mock('../hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: () => ({
    isListening: false,
    voiceError: null,
    permissionDenied: false,
    dismissPermissionDenied: vi.fn(),
    stopListening: vi.fn(),
    toggleListening: vi.fn(),
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const clientProfile: ClientProfile = {
  name: '홍길동',
  phone: '010-1111-2222',
  currentPoints: 0,
  subscriptionPlan: 'FREE',
};

const CLIENT_ID = '홍길동_010-1111-2222';

const msg = (role: 'user' | 'assistant', content: string): CoachXChatMessage => ({
  role,
  content,
  timestamp: 1700000000000,
});

const renderChat = () =>
  render(
    <StudentAIChat
      clientProfile={clientProfile}
      myLessons={[]}
      homeworkList={[]}
      onBack={vi.fn()}
      defaultMode="chat"
      hideModeSelector
      hideBackButton
      initialGreeting="안녕하세요, 코치X AI예요."
    />
  );

beforeEach(() => {
  localStorage.clear();
  vi.mocked(generateStudentChatResponse).mockClear();
  vi.mocked(generateStudentChatResponse).mockResolvedValue('AI 답변입니다.');
});

afterEach(() => {
  localStorage.clear();
});

// ─── chatHistoryService ──────────────────────────────────────────────────────

describe('chatHistoryService', () => {
  it('round-trips a transcript and scopes it per client', () => {
    const messages = [msg('assistant', '안녕하세요'), msg('user', '드라이버 팁 알려줘')];
    saveChatHistory(CLIENT_ID, messages);

    expect(loadChatHistory(CLIENT_ID)).toEqual(messages);
    expect(loadChatHistory('다른학생_010-0000-0000')).toEqual([]);
  });

  it('returns an empty history and self-heals corrupt entries', () => {
    const key = chatHistoryKey(CLIENT_ID);

    localStorage.setItem(key, 'undefined');
    expect(loadChatHistory(CLIENT_ID)).toEqual([]);
    expect(localStorage.getItem(key)).toBeNull();

    localStorage.setItem(key, '{not json');
    expect(loadChatHistory(CLIENT_ID)).toEqual([]);
    expect(localStorage.getItem(key)).toBeNull();

    localStorage.setItem(key, JSON.stringify({ v: 99, messages: [msg('user', 'hi')] }));
    expect(loadChatHistory(CLIENT_ID)).toEqual([]);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('drops malformed messages but keeps the valid ones', () => {
    localStorage.setItem(
      chatHistoryKey(CLIENT_ID),
      JSON.stringify({
        v: 1,
        updatedAt: Date.now(),
        messages: [msg('user', '질문'), { role: 'ghost', content: 'x' }, { role: 'user' }],
      })
    );

    expect(loadChatHistory(CLIENT_ID)).toEqual([msg('user', '질문')]);
  });

  it('keeps only the newest MAX_PERSISTED_MESSAGES entries', () => {
    const many = Array.from({ length: MAX_PERSISTED_MESSAGES + 20 }, (_, i) =>
      msg(i % 2 === 0 ? 'user' : 'assistant', `메시지 ${i}`)
    );
    saveChatHistory(CLIENT_ID, many);

    const restored = loadChatHistory(CLIENT_ID);
    expect(restored).toHaveLength(MAX_PERSISTED_MESSAGES);
    expect(restored[restored.length - 1].content).toBe(`메시지 ${many.length - 1}`);
  });

  it('clears a stored transcript', () => {
    saveChatHistory(CLIENT_ID, [msg('user', '질문')]);
    clearChatHistory(CLIENT_ID);
    expect(loadChatHistory(CLIENT_ID)).toEqual([]);
  });
});

// ─── StudentAIChat ───────────────────────────────────────────────────────────

describe('StudentAIChat transcript persistence', () => {
  it('persists the conversation as messages are exchanged', async () => {
    renderChat();

    fireEvent.change(screen.getByPlaceholderText('골프 질문을 입력하세요...'), {
      target: { value: '퍼팅 연습법 알려줘' },
    });
    fireEvent.click(screen.getByLabelText('Send'));

    await screen.findByText('AI 답변입니다.');

    const stored = loadChatHistory(CLIENT_ID);
    expect(stored.map(m => m.content)).toEqual([
      '안녕하세요, 코치X AI예요.',
      '퍼팅 연습법 알려줘',
      'AI 답변입니다.',
    ]);
  });

  it('restores the conversation on remount instead of resetting to the greeting', async () => {
    const { unmount } = renderChat();

    fireEvent.change(screen.getByPlaceholderText('골프 질문을 입력하세요...'), {
      target: { value: '퍼팅 연습법 알려줘' },
    });
    fireEvent.click(screen.getByLabelText('Send'));
    await screen.findByText('AI 답변입니다.');

    // Leaving the app / switching tabs tears the component down.
    unmount();
    vi.mocked(generateStudentChatResponse).mockClear();

    renderChat();

    expect(await screen.findByText('퍼팅 연습법 알려줘')).toBeInTheDocument();
    expect(screen.getByText('AI 답변입니다.')).toBeInTheDocument();
    // Nothing is re-sent to the AI just because the screen came back.
    expect(generateStudentChatResponse).not.toHaveBeenCalled();
  });

  it('resumes a reply that was cut short by the app going away', async () => {
    saveChatHistory(CLIENT_ID, [
      msg('assistant', '안녕하세요, 코치X AI예요.'),
      msg('user', '스윙 템포 어떻게 잡아?'),
    ]);

    renderChat();

    await waitFor(() => expect(generateStudentChatResponse).toHaveBeenCalledTimes(1));
    expect(vi.mocked(generateStudentChatResponse).mock.calls[0][0]).toBe('스윙 템포 어떻게 잡아?');
    expect(await screen.findByText('AI 답변입니다.')).toBeInTheDocument();
  });

  it('clears the stored transcript when starting a new conversation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderChat();

    fireEvent.change(screen.getByPlaceholderText('골프 질문을 입력하세요...'), {
      target: { value: '퍼팅 연습법 알려줘' },
    });
    fireEvent.click(screen.getByLabelText('Send'));
    await screen.findByText('AI 답변입니다.');

    fireEvent.click(screen.getByLabelText('새 대화 시작'));

    await waitFor(() => expect(screen.queryByText('퍼팅 연습법 알려줘')).not.toBeInTheDocument());
    expect(loadChatHistory(CLIENT_ID)).toEqual([]);

    confirmSpy.mockRestore();
  });
});
