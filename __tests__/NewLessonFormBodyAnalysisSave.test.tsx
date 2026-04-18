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

  it('allows save without lesson media when a body-analysis photo is uploaded', async () => {
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

    fireEvent.click(screen.getByText('회원 신체 분석'));

    const frontPhotoLabel = screen
      .getByText('정면 전신 사진 업로드')
      .closest('label') as HTMLLabelElement;
    const frontPhotoInput = frontPhotoLabel.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;

    const bodyImage = new File(['body'], 'front-body.png', {
      type: 'image/png',
    });
    fireEvent.change(frontPhotoInput, { target: { files: [bodyImage] } });

    fireEvent.click(screen.getByRole('button', { name: /기록 저장하기/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    const savedLesson = onSave.mock.calls[0][0];
    expect(savedLesson.videoUrl).toBe('');
    expect(savedLesson.memberBodyAnalysis).toBeDefined();
  });
});
