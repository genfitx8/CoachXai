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

describe('NewLessonForm – manual shot data entry', () => {
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
    vi.mocked(analyzeSwingVideo).mockResolvedValue('영상 분석 결과');
  });

  it('persists manually entered shot data on the saved lesson', async () => {
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

    // Enter PRACTICE record flow
    fireEvent.click(screen.getByRole('button', { name: /연습 기록/i }));

    // Open the shot data media-upload tab
    const shotDataTab = await screen.findByRole('button', {
      name: '샷 데이터',
    });
    fireEvent.click(shotDataTab);

    // Fill in a few fields (order matches the field grid in the form)
    const carryInput = screen.getByPlaceholderText('예: 180');
    const totalInput = screen.getByPlaceholderText('예: 195');
    const ballSpeedInput = screen.getByPlaceholderText('예: 62');
    const smashFactorInput = screen.getByPlaceholderText('예: 1.44');

    fireEvent.change(carryInput, { target: { value: '182' } });
    fireEvent.change(totalInput, { target: { value: '198' } });
    fireEvent.change(ballSpeedInput, { target: { value: '63' } });
    fireEvent.change(smashFactorInput, { target: { value: '1.45' } });

    // Save the record
    fireEvent.click(screen.getByRole('button', { name: /기록 저장하기/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    const savedLesson = onSave.mock.calls[0][0];
    expect(savedLesson.golfData).toEqual({
      carryDistance: 182,
      totalDistance: 198,
      ballSpeed: 63,
      smashFactor: 1.45,
    });
    expect(savedLesson.tags).toContain('샷데이터');
    expect(extractGolfData).not.toHaveBeenCalled();
  });

  it('auto-fills shot data from an uploaded photo and saves the image with the lesson', async () => {
    const onSave = vi.fn();

    vi.mocked(extractGolfData).mockResolvedValue({
      textAnalysis: '샷 데이터 분석 결과',
      golfData: {
        carryDistance: 210,
        totalDistance: 225,
        ballSpeed: 68,
        clubHeadSpeed: 46,
        smashFactor: 1.48,
      },
      score: null,
    });

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

    fireEvent.click(screen.getByRole('button', { name: /연습 기록/i }));

    fireEvent.click(await screen.findByRole('button', { name: '샷 데이터' }));

    // Upload a shot-data photo
    const photoFile = new File(['shot'], 'launch-monitor.png', {
      type: 'image/png',
    });
    const photoInput = screen.getByTestId(
      'shot-data-photo-input'
    ) as HTMLInputElement;
    fireEvent.change(photoInput, { target: { files: [photoFile] } });

    // Auto-fill from the uploaded photo
    fireEvent.click(
      await screen.findByRole('button', { name: /AI로 자동 채우기/i })
    );

    await waitFor(() => {
      expect(extractGolfData).toHaveBeenCalledTimes(1);
    });
    expect(extractGolfData).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'image/png' }),
      '홍길동'
    );

    // Verify fields were populated from AI
    await waitFor(() => {
      expect(
        (screen.getByPlaceholderText('예: 180') as HTMLInputElement).value
      ).toBe('210');
    });

    // Save the record
    fireEvent.click(screen.getByRole('button', { name: /기록 저장하기/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    const savedLesson = onSave.mock.calls[0][0];
    expect(savedLesson.golfData).toEqual(
      expect.objectContaining({
        carryDistance: 210,
        totalDistance: 225,
        ballSpeed: 68,
        clubHeadSpeed: 46,
        smashFactor: 1.48,
      })
    );
    // The photo should have been attached to the lesson as image media.
    const allMedia = [
      ...(savedLesson.mediaType === 'image' ? [{ url: savedLesson.videoUrl }] : []),
      ...(savedLesson.additionalMedia || []),
    ];
    expect(allMedia.length).toBeGreaterThan(0);
  });
});
