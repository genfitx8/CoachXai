import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ClientProfileSettings } from '../components/ClientProfileSettings';
import { LanguageProvider } from '../components/LanguageContext';
import { ClientProfile, Lesson } from '../types';

describe('ClientProfileSettings – body analysis in My Info', () => {
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
});
