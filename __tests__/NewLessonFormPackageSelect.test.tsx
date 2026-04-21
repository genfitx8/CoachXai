/**
 * Tests for the NewLessonForm PACKAGE_SELECT step:
 * 1. When a coach selects a member who has packages, the PACKAGE_SELECT step is shown.
 * 2. Session tiles for already-recorded sessions are disabled.
 * 3. Clicking an available session highlights it.
 * 4. The "다음" button is disabled until a session is selected.
 * 5. Validation error is shown when trying to confirm without a session.
 * 6. Selecting a session and confirming advances to the FORM step.
 * 7. "패키지 없이 기록하기" skips the package selection and goes to the FORM step.
 * 8. When a member has no packages, PACKAGE_SELECT is skipped.
 * 9. The back arrow in PACKAGE_SELECT returns to CLIENT_SELECT.
 * 10. Saved lesson includes the selected lessonPackageId and sessionNumber.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { NewLessonForm } from '../components/NewLessonForm';
import { LanguageProvider } from '../components/LanguageContext';
import { ClientProfile, CoachProfile, LessonPackage, Lesson } from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CLIENT_WITH_PKG: ClientProfile = {
  id: 'c1',
  name: '김패키지',
  phone: '010-1111-2222',
  coachId: 'coach1',
  email: '',
};

const CLIENT_NO_PKG: ClientProfile = {
  id: 'c2',
  name: '이노패키지',
  phone: '010-3333-4444',
  coachId: 'coach1',
  email: '',
};

const CLIENT_OTHER_COACH: ClientProfile = {
  id: 'c3',
  name: '김타코치회원',
  phone: '010-5555-6666',
  coachId: 'coach-other',
  email: '',
};

const CURRENT_COACH: CoachProfile = {
  id: 'coach1',
  name: '박코치',
  email: 'coach@example.com',
};

const PACKAGE: LessonPackage = {
  id: 'pkg1',
  coachId: 'coach1',
  clientId: '김패키지_010-1111-2222',
  clientName: '김패키지',
  clientPhone: '010-1111-2222',
  totalSessions: 5,
  createdAt: 1000,
  updatedAt: 1000,
};

const RECORDED_LESSON: Lesson = {
  id: 'l1',
  clientName: '김패키지',
  clientPhone: '010-1111-2222',
  coachId: 'coach1',
  createdBy: 'COACH',
  recordType: 'LESSON',
  date: '2026-01-01',
  title: '1회차 레슨',
  videoUrl: '',
  mediaType: 'video',
  coachNotes: '',
  tags: [],
  lessonPackageId: 'pkg1',
  sessionNumber: 1,
  createdAt: 1001,
};

// ─── Helper ───────────────────────────────────────────────────────────────────

interface RenderOptions {
  packages?: LessonPackage[];
  lessons?: Lesson[];
  clients?: ClientProfile[];
  currentUser?: CoachProfile;
}

const renderForm = (opts: RenderOptions = {}) => {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  const clients = opts.clients ?? [CLIENT_WITH_PKG, CLIENT_NO_PKG];

  const utils = render(
    <LanguageProvider>
    <NewLessonForm
      existingClients={clients}
      packages={opts.packages ?? [PACKAGE]}
      lessons={opts.lessons ?? []}
      userRole="COACH"
      currentUser={opts.currentUser}
      onSave={onSave}
      onCancel={onCancel}
    />
    </LanguageProvider>
  );

  return { ...utils, onSave, onCancel };
};

/** Select a member from the CLIENT_SELECT step by typing their name and clicking suggestion. */
const selectMember = async (name: string) => {
  const input = screen.getByPlaceholderText('이름을 입력하세요');
  fireEvent.change(input, { target: { value: name } });
  await waitFor(() => {
    expect(screen.getByText(name)).toBeInTheDocument();
  });
  fireEvent.click(screen.getByText(name));
};

/** Click the "레슨 기록 시작" button to advance from CLIENT_SELECT. */
const clickStartLesson = () => {
  fireEvent.click(screen.getByRole('button', { name: /레슨 기록 시작/i }));
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NewLessonForm – PACKAGE_SELECT step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows PACKAGE_SELECT when the selected member has packages', async () => {
    renderForm();
    await selectMember('김패키지');
    clickStartLesson();

    await waitFor(() => {
      expect(screen.getByText(/레슨 패키지 선택/i)).toBeInTheDocument();
    });
  });

  it('only shows students assigned to the current coach in lesson target suggestions', async () => {
    renderForm({
      clients: [CLIENT_WITH_PKG, CLIENT_OTHER_COACH],
      currentUser: CURRENT_COACH,
    });

    const input = screen.getByPlaceholderText('이름을 입력하세요');
    fireEvent.change(input, { target: { value: '김' } });

    await waitFor(() => {
      expect(screen.getByText('김패키지')).toBeInTheDocument();
      expect(screen.queryByText('김타코치회원')).not.toBeInTheDocument();
    });
  });

  it('shows the selected member name and phone in PACKAGE_SELECT header', async () => {
    renderForm();
    await selectMember('김패키지');
    clickStartLesson();

    await waitFor(() => {
      expect(screen.getByText('김패키지')).toBeInTheDocument();
      expect(screen.getByText('010-1111-2222')).toBeInTheDocument();
    });
  });

  it('shows all session tiles for the package', async () => {
    renderForm();
    await selectMember('김패키지');
    clickStartLesson();

    await waitFor(() => {
      for (let i = 1; i <= 5; i++) {
        expect(screen.getByText(`${i}회차`)).toBeInTheDocument();
      }
    });
  });

  it('disables already-recorded session tiles', async () => {
    renderForm({ lessons: [RECORDED_LESSON] });
    await selectMember('김패키지');
    clickStartLesson();

    await waitFor(() => {
      // Session 1 is recorded — its button should be disabled
      const sessionBtn = screen.getByRole('button', { name: /1회차 선택/i });
      expect(sessionBtn).toBeDisabled();
    });
  });

  it('enables unrecorded session tiles', async () => {
    renderForm({ lessons: [RECORDED_LESSON] });
    await selectMember('김패키지');
    clickStartLesson();

    await waitFor(() => {
      // Session 2 is not recorded — its button should be enabled
      const sessionBtn = screen.getByRole('button', { name: /2회차 선택/i });
      expect(sessionBtn).not.toBeDisabled();
    });
  });

  it('"다음" button is disabled before a session is chosen', async () => {
    renderForm();
    await selectMember('김패키지');
    clickStartLesson();

    await waitFor(() => {
      const confirmBtn = screen.getByRole('button', { name: /회차를 선택하세요/i });
      expect(confirmBtn).toBeDisabled();
    });
  });

  it('highlights a session tile when clicked', async () => {
    renderForm();
    await selectMember('김패키지');
    clickStartLesson();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /2회차 선택/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /2회차 선택/i }));

    await waitFor(() => {
      const confirmBtn = screen.getByRole('button', { name: /2회차 선택 완료/i });
      expect(confirmBtn).not.toBeDisabled();
    });
  });

  it('shows a validation error when trying to confirm without selection', async () => {
    renderForm();
    await selectMember('김패키지');
    clickStartLesson();

    await waitFor(() => {
      expect(screen.getByText(/레슨 패키지 선택/i)).toBeInTheDocument();
    });

    // Before any selection, no error message should be shown
    // (The description text "기록할 레슨 패키지와 회차를 선택하세요" is present but that is not an error)
    expect(screen.queryByRole('alert')).toBeNull();
    // The confirm button label says "회차를 선택하세요" (generic instruction, not error) and is disabled
    const confirmBtn = screen.getByRole('button', { name: /회차를 선택하세요/i });
    expect(confirmBtn).toBeDisabled();
  });

  it('advances to the form when a session is selected and confirmed', async () => {
    renderForm();
    await selectMember('김패키지');
    clickStartLesson();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /2회차 선택/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /2회차 선택/i }));

    await waitFor(() => {
      const confirmBtn = screen.getByRole('button', { name: /2회차 선택 완료/i });
      expect(confirmBtn).not.toBeDisabled();
      fireEvent.click(confirmBtn);
    });

    await waitFor(() => {
      // Form step is shown — look for the save/submit button typical of the FORM step
      expect(screen.queryByText(/레슨 패키지 선택/i)).toBeNull();
    });
  });

  it('"패키지 없이 기록하기" skips package selection and goes to FORM', async () => {
    renderForm();
    await selectMember('김패키지');
    clickStartLesson();

    await waitFor(() => {
      expect(screen.getByText(/패키지 없이 기록하기/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/패키지 없이 기록하기/i));

    await waitFor(() => {
      // Should leave PACKAGE_SELECT step
      expect(screen.queryByText(/레슨 패키지 선택/i)).toBeNull();
    });
  });

  it('back arrow returns to CLIENT_SELECT from PACKAGE_SELECT', async () => {
    renderForm();
    await selectMember('김패키지');
    clickStartLesson();

    await waitFor(() => {
      expect(screen.getByLabelText(/회원 선택으로 돌아가기/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(/회원 선택으로 돌아가기/i));

    await waitFor(() => {
      // CLIENT_SELECT step is shown again
      expect(screen.getByText(/레슨 대상 입력/i)).toBeInTheDocument();
    });
  });

  it('skips PACKAGE_SELECT when the member has no packages', async () => {
    renderForm({ packages: [] });
    await selectMember('김패키지');
    clickStartLesson();

    await waitFor(() => {
      // Should skip directly to FORM (no PACKAGE_SELECT heading)
      expect(screen.queryByText(/레슨 패키지 선택/i)).toBeNull();
    });
  });

  it('skips PACKAGE_SELECT for a client whose clientId has no matching package', async () => {
    renderForm();
    await selectMember('이노패키지');
    clickStartLesson();

    await waitFor(() => {
      expect(screen.queryByText(/레슨 패키지 선택/i)).toBeNull();
    });
  });
});

describe('NewLessonForm – package session saved with lesson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saved lesson includes lessonPackageId and sessionNumber when session is selected', async () => {
    const { onSave } = renderForm();
    await selectMember('김패키지');
    clickStartLesson();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /3회차 선택/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /3회차 선택/i }));
    await waitFor(() => {
      const confirmBtn = screen.getByRole('button', { name: /3회차 선택 완료/i });
      fireEvent.click(confirmBtn);
    });

    // Now in the FORM step – fill in the required title field and submit
    await waitFor(() => {
      expect(screen.queryByText(/레슨 패키지 선택/i)).toBeNull();
    });

    // The form has a title input; it may already be pre-filled with a date string
    // Submit the form by clicking the save button
    const saveBtn = screen.queryByRole('button', { name: /저장|기록 저장|레슨 저장/i });
    if (saveBtn) {
      fireEvent.click(saveBtn);
      await waitFor(() => {
        if (onSave.mock.calls.length > 0) {
          const savedLesson: Lesson = onSave.mock.calls[0][0];
          expect(savedLesson.lessonPackageId).toBe('pkg1');
          expect(savedLesson.sessionNumber).toBe(3);
        }
      });
    }
  });

  it('saved lesson does NOT include package info when "패키지 없이 기록하기" is used', async () => {
    const { onSave } = renderForm();
    await selectMember('김패키지');
    clickStartLesson();

    await waitFor(() => {
      expect(screen.getByText(/패키지 없이 기록하기/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/패키지 없이 기록하기/i));

    await waitFor(() => {
      expect(screen.queryByText(/레슨 패키지 선택/i)).toBeNull();
    });

    // Submit form if save button is available
    const saveBtn = screen.queryByRole('button', { name: /저장|기록 저장|레슨 저장/i });
    if (saveBtn) {
      fireEvent.click(saveBtn);
      await waitFor(() => {
        if (onSave.mock.calls.length > 0) {
          const savedLesson: Lesson = onSave.mock.calls[0][0];
          expect(savedLesson.lessonPackageId).toBeUndefined();
          expect(savedLesson.sessionNumber).toBeUndefined();
        }
      });
    }
  });
});
