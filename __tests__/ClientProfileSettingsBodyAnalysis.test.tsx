import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ClientProfileSettings } from '../components/ClientProfileSettings';
import { LanguageProvider } from '../components/LanguageContext';
import { ClientProfile, Lesson } from '../types';
import { analyzeBodyPhotos } from '../services/geminiService';

vi.mock('../services/geminiService', () => ({
  analyzeBodyPhotos: vi.fn(),
}));

describe('ClientProfileSettings – body analysis in My Info', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses refreshed dark background treatment for My Info screen shell', () => {
    const profile: ClientProfile = {
      name: '배경테스트',
      phone: '010-0000-0000',
    };

    const { container } = render(
      <LanguageProvider>
        <ClientProfileSettings
          profile={profile}
          allLessons={[]}
          onSave={vi.fn()}
          onBack={vi.fn()}
          onSearchCoach={vi.fn().mockResolvedValue([])}
        />
      </LanguageProvider>
    );

    const root = container.firstElementChild as HTMLDivElement;
    expect(root.className).toContain('rounded-2xl');
    expect(root.className).toContain('border-slate-700/70');
    expect(root.className).toContain('bg-gradient-to-b');
    expect(root.className).toContain('from-slate-900/80');
    expect(root.className).toContain('to-slate-950/80');
  });

  it('prefills body analysis from existing lessons and saves it to client profile', async () => {
    const profile: ClientProfile = {
      name: '홍길동',
      phone: '010-1111-2222',
      coachId: 'coach1',
    };

    const lessonWithBodyAnalysis: Lesson = {
      id: 'lesson-1',
      clientName: '홍길동',
      clientPhone: '010-1111-2222',
      createdBy: 'COACH',
      recordType: 'LESSON',
      date: '2026-04-15',
      title: '레슨',
      videoUrl: 'blob:test',
      mediaType: 'video',
      coachNotes: '',
      tags: [],
      createdAt: Date.now(),
      memberBodyAnalysis: {
        bodyType: '사각체형',
        swingType: '아크형',
        structuralInput: { frontAxisTiltDeg: 1.2 },
        structuralFactors: [{ name: '정면 축 기울기(좌우 기울기)', value: 'R/1.20°', impact: '하' }],
      },
    };

    const onSave = vi.fn();

    render(
      <LanguageProvider>
        <ClientProfileSettings
          profile={profile}
          allLessons={[lessonWithBodyAnalysis]}
          onSave={onSave}
          onBack={vi.fn()}
          onSearchCoach={vi.fn().mockResolvedValue([])}
        />
      </LanguageProvider>
    );

    expect(await screen.findByText('회원 신체 분석')).toBeInTheDocument();
    expect(screen.getByDisplayValue('사각체형')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].memberBodyAnalysis).toBeDefined();
    expect(onSave.mock.calls[0][0].memberBodyAnalysis.bodyType).toBe('사각체형');
    expect(onSave.mock.calls[0][0].memberBodyAnalysis.structuralInput.frontAxisTiltDeg).toBe(1.2);
  });

  it('auto fills body analysis from front/side photos', async () => {
    const profile: ClientProfile = {
      name: '김회원',
      phone: '010-2222-3333',
      coachId: 'coach1',
    };

    vi.mocked(analyzeBodyPhotos).mockResolvedValue({
      bodyType: '역삼각체형',
      structuralInput: {
        frontAxisTiltDeg: 1.1,
        shoulderTiltDeg: 2.2,
      },
      coachComment: '자동 분석 코멘트',
    });

    render(
      <LanguageProvider>
        <ClientProfileSettings
          profile={profile}
          allLessons={[]}
          onSave={vi.fn()}
          onBack={vi.fn()}
          onSearchCoach={vi.fn().mockResolvedValue([])}
        />
      </LanguageProvider>
    );

    fireEvent.click(await screen.findByText('회원 신체 분석'));

    const frontFile = new File(['front'], 'front.jpg', { type: 'image/jpeg' });
    const sideFile = new File(['side'], 'side.jpg', { type: 'image/jpeg' });

    fireEvent.change(screen.getByLabelText('정면 전신'), {
      target: { files: [frontFile] },
    });
    fireEvent.change(screen.getByLabelText('측면 전신'), {
      target: { files: [sideFile] },
    });

    fireEvent.click(screen.getByRole('button', { name: '사진으로 자동 분석' }));

    await waitFor(() => {
      expect(analyzeBodyPhotos).toHaveBeenCalledTimes(1);
      expect(screen.getByDisplayValue('역삼각체형')).toBeInTheDocument();
      expect(screen.getByDisplayValue('자동 분석 코멘트')).toBeInTheDocument();
    });
  });
});
