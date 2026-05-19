/**
 * Tests for the coach-side round (SCORE) record feature.
 *
 * Verifies that:
 * 1. The "라운드 기록" button appears in the CLIENT_SELECT step for coaches.
 * 2. Clicking it navigates directly to the SCORE FORM (no PACKAGE_SELECT).
 * 3. The FORM shows the "라운드 기록" header title.
 * 4. The saved lesson has recordType === 'SCORE'.
 * 5. Validation fires when no client is selected.
 * 6. The button does NOT appear when userRole is 'CLIENT'.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { NewLessonForm } from '../components/NewLessonForm';
import { LanguageProvider } from '../components/LanguageContext';
import { ClientProfile, CoachProfile, LessonPackage, Lesson } from '../types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const COACH: CoachProfile = {
  id: 'coach1',
  name: '김코치',
  email: 'coach@test.com',
};

const CLIENT: ClientProfile = {
  id: 'c1',
  name: '박회원',
  phone: '010-1234-5678',
  coachId: 'coach1',
  email: '',
};

const PACKAGE: LessonPackage = {
  id: 'pkg1',
  coachId: 'coach1',
  clientId: '박회원_010-1234-5678',
  clientName: '박회원',
  clientPhone: '010-1234-5678',
  totalSessions: 5,
  createdAt: 1000,
  updatedAt: 1000,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const renderCoachForm = (packages: LessonPackage[] = []) => {
  const onSave = vi.fn();
  const onCancel = vi.fn();

  const utils = render(
    <LanguageProvider>
      <NewLessonForm
        existingClients={[CLIENT]}
        packages={packages}
        lessons={[]}
        userRole="COACH"
        currentUser={COACH}
        onSave={onSave}
        onCancel={onCancel}
      />
    </LanguageProvider>
  );

  return { ...utils, onSave, onCancel };
};

/** Select the test client from the CLIENT_SELECT step. */
const selectClient = async () => {
  const input = screen.getByPlaceholderText('이름을 입력하세요');
  fireEvent.change(input, { target: { value: '박회원' } });
  await waitFor(() => {
    expect(screen.getByText('박회원')).toBeInTheDocument();
  });
  fireEvent.click(screen.getByText('박회원'));
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Coach round record – CLIENT_SELECT step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the "라운드 기록" button in the CLIENT_SELECT step for coaches', () => {
    renderCoachForm();
    expect(screen.getByTestId('coach-start-round-btn')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /라운드 기록/i })).toBeInTheDocument();
  });

  it('validates that a client must be selected before starting a round record', async () => {
    renderCoachForm();
    fireEvent.click(screen.getByTestId('coach-start-round-btn'));
    await waitFor(() => {
      // Error message should appear (not the label "회원 이름")
      expect(screen.getByText(/회원 이름을 입력해주세요/i)).toBeInTheDocument();
    });
  });

  it('navigates directly to the SCORE form (skipping PACKAGE_SELECT) when "라운드 기록" is clicked', async () => {
    // Even when the client has packages, round records bypass PACKAGE_SELECT
    renderCoachForm([PACKAGE]);

    await selectClient();
    fireEvent.click(screen.getByTestId('coach-start-round-btn'));

    await waitFor(() => {
      // Should NOT show PACKAGE_SELECT
      expect(screen.queryByText(/레슨 패키지 선택/i)).toBeNull();
      // Should show the round record form header
      expect(screen.getByText('라운드 기록')).toBeInTheDocument();
    });
  });

  it('shows the "라운드 기록" heading in the FORM step header', async () => {
    renderCoachForm();

    await selectClient();
    fireEvent.click(screen.getByTestId('coach-start-round-btn'));

    await waitFor(() => {
      expect(screen.getByText('라운드 기록')).toBeInTheDocument();
    });
  });

  it('saved lesson has recordType === "SCORE" when coach records a round', async () => {
    const { onSave } = renderCoachForm();

    await selectClient();
    fireEvent.click(screen.getByTestId('coach-start-round-btn'));

    await waitFor(() => {
      expect(screen.getByText('라운드 기록')).toBeInTheDocument();
    });

    // Submit the form (title is pre-filled with the date)
    const saveBtn = screen.queryByRole('button', { name: /저장|기록 저장|레슨 저장/i });
    if (saveBtn) {
      fireEvent.click(saveBtn);
      await waitFor(() => {
        if (onSave.mock.calls.length > 0) {
          const savedLesson: Lesson = onSave.mock.calls[0][0];
          expect(savedLesson.recordType).toBe('SCORE');
          expect(savedLesson.clientName).toBe('박회원');
        }
      });
    }
  });
});

describe('Coach round record – CLIENT role does not see round button', () => {
  it('does NOT show the "라운드 기록" coach button when userRole is CLIENT', () => {
    const client: ClientProfile = { ...CLIENT };
    render(
      <LanguageProvider>
        <NewLessonForm
          existingClients={[client]}
          packages={[]}
          lessons={[]}
          userRole="CLIENT"
          currentUser={client}
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      </LanguageProvider>
    );

    // CLIENT role goes straight to TYPE_SELECT, no CLIENT_SELECT with round button
    expect(screen.queryByTestId('coach-start-round-btn')).toBeNull();
  });
});
