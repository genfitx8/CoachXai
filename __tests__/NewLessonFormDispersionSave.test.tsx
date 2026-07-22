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

describe('NewLessonForm – dispersion session persistence', () => {
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
      textAnalysis: '52도 웨지 100m 근접샷 세션 분석 결과',
      golfData: {
        carryDistance: 96.7,
        totalDistance: 91.5,
        ballSpeed: 88.5,
        clubHeadSpeed: 82.4,
        smashFactor: 1.07,
        spinRate: 10424,
        attackAngle: -4.9,
      },
      dispersionSession: {
        club: '52°',
        targetDistanceM: 100,
        shotCount: 8,
        hitCount: 3,
        avgPinDistanceM: 9.2,
        shots: [
          { shotNo: 4, pinDistanceM: 8.2, hitTarget: true },
          { shotNo: 5, pinDistanceM: 10.4, hitTarget: true },
          { shotNo: 6, pinDistanceM: 5.8, hitTarget: true },
          { shotNo: 7, pinDistanceM: 8.5, hitTarget: true },
        ],
        source: 'TRACKMAN',
      },
    });
    vi.mocked(analyzeSwingVideo).mockResolvedValue('영상 분석 결과');
  });

  it('persists dispersionSession returned from extractGolfData into the saved lesson', async () => {
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

    const imageFile = new File(['image'], 'trackman.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [imageFile] } });

    await waitFor(() => {
      expect(screen.getByText('AI 샷 데이터 분석')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('AI 샷 데이터 분석'));

    const clubSelect = screen.getByRole('combobox');
    fireEvent.change(clubSelect, { target: { value: 'SW' } });

    fireEvent.click(screen.getByRole('button', { name: /기록 저장하기/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    const savedLesson = onSave.mock.calls[0][0];

    expect(savedLesson.dispersionSession).toBeDefined();
    expect(savedLesson.dispersionSession.club).toBe('52°');
    expect(savedLesson.dispersionSession.targetDistanceM).toBe(100);
    expect(savedLesson.dispersionSession.shotCount).toBe(8);
    expect(savedLesson.dispersionSession.hitCount).toBe(3);
    expect(savedLesson.dispersionSession.avgPinDistanceM).toBe(9.2);
    expect(savedLesson.dispersionSession.shots).toHaveLength(4);
    expect(savedLesson.dispersionSession.shots[0]).toEqual({
      shotNo: 4,
      pinDistanceM: 8.2,
      hitTarget: true,
    });
    expect(savedLesson.dispersionSession.source).toBe('TRACKMAN');
  });
});
