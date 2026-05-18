import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LessonUploadPage } from '../components/LessonUploadPage';
import { Student } from '../types';

const MOCK_STUDENTS: Student[] = [
  { id: 'student-1', name: '박민준', phone: '010-1234-5678', coachId: 'coach-1' },
  { id: 'student-2', name: '김서연', phone: '010-2345-6789', coachId: 'coach-1' },
  { id: 'student-3', name: '이도현', phone: '010-3456-7890', coachId: 'coach-1' },
  { id: 'student-4', name: '최수아', phone: '010-4567-8901', coachId: 'coach-1' },
];

describe('LessonUploadPage', () => {
  it('renders step header, student dropdown and both drop zones', () => {
    render(<LessonUploadPage students={MOCK_STUDENTS} onBack={vi.fn()} onNext={vi.fn()} />);

    expect(screen.getByTestId('lesson-upload-page')).toBeInTheDocument();
    expect(screen.getByText(/Upload Lesson Videos/i)).toBeInTheDocument();
    expect(screen.getByTestId('student-select')).toBeInTheDocument();
    expect(screen.getByTestId('drop-zone-before')).toBeInTheDocument();
    expect(screen.getByTestId('drop-zone-after')).toBeInTheDocument();
  });

  it('shows provided students in the dropdown', () => {
    render(<LessonUploadPage students={MOCK_STUDENTS} onBack={vi.fn()} onNext={vi.fn()} />);

    const select = screen.getByTestId('student-select') as HTMLSelectElement;
    // Should have the placeholder plus at least 4 mock students
    expect(select.options.length).toBeGreaterThanOrEqual(5);
  });

  it('Next button is disabled until student and both videos are selected', () => {
    render(<LessonUploadPage students={MOCK_STUDENTS} onBack={vi.fn()} onNext={vi.fn()} />);

    const nextBtn = screen.getByTestId('upload-next-btn');
    expect(nextBtn).toBeDisabled();
  });

  it('calls onBack when the back button is clicked', () => {
    const onBack = vi.fn();
    render(<LessonUploadPage students={MOCK_STUDENTS} onBack={onBack} onNext={vi.fn()} />);

    fireEvent.click(screen.getByTestId('upload-back-btn'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('enables Next button after student and both video files are selected', () => {
    render(<LessonUploadPage students={MOCK_STUDENTS} onBack={vi.fn()} onNext={vi.fn()} />);

    // Select a student
    fireEvent.change(screen.getByTestId('student-select'), {
      target: { value: 'student-1' },
    });

    // Simulate file selection for BEFORE
    const beforeInput = screen.getByTestId('file-input-before') as HTMLInputElement;
    const beforeFile = new File(['video'], 'before.mp4', { type: 'video/mp4' });
    Object.defineProperty(beforeInput, 'files', { value: [beforeFile] });
    fireEvent.change(beforeInput);

    // Simulate file selection for AFTER
    const afterInput = screen.getByTestId('file-input-after') as HTMLInputElement;
    const afterFile = new File(['video'], 'after.mp4', { type: 'video/mp4' });
    Object.defineProperty(afterInput, 'files', { value: [afterFile] });
    fireEvent.change(afterInput);

    expect(screen.getByTestId('upload-next-btn')).not.toBeDisabled();
  });

  it('calls onNext with a LessonUpload payload when Next is clicked', () => {
    const onNext = vi.fn();
    render(<LessonUploadPage students={MOCK_STUDENTS} onBack={vi.fn()} onNext={onNext} />);

    fireEvent.change(screen.getByTestId('student-select'), {
      target: { value: 'student-2' },
    });

    const beforeInput = screen.getByTestId('file-input-before') as HTMLInputElement;
    Object.defineProperty(beforeInput, 'files', {
      value: [new File(['v'], 'b.mp4', { type: 'video/mp4' })],
    });
    fireEvent.change(beforeInput);

    const afterInput = screen.getByTestId('file-input-after') as HTMLInputElement;
    Object.defineProperty(afterInput, 'files', {
      value: [new File(['v'], 'a.mp4', { type: 'video/mp4' })],
    });
    fireEvent.change(afterInput);

    fireEvent.click(screen.getByTestId('upload-next-btn'));

    expect(onNext).toHaveBeenCalledTimes(1);
    const payload = onNext.mock.calls[0][0];
    expect(payload.studentId).toBe('student-2');
    expect(payload.beforeVideoFile).toBeDefined();
    expect(payload.afterVideoFile).toBeDefined();
    expect(typeof payload.id).toBe('string');
    expect(typeof payload.createdAt).toBe('number');
  });

  it('shows empty-student guidance when no students are provided', () => {
    render(<LessonUploadPage students={[]} onBack={vi.fn()} onNext={vi.fn()} />);

    expect(
      screen.getByText('등록된 학생이 없습니다. 먼저 회원을 등록해 주세요.')
    ).toBeInTheDocument();
    expect(screen.getByTestId('upload-next-btn')).toBeDisabled();
  });
});
