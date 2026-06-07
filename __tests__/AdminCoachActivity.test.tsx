import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AdminCoachActivity } from '../components/AdminCoachActivity';
import { ClientProfile, CoachProfile, Lesson } from '../types';

vi.mock('../components/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
  }),
}));

describe('AdminCoachActivity', () => {
  it('counts client-created lessons in coach activity metrics', () => {
    const coach: CoachProfile = {
      id: 'coach-1',
      name: '코치A',
      email: 'coach-a@example.com',
    };

    const clients: ClientProfile[] = [
      {
        name: '회원A',
        phone: '010-0000-0000',
        coachId: coach.id,
      },
    ];

    const now = Date.now();
    const lessons: Lesson[] = [
      {
        id: 'lesson-coach',
        clientName: '회원A',
        clientPhone: '010-0000-0000',
        coachId: coach.id,
        createdBy: 'COACH',
        recordType: 'LESSON',
        date: '2026-06-01',
        title: '코치 작성 레슨',
        videoUrl: '',
        mediaType: 'video',
        coachNotes: '',
        tags: [],
        createdAt: now - 1_000,
      },
      {
        id: 'lesson-client',
        clientName: '회원A',
        clientPhone: '010-0000-0000',
        coachId: coach.id,
        createdBy: 'CLIENT',
        recordType: 'PRACTICE',
        date: '2026-06-02',
        title: '회원 작성 기록',
        videoUrl: '',
        mediaType: 'video',
        coachNotes: '',
        tags: [],
        createdAt: now - 2_000,
      },
    ];

    render(<AdminCoachActivity coaches={[coach]} lessons={lessons} clients={clients} />);

    const rowButton = screen.getByRole('button', { name: /코치A/ });
    expect(rowButton).toHaveTextContent('admin_coach_activity_lessons_30d');
    expect(rowButton).toHaveTextContent('2');

    fireEvent.click(rowButton);

    const totalLessonsLabel = screen.getByText('admin_coach_activity_total_lessons');
    const lessons7dLabel = screen.getByText('admin_coach_activity_lessons_7d');

    expect(totalLessonsLabel.closest('div')).toHaveTextContent('2');
    expect(lessons7dLabel.closest('div')).toHaveTextContent('2');
  });
});
