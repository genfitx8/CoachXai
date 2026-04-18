/**
 * Tests for the training program generation feature:
 * 1. TrainingProgramGenerator renders the config form fields.
 * 2. Form validation prevents submission with missing required inputs.
 * 3. Generate button calls geminiService.generateTrainingProgram with correct args.
 * 4. Generated plan is displayed after successful generation.
 * 5. Save button creates a program with correct structure and calls onSaveProgram.
 * 6. Saved programs are listed and can be expanded.
 * 7. Delete button calls onDeleteProgram after confirmation.
 * 8. Lesson context info shows correct count of records.
 * 9. storageService training program CRUD works correctly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { TrainingProgramGenerator } from '../components/TrainingProgramGenerator';
import { storageService } from '../services/storage';
import { ClientProfile, Lesson, TrainingProgram } from '../types';

// ─── Mock geminiService ────────────────────────────────────────────────────────

vi.mock('../services/geminiService', () => ({
  generateTrainingProgram: vi.fn().mockResolvedValue(
    '## 4주 훈련 프로그램\n\n**1주차** – 기초 점검\n- 빈스윙 50회'
  ),
  generateGolfMissions: vi.fn().mockResolvedValue([]),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CLIENT: ClientProfile = {
  name: '홍길동',
  phone: '010-1234-5678',
  coachId: 'coach1',
  handicap: 18,
};

const makeLesson = (id: string, date: string): Lesson => ({
  id,
  clientName: CLIENT.name,
  clientPhone: CLIENT.phone,
  coachId: 'coach1',
  createdBy: 'COACH',
  recordType: 'LESSON',
  date,
  title: `레슨 ${id}`,
  videoUrl: '',
  mediaType: 'video',
  coachNotes: '스윙 자세 교정 필요',
  tags: [],
  createdAt: Date.now(),
});

const LESSON_1 = makeLesson('lesson1', '2026-01-10');
const LESSON_2 = makeLesson('lesson2', '2026-01-17');

const SAVED_PROGRAM: TrainingProgram = {
  id: 'tp_coach1_홍길동_010-1234-5678_1000',
  coachId: 'coach1',
  clientId: '홍길동_010-1234-5678',
  clientName: '홍길동',
  clientPhone: '010-1234-5678',
  config: {
    startDate: '2026-02-01',
    endDate: '2026-03-01',
    frequencyPerWeek: 3,
    sessionDurationMinutes: 60,
    performanceGoal: '드라이버 정확도 향상',
  },
  generatedPlan: '## 기존 저장된 플랜\n\n**1주차** – 드라이버 연습',
  createdAt: 1000,
  updatedAt: 1000,
};

// ─── Default props ─────────────────────────────────────────────────────────────

const defaultProps = {
  client: CLIENT,
  lessons: [LESSON_1, LESSON_2],
  coachId: 'coach1',
  programs: [],
  onBack: vi.fn(),
  onSaveProgram: vi.fn(),
  onDeleteProgram: vi.fn(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TrainingProgramGenerator – config form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the config form fields', () => {
    render(<TrainingProgramGenerator {...defaultProps} />);
    // The heading appears in the header
    expect(screen.getByRole('heading', { name: '훈련 프로그램 생성' })).toBeTruthy();
    expect(screen.getByText(/시작 날짜/)).toBeTruthy();
    expect(screen.getByText(/종료 날짜/)).toBeTruthy();
    expect(screen.getByText(/빈도 설정/)).toBeTruthy();
    expect(screen.getByText(/훈련 시간 설정/)).toBeTruthy();
    expect(screen.getByText(/향상하고 싶은 경기력/)).toBeTruthy();
  });

  it('shows client name in the header', () => {
    render(<TrainingProgramGenerator {...defaultProps} />);
    expect(screen.getByText('홍길동 회원')).toBeTruthy();
  });

  it('shows lesson record count when lessons exist', () => {
    render(<TrainingProgramGenerator {...defaultProps} />);
    expect(screen.getByText(/2개 레슨 기록 기반으로/)).toBeTruthy();
  });

  it('shows fallback message when no lesson records exist', () => {
    render(<TrainingProgramGenerator {...defaultProps} lessons={[]} />);
    expect(screen.getByText(/레슨 기록이 없습니다/)).toBeTruthy();
  });

  it('renders performance goal options', () => {
    render(<TrainingProgramGenerator {...defaultProps} />);
    expect(screen.getAllByText('드라이버 정확도 향상').length).toBeGreaterThan(0);
    expect(screen.getByText('퍼팅 정확도 향상')).toBeTruthy();
  });
});

describe('TrainingProgramGenerator – validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an error when no performance goal is selected', async () => {
    render(<TrainingProgramGenerator {...defaultProps} />);
    const generateBtn = screen.getByRole('button', { name: /훈련 프로그램 생성/ });
    fireEvent.click(generateBtn);
    await waitFor(() => {
      expect(
        screen.getByText(/향상하고 싶은 경기력을 선택하거나 입력/)
      ).toBeTruthy();
    });
  });

  it('shows error when end date is not after start date', async () => {
    render(<TrainingProgramGenerator {...defaultProps} />);

    // Set startDate to a date after endDate
    const dateInputs = document.querySelectorAll('input[type="date"]');
    const startInput = dateInputs[0] as HTMLInputElement;
    const endInput = dateInputs[1] as HTMLInputElement;
    if (startInput && endInput) {
      fireEvent.change(startInput, { target: { value: '2026-06-01' } });
      fireEvent.change(endInput, { target: { value: '2026-05-01' } });
    }
    // Select a performance goal
    fireEvent.click(screen.getAllByText('드라이버 정확도 향상')[0]);
    // Click generate
    fireEvent.click(screen.getByRole('button', { name: /훈련 프로그램 생성/ }));
    await waitFor(() => {
      expect(
        screen.getByText(/종료 날짜는 시작 날짜보다 이후/)
      ).toBeTruthy();
    });
  });
});

describe('TrainingProgramGenerator – generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls generateTrainingProgram and shows the result', async () => {
    const { generateTrainingProgram } = await import('../services/geminiService');

    render(<TrainingProgramGenerator {...defaultProps} />);

    // Select a performance goal
    fireEvent.click(screen.getAllByText('드라이버 정확도 향상')[0]);

    // Click generate
    fireEvent.click(screen.getByRole('button', { name: /훈련 프로그램 생성/ }));

    // Wait for the generated plan to appear
    await waitFor(() => {
      expect(generateTrainingProgram).toHaveBeenCalledTimes(1);
      expect(generateTrainingProgram).toHaveBeenCalledWith(
        CLIENT,
        expect.arrayContaining([expect.objectContaining({ id: 'lesson1' })]),
        expect.objectContaining({ performanceGoal: '드라이버 정확도 향상' })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/4주 훈련 프로그램/)).toBeTruthy();
    });
  });

  it('shows a save button after generation', async () => {
    render(<TrainingProgramGenerator {...defaultProps} />);
    fireEvent.click(screen.getAllByText('드라이버 정확도 향상')[0]);
    fireEvent.click(screen.getByRole('button', { name: /훈련 프로그램 생성/ }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /저장하기/ })).toBeTruthy();
    });
  });
});

describe('TrainingProgramGenerator – save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onSaveProgram with a correctly structured program', async () => {
    const onSaveProgram = vi.fn();
    render(
      <TrainingProgramGenerator {...defaultProps} onSaveProgram={onSaveProgram} />
    );

    fireEvent.click(screen.getAllByText('드라이버 정확도 향상')[0]);
    fireEvent.click(screen.getByRole('button', { name: /훈련 프로그램 생성/ }));

    await waitFor(() => screen.getByRole('button', { name: /저장하기/ }));
    fireEvent.click(screen.getByRole('button', { name: /저장하기/ }));

    expect(onSaveProgram).toHaveBeenCalledTimes(1);
    const saved = onSaveProgram.mock.calls[0][0] as TrainingProgram;
    expect(saved.coachId).toBe('coach1');
    expect(saved.clientName).toBe('홍길동');
    expect(saved.clientPhone).toBe('010-1234-5678');
    expect(saved.clientId).toBe('홍길동_010-1234-5678');
    expect(saved.config.performanceGoal).toBe('드라이버 정확도 향상');
    expect(saved.generatedPlan).toContain('4주 훈련 프로그램');
    expect(typeof saved.createdAt).toBe('number');
  });
});

describe('TrainingProgramGenerator – saved programs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows saved programs in the list', () => {
    render(
      <TrainingProgramGenerator
        {...defaultProps}
        programs={[SAVED_PROGRAM]}
      />
    );
    expect(screen.getByText('저장된 프로그램')).toBeTruthy();
    // The saved program goal appears in the list card
    const goalElements = screen.getAllByText('드라이버 정확도 향상');
    expect(goalElements.length).toBeGreaterThan(0);
  });

  it('expands a saved program when clicked', async () => {
    render(
      <TrainingProgramGenerator
        {...defaultProps}
        programs={[SAVED_PROGRAM]}
      />
    );
    // Initially the plan content should not be visible
    expect(screen.queryByText(/기존 저장된 플랜/)).toBeNull();

    // Click the program card to expand (by the date range text which is unique)
    fireEvent.click(screen.getByText(/2026-02-01 ~ 2026-03-01/));
    await waitFor(() => {
      expect(screen.getByText(/기존 저장된 플랜/)).toBeTruthy();
    });
  });

  it('calls onDeleteProgram when delete is confirmed', async () => {
    const onDeleteProgram = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <TrainingProgramGenerator
        {...defaultProps}
        programs={[SAVED_PROGRAM]}
        onDeleteProgram={onDeleteProgram}
      />
    );

    // Find and click the delete button
    const deleteBtn = document.querySelector('[aria-label="삭제"]') as HTMLButtonElement;
    expect(deleteBtn).toBeTruthy();
    fireEvent.click(deleteBtn);

    expect(onDeleteProgram).toHaveBeenCalledWith(SAVED_PROGRAM.id);
  });

  it('does NOT call onDeleteProgram when delete is cancelled', () => {
    const onDeleteProgram = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <TrainingProgramGenerator
        {...defaultProps}
        programs={[SAVED_PROGRAM]}
        onDeleteProgram={onDeleteProgram}
      />
    );

    const deleteBtn = document.querySelector('[aria-label="삭제"]') as HTMLButtonElement;
    if (deleteBtn) fireEvent.click(deleteBtn);
    expect(onDeleteProgram).not.toHaveBeenCalled();
  });
});

describe('TrainingProgramGenerator – back navigation', () => {
  it('calls onBack when the back button is clicked', () => {
    const onBack = vi.fn();
    render(<TrainingProgramGenerator {...defaultProps} onBack={onBack} />);
    fireEvent.click(screen.getByLabelText('뒤로가기'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

// ─── storageService – training programs ───────────────────────────────────────

describe('storageService – training programs (local storage)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const PROGRAM: TrainingProgram = {
    id: 'tp_coach1_test_1000',
    coachId: 'coach1',
    clientId: '홍길동_010-1234-5678',
    clientName: '홍길동',
    clientPhone: '010-1234-5678',
    config: {
      startDate: '2026-02-01',
      endDate: '2026-03-01',
      frequencyPerWeek: 3,
      sessionDurationMinutes: 60,
      performanceGoal: '드라이버 정확도 향상',
    },
    generatedPlan: '## 테스트 플랜',
    createdAt: 1000,
    updatedAt: 1000,
  };

  it('returns empty array when no programs saved', () => {
    expect(storageService.getTrainingPrograms()).toEqual([]);
  });

  it('saves and retrieves a training program', () => {
    storageService.saveTrainingProgram(PROGRAM);
    const result = storageService.getTrainingPrograms();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(PROGRAM.id);
    expect(result[0].config.performanceGoal).toBe('드라이버 정확도 향상');
  });

  it('updates an existing program when saved with the same id', () => {
    storageService.saveTrainingProgram(PROGRAM);
    const updated: TrainingProgram = {
      ...PROGRAM,
      generatedPlan: '## 업데이트된 플랜',
      updatedAt: 9999,
    };
    storageService.saveTrainingProgram(updated);
    const result = storageService.getTrainingPrograms();
    expect(result).toHaveLength(1);
    expect(result[0].generatedPlan).toBe('## 업데이트된 플랜');
    expect(result[0].updatedAt).toBe(9999);
  });

  it('adds a new program if id differs', () => {
    storageService.saveTrainingProgram(PROGRAM);
    const another: TrainingProgram = { ...PROGRAM, id: 'tp_coach1_test_2000' };
    storageService.saveTrainingProgram(another);
    expect(storageService.getTrainingPrograms()).toHaveLength(2);
  });

  it('deletes a program by id', () => {
    storageService.saveTrainingProgram(PROGRAM);
    storageService.deleteTrainingProgram(PROGRAM.id);
    expect(storageService.getTrainingPrograms()).toHaveLength(0);
  });

  it('does not throw when deleting a non-existent id', () => {
    expect(() =>
      storageService.deleteTrainingProgram('nonexistent')
    ).not.toThrow();
  });
});
