/**
 * Tests for sending a file through the student AI chat:
 * 1. The attach sheet offers camera + library and the composer exposes it.
 * 2. A picked file uploads, then asks the student where to file it.
 * 3. "Save to my records" writes a practice lesson whose id matches the
 *    uploaded object key, and feeds the file to the AI turn.
 * 4. "Just analyse it" keeps no record.
 * 5. An oversized pick is rejected before any upload starts.
 * 6. A failed upload stays retryable and never reaches the transcript.
 * 7. Attachments survive a save/load round-trip through chatHistoryService.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StudentAIChat } from '../components/StudentAIChat';
import { loadChatHistory, saveChatHistory } from '../services/chatHistoryService';
import { generateStudentChatResponse } from '../services/geminiService';
import { apiService } from '../services/apiService';
import type { ClientProfile, Lesson } from '../types';
import type { CoachXChatMessage } from '../services/coachXService';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/geminiService', () => ({
  generateStudentChatResponse: vi.fn().mockResolvedValue('영상 잘 봤어요.'),
}));

vi.mock('../services/apiService', () => ({
  apiService: {
    uploadChatAttachment: vi.fn().mockResolvedValue('https://api.test/api/files/lessons/x/main.mp4'),
    isAvailable: vi.fn().mockReturnValue(false),
    getToken: vi.fn().mockReturnValue(null),
  },
  resolveMediaUrl: (url: string) => url,
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

/** jsdom has no createObjectURL; the preview only needs a stable string. */
beforeEach(() => {
  localStorage.clear();
  URL.createObjectURL = vi.fn(() => 'blob:preview') as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  vi.mocked(generateStudentChatResponse).mockClear().mockResolvedValue('영상 잘 봤어요.');
  vi.mocked(apiService.uploadChatAttachment).mockClear()
    .mockResolvedValue('https://api.test/api/files/lessons/x/main.mp4');
});

afterEach(() => {
  localStorage.clear();
});

function makeFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type });
  // File size is derived from the blob parts, so override it directly rather
  // than allocating a real 600MB buffer for the cap test.
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

/** A student with a designated coach — the only state where an upload
 *  actually reaches somebody (the server stamps coach_id from clients). */
const coachProfile = {
  id: 'c0ffee00-0000-4000-8000-000000000001',
  name: '박코치',
  email: 'coach@test',
} as unknown as Parameters<typeof StudentAIChat>[0]['coachProfile'];

const renderChat = (
  onSaveLesson?: (lesson: Lesson) => void | Promise<void>,
  opts: { withCoach?: boolean } = {}
) =>
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
      onSaveLesson={onSaveLesson}
      coachProfile={opts.withCoach === false ? undefined : coachProfile}
    />
  );

/** Open the sheet and pick a file from the library input. */
async function pickFile(file: File) {
  fireEvent.click(screen.getByRole('button', { name: '파일 첨부' }));
  const input = document.querySelector(
    'input[type="file"]:not([capture])'
  ) as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('StudentAIChat file attachment', () => {
  it('offers camera and library from the composer attach button', () => {
    renderChat();
    fireEvent.click(screen.getByRole('button', { name: '파일 첨부' }));

    expect(screen.getByText('카메라로 촬영')).toBeTruthy();
    expect(screen.getByText('앨범에서 선택')).toBeTruthy();
  });

  it('uploads a picked file and then asks where to file it', async () => {
    renderChat(vi.fn());
    await pickFile(makeFile('swing.mp4', 'video/mp4', 2 * 1024 * 1024));

    await waitFor(() => expect(apiService.uploadChatAttachment).toHaveBeenCalledTimes(1));
    await screen.findByText('저장 위치 선택');
    expect(screen.getByText('기록으로 저장')).toBeTruthy();
    expect(screen.getByText('저장 없이 AI 분석만')).toBeTruthy();
  });

  it('saves a practice record whose id matches the uploaded key, and shows the AI the file', async () => {
    const onSaveLesson = vi.fn();
    renderChat(onSaveLesson);
    const file = makeFile('swing.mp4', 'video/mp4', 2 * 1024 * 1024);
    await pickFile(file);

    await screen.findByText('저장 위치 선택');
    fireEvent.click(screen.getByText('기록으로 저장'));

    await waitFor(() => expect(onSaveLesson).toHaveBeenCalledTimes(1));
    const lesson = onSaveLesson.mock.calls[0][0] as Lesson;
    expect(lesson.recordType).toBe('PRACTICE');
    expect(lesson.createdBy).toBe('CLIENT');
    expect(lesson.mediaType).toBe('video');
    // The upload key and the lesson row must address the same object.
    const uploadedId = vi.mocked(apiService.uploadChatAttachment).mock.calls[0][1];
    expect(lesson.id).toBe(uploadedId);
    expect(lesson.videoKey).toBe(`lessons/${uploadedId}/main.mp4`);

    await waitFor(() => expect(generateStudentChatResponse).toHaveBeenCalledTimes(1));
    const media = vi.mocked(generateStudentChatResponse).mock.calls[0][8];
    expect(media).toEqual([{ blob: file, mimeType: 'video/mp4' }]);
  });

  it('keeps no record when the student only wants analysis', async () => {
    const onSaveLesson = vi.fn();
    renderChat(onSaveLesson);
    await pickFile(makeFile('swing.mp4', 'video/mp4', 1024));

    await screen.findByText('저장 위치 선택');
    fireEvent.click(screen.getByText('저장 없이 AI 분석만'));

    await waitFor(() => expect(generateStudentChatResponse).toHaveBeenCalled());
    expect(onSaveLesson).not.toHaveBeenCalled();
  });

  it('rejects an oversized file before starting an upload', async () => {
    renderChat(vi.fn());
    await pickFile(makeFile('round.mp4', 'video/mp4', 600 * 1024 * 1024));

    expect(await screen.findByText(/최대 500\.0MB까지 보낼 수 있어요/)).toBeTruthy();
    expect(apiService.uploadChatAttachment).not.toHaveBeenCalled();
  });

  it('offers a retry on a failed upload and writes nothing to the transcript', async () => {
    vi.mocked(apiService.uploadChatAttachment).mockRejectedValueOnce(new Error('network'));
    renderChat(vi.fn());
    await pickFile(makeFile('swing.mp4', 'video/mp4', 1024));

    expect(await screen.findByRole('button', { name: '재시도' })).toBeTruthy();
    expect(screen.queryByText('저장 위치 선택')).toBeNull();
    expect(loadChatHistory('홍길동_010-1111-2222')).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: '재시도' }));
    await screen.findByText('저장 위치 선택');
    expect(apiService.uploadChatAttachment).toHaveBeenCalledTimes(2);
  });
});

describe('StudentAIChat with no designated coach', () => {
  it('does not promise coach delivery, and hides the booking route', async () => {
    renderChat(vi.fn(), { withCoach: false });
    await pickFile(makeFile('swing.mp4', 'video/mp4', 1024));
    await screen.findByText('저장 위치 선택');

    // The record still saves — it just reaches nobody yet, and says so.
    expect(screen.getByText('기록 탭에 저장돼요 (공유하려면 지정 코치가 필요해요)')).toBeTruthy();
    expect(screen.queryByText('기록 탭에 저장되고, 코치님께 전달돼요')).toBeNull();
    // Booking would dead-end without a coach to book with.
    expect(screen.queryByText('저장하고 레슨 예약')).toBeNull();
  });

  it('tells the AI the record was saved but not shared', async () => {
    renderChat(vi.fn(), { withCoach: false });
    await pickFile(makeFile('swing.mp4', 'video/mp4', 1024));
    await screen.findByText('저장 위치 선택');
    fireEvent.click(screen.getByText('기록으로 저장'));

    await waitFor(() => expect(generateStudentChatResponse).toHaveBeenCalled());
    const prompt = vi.mocked(generateStudentChatResponse).mock.calls[0][0];
    expect(prompt).toContain('지정 코치가 없어서');
    expect(prompt).not.toContain('코치님께 공유했어요');
  });

  it('still promises delivery when a coach is linked', async () => {
    renderChat(vi.fn());
    await pickFile(makeFile('swing.mp4', 'video/mp4', 1024));
    await screen.findByText('저장 위치 선택');
    fireEvent.click(screen.getByText('기록으로 저장'));

    await waitFor(() => expect(generateStudentChatResponse).toHaveBeenCalled());
    expect(vi.mocked(generateStudentChatResponse).mock.calls[0][0])
      .toContain('코치님께 공유했어요');
  });
});

describe('chatHistoryService attachments', () => {
  it('round-trips attachments without bumping the stored schema version', () => {
    const withFile: CoachXChatMessage = {
      role: 'user',
      content: '',
      timestamp: 1700000000000,
      attachments: [{
        id: 'a1',
        url: '/api/files/lessons/a1/main.mp4',
        type: 'video',
        name: 'swing.mp4',
        size: 1024,
        mimeType: 'video/mp4',
        destination: 'practice',
      }],
    };
    saveChatHistory('c1', [withFile]);

    // An empty body is still a real turn when a file rides with it.
    const restored = loadChatHistory('c1');
    expect(restored).toHaveLength(1);
    expect(restored[0].attachments?.[0].url).toBe('/api/files/lessons/a1/main.mp4');

    // Transcripts written before uploads shipped must still load.
    const raw = JSON.parse(localStorage.getItem('coachx_student_chat_v1_c1')!);
    expect(raw.v).toBe(1);
  });

  it('drops attachment entries that lost their identity', () => {
    saveChatHistory('c2', [{
      role: 'user',
      content: '봐주세요',
      timestamp: 1,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      attachments: [{ url: '', type: 'video' } as any],
    }]);

    const restored = loadChatHistory('c2');
    expect(restored).toHaveLength(1);
    expect(restored[0].attachments).toBeUndefined();
  });
});
