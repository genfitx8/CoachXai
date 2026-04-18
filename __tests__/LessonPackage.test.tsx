/**
 * Tests for the lesson package / session-count workflow:
 * 1. Coach can assign a lesson package (session count) to a member.
 * 2. LessonPackageManager renders the correct number of session slots.
 * 3. Completed vs remaining sessions are shown correctly.
 * 4. Clicking a completed session calls onViewLesson.
 * 5. Clicking an empty session calls onRecordSession.
 * 6. Duplicate session recording is prevented (session already recorded
 *    shows as completed, not as a record-again button).
 * 7. LessonPackage data persists via storageService.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { LessonPackageManager } from '../components/LessonPackageManager';
import { storageService } from '../services/storage';
import { ClientProfile, LessonPackage, Lesson } from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CLIENT: ClientProfile = {
  name: '홍길동',
  phone: '010-1234-5678',
  coachId: 'coach1',
};

const PACKAGE_10: LessonPackage = {
  id: 'pkg_coach1_홍길동_010-1234-5678_1000',
  coachId: 'coach1',
  clientId: '홍길동_010-1234-5678',
  clientName: '홍길동',
  clientPhone: '010-1234-5678',
  totalSessions: 10,
  createdAt: 1000,
  updatedAt: 1000,
};

const makeLesson = (sessionNumber: number, packageId: string): Lesson => ({
  id: `lesson_${packageId}_${sessionNumber}`,
  clientName: CLIENT.name,
  clientPhone: CLIENT.phone,
  coachId: 'coach1',
  createdBy: 'COACH',
  recordType: 'LESSON',
  date: `2026-01-${String(sessionNumber).padStart(2, '0')}`,
  title: `${sessionNumber}회차 레슨`,
  videoUrl: '',
  mediaType: 'video',
  coachNotes: '',
  tags: [],
  lessonPackageId: packageId,
  sessionNumber,
  createdAt: 1000 + sessionNumber,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface Props {
  packages?: LessonPackage[];
  lessons?: Lesson[];
}

const renderManager = (props: Props = {}) => {
  const onBack = vi.fn();
  const onSavePackage = vi.fn();
  const onDeletePackage = vi.fn();
  const onRecordSession = vi.fn();
  const onViewLesson = vi.fn();

  const utils = render(
    <LessonPackageManager
      client={CLIENT}
      packages={props.packages ?? []}
      lessons={props.lessons ?? []}
      coachId="coach1"
      onBack={onBack}
      onSavePackage={onSavePackage}
      onDeletePackage={onDeletePackage}
      onRecordSession={onRecordSession}
      onViewLesson={onViewLesson}
    />
  );

  return { ...utils, onBack, onSavePackage, onDeletePackage, onRecordSession, onViewLesson };
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LessonPackageManager', () => {
  it('shows an empty-state message when no packages exist', () => {
    renderManager();
    expect(screen.getByText(/등록된 레슨 패키지가 없습니다/i)).toBeInTheDocument();
  });

  it('shows a "새 레슨 패키지 등록" button', () => {
    renderManager();
    expect(screen.getByRole('button', { name: /새 레슨 패키지 등록/i })).toBeInTheDocument();
  });

  it('opens the new-package modal when the button is clicked', () => {
    renderManager();
    fireEvent.click(screen.getByRole('button', { name: /새 레슨 패키지 등록/i }));
    // The modal header should appear
    expect(screen.getByRole('heading', { name: /새 레슨 패키지 등록/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/예: 10/i)).toBeInTheDocument();
  });

  it('calls onSavePackage with correct data when coach assigns a session count', async () => {
    const { onSavePackage } = renderManager();

    fireEvent.click(screen.getByRole('button', { name: /새 레슨 패키지 등록/i }));

    const input = screen.getByPlaceholderText(/예: 10/i);
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /등록하기/i }));

    await waitFor(() => {
      expect(onSavePackage).toHaveBeenCalledOnce();
      const saved: LessonPackage = onSavePackage.mock.calls[0][0];
      expect(saved.totalSessions).toBe(5);
      expect(saved.coachId).toBe('coach1');
      expect(saved.clientName).toBe(CLIENT.name);
      expect(saved.clientPhone).toBe(CLIENT.phone);
    });
  });

  it('shows validation error when session count is out of range', async () => {
    const { onSavePackage } = renderManager();
    fireEvent.click(screen.getByRole('button', { name: /새 레슨 패키지 등록/i }));
    const input = screen.getByPlaceholderText(/예: 10/i);
    // Set value via change event - use a valid but boundary value first, then invalid
    fireEvent.change(input, { target: { value: '5' } });
    // Override directly to test invalid case
    fireEvent.change(input, { target: { value: '-1' } });
    // Directly call form submit to bypass native HTML5 validation in JSDOM
    const form = input.closest('form')!;
    fireEvent.submit(form);
    // onSavePackage should NOT have been called since value is invalid
    expect(onSavePackage).not.toHaveBeenCalled();
  });

  it('renders the correct number of session slots for a package', () => {
    renderManager({ packages: [PACKAGE_10] });
    // Each session has "N회차" label
    for (let i = 1; i <= 10; i++) {
      expect(screen.getByText(`${i}회차`)).toBeInTheDocument();
    }
  });

  it('shows completed and remaining session counts in the package header', () => {
    const lessons = [makeLesson(1, PACKAGE_10.id), makeLesson(2, PACKAGE_10.id)];
    renderManager({ packages: [PACKAGE_10], lessons });
    // The header shows "2" (bold) + "/10회 완료" (gray)
    expect(screen.getByText('/10회 완료')).toBeInTheDocument();
    expect(screen.getByText('8회 남음')).toBeInTheDocument();
  });

  it('completed sessions show the lesson date, remaining show "기록하기"', () => {
    const lessons = [makeLesson(1, PACKAGE_10.id)];
    renderManager({ packages: [PACKAGE_10], lessons });
    // Session 1 is completed – shows the date
    expect(screen.getByText('2026-01-01')).toBeInTheDocument();
    // Session 2 is empty – shows "기록하기"
    const recordButtons = screen.getAllByText('기록하기');
    expect(recordButtons.length).toBe(9); // sessions 2-10
  });

  it('clicking an empty session calls onRecordSession with correct package and sessionNumber', () => {
    const { onRecordSession } = renderManager({ packages: [PACKAGE_10] });
    // Session 1 is the first "기록하기" button
    const recordButtons = screen.getAllByText('기록하기');
    fireEvent.click(recordButtons[0]); // session 1
    expect(onRecordSession).toHaveBeenCalledWith(PACKAGE_10, 1);
  });

  it('clicking a completed session calls onViewLesson with the existing lesson', () => {
    const lesson1 = makeLesson(1, PACKAGE_10.id);
    const { onViewLesson } = renderManager({ packages: [PACKAGE_10], lessons: [lesson1] });
    // Session 1 is completed – click it
    fireEvent.click(screen.getByText('2026-01-01'));
    expect(onViewLesson).toHaveBeenCalledWith(lesson1);
  });

  it('does NOT show a "기록하기" button for an already-recorded session (duplicate prevention)', () => {
    // All 10 sessions recorded
    const lessons = Array.from({ length: 10 }, (_, i) => makeLesson(i + 1, PACKAGE_10.id));
    renderManager({ packages: [PACKAGE_10], lessons });
    expect(screen.queryByText('기록하기')).toBeNull();
  });

  it('calls onDeletePackage when coach confirms deletion', () => {
    window.confirm = vi.fn().mockReturnValue(true);
    const { onDeletePackage } = renderManager({ packages: [PACKAGE_10] });
    // Find the trash button (aria-label or title)
    const deleteBtn = screen.getByTitle('패키지 삭제');
    fireEvent.click(deleteBtn);
    expect(onDeletePackage).toHaveBeenCalledWith(PACKAGE_10.id);
  });

  it('does NOT call onDeletePackage when coach cancels deletion', () => {
    window.confirm = vi.fn().mockReturnValue(false);
    const { onDeletePackage } = renderManager({ packages: [PACKAGE_10] });
    const deleteBtn = screen.getByTitle('패키지 삭제');
    fireEvent.click(deleteBtn);
    expect(onDeletePackage).not.toHaveBeenCalled();
  });

  it('calls onBack when the back button is clicked', () => {
    const { onBack } = renderManager();
    fireEvent.click(screen.getByRole('button', { name: /돌아가기/i }));
    expect(onBack).toHaveBeenCalled();
  });
});

// ─── storageService integration tests ─────────────────────────────────────────

describe('storageService – lesson packages (local storage)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty array when no packages are stored', () => {
    expect(storageService.getLessonPackages()).toEqual([]);
  });

  it('saves and retrieves a lesson package', () => {
    storageService.saveLessonPackage(PACKAGE_10);
    const result = storageService.getLessonPackages();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(PACKAGE_10.id);
    expect(result[0].totalSessions).toBe(10);
  });

  it('updates an existing package when saved with the same id', () => {
    storageService.saveLessonPackage(PACKAGE_10);
    const updated: LessonPackage = { ...PACKAGE_10, totalSessions: 20, updatedAt: 9999 };
    storageService.saveLessonPackage(updated);
    const result = storageService.getLessonPackages();
    expect(result).toHaveLength(1);
    expect(result[0].totalSessions).toBe(20);
  });

  it('deletes a package by id', () => {
    storageService.saveLessonPackage(PACKAGE_10);
    storageService.deleteLessonPackage(PACKAGE_10.id);
    expect(storageService.getLessonPackages()).toHaveLength(0);
  });

  it('ignores deletion of a non-existent package id', () => {
    storageService.saveLessonPackage(PACKAGE_10);
    storageService.deleteLessonPackage('nonexistent');
    expect(storageService.getLessonPackages()).toHaveLength(1);
  });
});
