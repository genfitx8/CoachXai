import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { NewLessonForm } from '../components/NewLessonForm';
import { LanguageProvider } from '../components/LanguageContext';
import { ClientProfile } from '../types';
import { analyzeSwingVideo, extractGolfData } from '../services/geminiService';

vi.mock('../services/geminiService', () => ({
  analyzeSwingVideo: vi.fn(),
  extractGolfData: vi.fn(),
  summarizeHoleVoice: vi.fn(),
}));

describe('NewLessonForm – shot data save with mixed lesson inputs', () => {
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

    vi.mocked(extractGolfData).mockResolvedValue({
      textAnalysis: '샷 데이터 분석 결과',
      golfData: {
        carryDistance: 180,
        totalDistance: 195,
        ballSpeed: 62,
        clubHeadSpeed: 43,
        smashFactor: 1.44,
        launchAngle: 15,
      },
      score: null,
    });
    vi.mocked(analyzeSwingVideo).mockResolvedValue('영상 분석 결과');
  });

  it('saves extracted shot data even when the first media is not the shot image', async () => {
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

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    const videoFile = new File(['video'], 'lesson.mp4', { type: 'video/mp4' });
    const imageFile = new File(['image'], 'shot.png', { type: 'image/png' });

    fireEvent.change(fileInput, { target: { files: [videoFile, imageFile] } });

    await waitFor(() => {
      expect(screen.getByText('AI 샷 데이터 분석')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('AI 샷 데이터 분석'));

    const clubSelect = screen.getByRole('combobox');
    fireEvent.change(clubSelect, { target: { value: 'Driver' } });

    fireEvent.click(screen.getByRole('button', { name: /기록 저장하기/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    const savedLesson = onSave.mock.calls[0][0];
    expect(savedLesson.golfData).toEqual({
      carryDistance: 180,
      totalDistance: 195,
      ballSpeed: 62,
      clubHeadSpeed: 43,
      smashFactor: 1.44,
      launchAngle: 15,
    });

    expect(extractGolfData).toHaveBeenCalledTimes(1);
    expect(extractGolfData).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'image/png' }),
      '홍길동'
    );
  });
});
