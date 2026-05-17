import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { NewLessonForm } from '../components/NewLessonForm';
import { LanguageProvider } from '../components/LanguageContext';
import { ClientProfile } from '../types';

vi.mock('../services/geminiService', () => ({
  analyzeSwingVideo: vi.fn(),
  analyzeBodyPhotos: vi.fn(),
  extractGolfData: vi.fn(),
  summarizeHoleVoice: vi.fn(),
}));

describe('NewLessonForm – body analysis only save', () => {
  const client: ClientProfile = {
    id: 'client1',
    name: '홍길동',
    phone: '010-9999-0000',
    coachId: 'coach1',
    email: 'client@test.com',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn((file: File) => `blob:${file.name}`),
        revokeObjectURL: vi.fn(),
      })
    );
  });

  it('does not show member body analysis in lesson record flow', async () => {
    render(
      <LanguageProvider>
        <NewLessonForm
          existingClients={[client]}
          lessons={[]}
          userRole="CLIENT"
          currentUser={client}
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      </LanguageProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /레슨 기록/i }));

    expect(screen.queryByText('회원 신체 분석')).not.toBeInTheDocument();
    expect(screen.getByText('레슨 요약 리포트')).toBeInTheDocument();
  });

  it('saves when only memo is provided without media', async () => {
    const onSave = vi.fn();

    render(
      <LanguageProvider>
        <NewLessonForm
          existingClients={[client]}
          lessons={[]}
          userRole="CLIENT"
          currentUser={client}
          onSave={onSave}
          onCancel={vi.fn()}
        />
      </LanguageProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /레슨 기록/i }));
    fireEvent.change(screen.getByPlaceholderText('연습 내용이나 느낀 점을 기록하세요.'), {
      target: { value: '  오늘 레슨 복기 메모  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /기록 저장하기/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const savedLesson = onSave.mock.calls[0][0];
    expect(savedLesson.coachNotes).toBe('  오늘 레슨 복기 메모  ');
    expect(savedLesson.videoUrl).toBe('');
  });

  it('blocks save when both media and memo are empty', async () => {
    const onSave = vi.fn();

    render(
      <LanguageProvider>
        <NewLessonForm
          existingClients={[client]}
          lessons={[]}
          userRole="CLIENT"
          currentUser={client}
          onSave={onSave}
          onCancel={vi.fn()}
        />
      </LanguageProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /레슨 기록/i }));
    fireEvent.click(screen.getByRole('button', { name: /기록 저장하기/i }));

    await waitFor(() => expect(onSave).not.toHaveBeenCalled());
    expect(
      screen.getByText('미디어를 첨부하거나 메모를 입력해주세요.')
    ).toBeInTheDocument();
  });

  it('blocks save when memo has only whitespace and no media', async () => {
    const onSave = vi.fn();

    render(
      <LanguageProvider>
        <NewLessonForm
          existingClients={[client]}
          lessons={[]}
          userRole="CLIENT"
          currentUser={client}
          onSave={onSave}
          onCancel={vi.fn()}
        />
      </LanguageProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /레슨 기록/i }));
    fireEvent.change(screen.getByPlaceholderText('연습 내용이나 느낀 점을 기록하세요.'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /기록 저장하기/i }));

    await waitFor(() => expect(onSave).not.toHaveBeenCalled());
    expect(
      screen.getByText('미디어를 첨부하거나 메모를 입력해주세요.')
    ).toBeInTheDocument();
  });
});
