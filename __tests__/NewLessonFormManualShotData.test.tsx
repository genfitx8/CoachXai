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

    // Open the manual shot data entry panel
    const toggleButton = await screen.findByRole('button', {
      name: /샷 데이터 직접 입력/i,
    });
    fireEvent.click(toggleButton);

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
});
