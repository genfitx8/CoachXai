/**
 * Tests that video editing in the lesson-record media upload is opt-in.
 *
 * Regression: uploading a swing video pushed the coach straight into the
 * full-screen 영상 편집 modal, even when no edit was wanted. The editor must
 * now only open from the explicit "영상 편집" button on the preview.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { NewLessonForm } from '../components/NewLessonForm';
import { LanguageProvider } from '../components/LanguageContext';
import { ClientProfile } from '../types';

vi.mock('../services/geminiService', () => ({
  analyzeSwingVideo: vi.fn(),
  extractGolfData: vi.fn(),
  summarizeHoleVoice: vi.fn(),
}));

// The editor pulls in ffmpeg/fabric; a stub keeps this test about the trigger.
vi.mock('../components/VideoEditor', () => ({
  VideoEditor: ({ onCancel }: { onCancel: () => void }) => (
    <div data-testid="video-editor">
      <button onClick={onCancel}>편집 닫기</button>
    </div>
  ),
}));

const client: ClientProfile = {
  id: 'client1',
  name: '홍길동',
  phone: '010-9999-0000',
  coachId: 'coach1',
  email: 'client@test.com',
};

const renderForm = () =>
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

const uploadVideo = () => {
  fireEvent.click(screen.getByRole('button', { name: /레슨 기록/i }));
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  const videoFile = new File(['video'], 'swing.mp4', { type: 'video/mp4' });
  fireEvent.change(fileInput, { target: { files: [videoFile] } });
};

describe('NewLessonForm – opt-in video editing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn((file: File) => `blob:${file.name}`),
        revokeObjectURL: vi.fn(),
      })
    );
  });

  it('does not open the editor automatically after a swing video upload', async () => {
    renderForm();
    uploadVideo();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /영상 편집/ })).toBeTruthy();
    });
    expect(screen.queryByTestId('video-editor')).toBeNull();
  });

  it('opens the editor only when the coach taps 영상 편집', async () => {
    renderForm();
    uploadVideo();

    const editButton = await screen.findByRole('button', { name: /영상 편집/ });
    fireEvent.click(editButton);

    expect(screen.getByTestId('video-editor')).toBeTruthy();

    fireEvent.click(screen.getByText('편집 닫기'));
    expect(screen.queryByTestId('video-editor')).toBeNull();
  });
});
