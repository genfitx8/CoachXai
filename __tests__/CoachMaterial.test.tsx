/**
 * Tests for the coach material generation feature:
 * 1. CoachMaterialGenerator renders the config form fields.
 * 2. Form validation prevents submission with missing goal.
 * 3. Generate button calls geminiService.generateCoachMaterial with correct args.
 * 4. Generated content is displayed and editable after generation.
 * 5. Save button creates a material with correct structure.
 * 6. Saved materials are listed and can be expanded.
 * 7. Delete button calls onDeleteMaterial after confirmation.
 * 8. Toggle status changes draft/published.
 * 9. ClientMaterials shows only published materials.
 * 10. storageService coach material CRUD works correctly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { CoachMaterialGenerator } from '../components/CoachMaterialGenerator';
import { ClientMaterials } from '../components/ClientMaterials';
import { storageService } from '../services/storage';
import { ClientProfile, Lesson, CoachMaterial } from '../types';

// ─── Mock geminiService ────────────────────────────────────────────────────────

vi.mock('../services/geminiService', () => ({
  generateCoachMaterial: vi.fn().mockResolvedValue(
    '## 드라이버 레슨 가이드\n\n### 요약\n드라이버 슬라이스 교정 중심'
  ),
  generateGolfMissions: vi.fn().mockResolvedValue([]),
  generateTrainingProgram: vi.fn().mockResolvedValue(''),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CLIENT: ClientProfile = {
  name: '홍길동',
  phone: '010-1234-5678',
  coachId: 'coach1',
  handicap: 18,
};

const CLIENT_ID = `${CLIENT.name}_${CLIENT.phone}`;

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
  coachNotes: '스윙 교정 필요',
  tags: [],
  createdAt: Date.now(),
});

const LESSON_1 = makeLesson('lesson1', '2026-01-10');
const LESSON_2 = makeLesson('lesson2', '2026-01-17');

const SAVED_MATERIAL: CoachMaterial = {
  id: 'cm_coach1_홍길동_010-1234-5678_1000',
  coachId: 'coach1',
  clientId: CLIENT_ID,
  clientName: '홍길동',
  clientPhone: '010-1234-5678',
  title: '드라이버 레슨 가이드',
  type: 'LESSON_GUIDE',
  content: '## 드라이버 레슨 가이드\n\n**1. 그립 교정**',
  goal: '드라이버 슬라이스 교정',
  status: 'draft',
  lessonIds: ['lesson1'],
  createdAt: 1000,
  updatedAt: 1000,
};

const PUBLISHED_MATERIAL: CoachMaterial = {
  ...SAVED_MATERIAL,
  id: 'cm_coach1_홍길동_010-1234-5678_2000',
  status: 'published',
  createdAt: 2000,
  updatedAt: 2000,
};

// ─── Default props ─────────────────────────────────────────────────────────────

const defaultProps = {
  client: CLIENT,
  lessons: [LESSON_1, LESSON_2],
  coachId: 'coach1',
  materials: [],
  onBack: vi.fn(),
  onSaveMaterial: vi.fn(),
  onDeleteMaterial: vi.fn(),
};

// ─── Tests: CoachMaterialGenerator form ───────────────────────────────────────

describe('CoachMaterialGenerator – config form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the config form fields', () => {
    render(<CoachMaterialGenerator {...defaultProps} />);
    expect(screen.getByRole('heading', { name: '교재 생성' })).toBeTruthy();
    expect(screen.getByText('교재 유형')).toBeTruthy();
    expect(screen.getByText(/목표 \/ 요청/)).toBeTruthy();
  });

  it('shows client name in the header', () => {
    render(<CoachMaterialGenerator {...defaultProps} />);
    expect(screen.getByText('홍길동 회원')).toBeTruthy();
  });

  it('shows lesson record count when lessons exist', () => {
    render(<CoachMaterialGenerator {...defaultProps} />);
    // The count "2개" is in a bold span; look for surrounding text
    expect(screen.getByText(/레슨 기록을 기반으로 교재를 생성합니다/)).toBeTruthy();
  });

  it('shows fallback message when no lesson records exist', () => {
    render(<CoachMaterialGenerator {...defaultProps} lessons={[]} />);
    expect(screen.getByText(/레슨 기록이 없습니다/)).toBeTruthy();
  });

  it('renders all material type options', () => {
    render(<CoachMaterialGenerator {...defaultProps} />);
    expect(screen.getByText('레슨 가이드')).toBeTruthy();
    expect(screen.getByText('드릴 시트')).toBeTruthy();
    expect(screen.getByText('스윙 팁')).toBeTruthy();
    expect(screen.getByText('코스 전략')).toBeTruthy();
    expect(screen.getByText('커스텀 교재')).toBeTruthy();
  });
});

// ─── Tests: Validation ────────────────────────────────────────────────────────

describe('CoachMaterialGenerator – validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an error when no goal is entered', async () => {
    render(<CoachMaterialGenerator {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /교재 생성하기/ }));
    await waitFor(() => {
      expect(screen.getByText(/목표 또는 요청 내용을 입력해주세요/)).toBeTruthy();
    });
  });
});

// ─── Tests: Generation ────────────────────────────────────────────────────────

describe('CoachMaterialGenerator – generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls generateCoachMaterial and shows the result', async () => {
    const { generateCoachMaterial } = await import('../services/geminiService');

    render(<CoachMaterialGenerator {...defaultProps} />);

    // Enter a goal
    const textarea = screen.getByPlaceholderText(/드라이버 슬라이스 교정/);
    fireEvent.change(textarea, { target: { value: '드라이버 슬라이스 교정' } });

    // Click generate
    fireEvent.click(screen.getByRole('button', { name: /교재 생성하기/ }));

    await waitFor(() => {
      expect(generateCoachMaterial).toHaveBeenCalledTimes(1);
      expect(generateCoachMaterial).toHaveBeenCalledWith(
        CLIENT,
        expect.arrayContaining([expect.objectContaining({ id: 'lesson1' })]),
        'LESSON_GUIDE',
        '드라이버 슬라이스 교정'
      );
    });

    await waitFor(() => {
      expect(screen.getByText('생성된 교재 내용')).toBeTruthy();
    });
  });

  it('shows save buttons after generation', async () => {
    render(<CoachMaterialGenerator {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText(/드라이버 슬라이스 교정/), {
      target: { value: '목표 입력' },
    });
    fireEvent.click(screen.getByRole('button', { name: /교재 생성하기/ }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /초안으로 저장/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: /저장하기 \(회원 공개\)/ })).toBeTruthy();
    });
  });
});

// ─── Tests: Save ──────────────────────────────────────────────────────────────

describe('CoachMaterialGenerator – save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onSaveMaterial with correctly structured draft', async () => {
    const onSaveMaterial = vi.fn();
    render(
      <CoachMaterialGenerator {...defaultProps} onSaveMaterial={onSaveMaterial} />
    );

    fireEvent.change(screen.getByPlaceholderText(/드라이버 슬라이스 교정/), {
      target: { value: '드라이버 슬라이스 교정' },
    });
    fireEvent.click(screen.getByRole('button', { name: /교재 생성하기/ }));

    await waitFor(() => screen.getByRole('button', { name: /초안으로 저장/ }));
    fireEvent.click(screen.getByRole('button', { name: /초안으로 저장/ }));

    expect(onSaveMaterial).toHaveBeenCalledTimes(1);
    const saved = onSaveMaterial.mock.calls[0][0] as CoachMaterial;
    expect(saved.coachId).toBe('coach1');
    expect(saved.clientName).toBe('홍길동');
    expect(saved.clientPhone).toBe('010-1234-5678');
    expect(saved.clientId).toBe('홍길동_010-1234-5678');
    expect(saved.type).toBe('LESSON_GUIDE');
    expect(saved.goal).toBe('드라이버 슬라이스 교정');
    expect(saved.status).toBe('draft');
    expect(saved.content).toContain('드라이버 레슨 가이드');
    expect(typeof saved.createdAt).toBe('number');
  });

  it('calls onSaveMaterial with status published when saving as published', async () => {
    const onSaveMaterial = vi.fn();
    render(
      <CoachMaterialGenerator {...defaultProps} onSaveMaterial={onSaveMaterial} />
    );

    fireEvent.change(screen.getByPlaceholderText(/드라이버 슬라이스 교정/), {
      target: { value: '드라이버 슬라이스 교정' },
    });
    fireEvent.click(screen.getByRole('button', { name: /교재 생성하기/ }));

    await waitFor(() => screen.getByRole('button', { name: /저장하기 \(회원 공개\)/ }));
    fireEvent.click(screen.getByRole('button', { name: /저장하기 \(회원 공개\)/ }));

    expect(onSaveMaterial).toHaveBeenCalledTimes(1);
    const saved = onSaveMaterial.mock.calls[0][0] as CoachMaterial;
    expect(saved.status).toBe('published');
  });
});

// ─── Tests: Saved materials list ──────────────────────────────────────────────

describe('CoachMaterialGenerator – saved materials list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows saved materials in the list', () => {
    render(
      <CoachMaterialGenerator
        {...defaultProps}
        materials={[SAVED_MATERIAL]}
      />
    );
    expect(screen.getByText('저장된 교재')).toBeTruthy();
    expect(screen.getByText('드라이버 레슨 가이드')).toBeTruthy();
  });

  it('expands a saved material when clicked', async () => {
    render(
      <CoachMaterialGenerator
        {...defaultProps}
        materials={[SAVED_MATERIAL]}
      />
    );
    expect(screen.queryByText(/그립 교정/)).toBeNull();
    fireEvent.click(screen.getByText('드라이버 레슨 가이드'));
    await waitFor(() => {
      expect(screen.getByText(/그립 교정/)).toBeTruthy();
    });
  });

  it('calls onDeleteMaterial when delete is confirmed', async () => {
    const onDeleteMaterial = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <CoachMaterialGenerator
        {...defaultProps}
        materials={[SAVED_MATERIAL]}
        onDeleteMaterial={onDeleteMaterial}
      />
    );

    const deleteBtn = document.querySelector('[aria-label="삭제"]') as HTMLButtonElement;
    expect(deleteBtn).toBeTruthy();
    fireEvent.click(deleteBtn);

    expect(onDeleteMaterial).toHaveBeenCalledWith(SAVED_MATERIAL.id);
  });

  it('does NOT call onDeleteMaterial when delete is cancelled', () => {
    const onDeleteMaterial = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <CoachMaterialGenerator
        {...defaultProps}
        materials={[SAVED_MATERIAL]}
        onDeleteMaterial={onDeleteMaterial}
      />
    );

    const deleteBtn = document.querySelector('[aria-label="삭제"]') as HTMLButtonElement;
    if (deleteBtn) fireEvent.click(deleteBtn);
    expect(onDeleteMaterial).not.toHaveBeenCalled();
  });

  it('calls onSaveMaterial with toggled status when toggle button is clicked', () => {
    const onSaveMaterial = vi.fn();
    render(
      <CoachMaterialGenerator
        {...defaultProps}
        materials={[SAVED_MATERIAL]}
        onSaveMaterial={onSaveMaterial}
      />
    );

    // SAVED_MATERIAL is draft – clicking "공개" should toggle to published
    const toggleBtn = screen.getByTitle('회원 공개');
    fireEvent.click(toggleBtn);

    expect(onSaveMaterial).toHaveBeenCalledTimes(1);
    const updated = onSaveMaterial.mock.calls[0][0] as CoachMaterial;
    expect(updated.status).toBe('published');
    expect(updated.id).toBe(SAVED_MATERIAL.id);
  });
});

// ─── Tests: Back navigation ───────────────────────────────────────────────────

describe('CoachMaterialGenerator – back navigation', () => {
  it('calls onBack when the back button is clicked', () => {
    const onBack = vi.fn();
    render(<CoachMaterialGenerator {...defaultProps} onBack={onBack} />);
    fireEvent.click(screen.getByLabelText('뒤로가기'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

// ─── Tests: ClientMaterials ───────────────────────────────────────────────────

describe('ClientMaterials', () => {
  const onBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty state when no materials exist', () => {
    render(
      <ClientMaterials clientId={CLIENT_ID} materials={[]} onBack={onBack} />
    );
    expect(screen.getByText('교재가 없습니다')).toBeTruthy();
  });

  it('shows only published materials', () => {
    render(
      <ClientMaterials
        clientId={CLIENT_ID}
        materials={[SAVED_MATERIAL, PUBLISHED_MATERIAL]}
        onBack={onBack}
      />
    );
    // SAVED_MATERIAL is draft – should NOT show
    // PUBLISHED_MATERIAL is published – should show
    const titles = screen.getAllByText('드라이버 레슨 가이드');
    expect(titles.length).toBe(1);
  });

  it('shows material detail when a card is clicked', async () => {
    render(
      <ClientMaterials
        clientId={CLIENT_ID}
        materials={[PUBLISHED_MATERIAL]}
        onBack={onBack}
      />
    );
    fireEvent.click(screen.getByText('드라이버 레슨 가이드'));
    await waitFor(() => {
      // Detail view shows the content
      expect(screen.getByText(/드라이버 슬라이스 교정/)).toBeTruthy();
    });
  });

  it('calls onBack when back button is clicked in list view', () => {
    render(
      <ClientMaterials clientId={CLIENT_ID} materials={[]} onBack={onBack} />
    );
    fireEvent.click(screen.getByText('돌아가기'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('does not show materials for a different client', () => {
    const otherMaterial: CoachMaterial = {
      ...PUBLISHED_MATERIAL,
      id: 'other_id',
      clientId: '다른회원_010-9999-0000',
    };
    render(
      <ClientMaterials
        clientId={CLIENT_ID}
        materials={[otherMaterial]}
        onBack={onBack}
      />
    );
    expect(screen.getByText('교재가 없습니다')).toBeTruthy();
  });
});

// ─── storageService – coach materials ─────────────────────────────────────────

describe('storageService – coach materials (local storage)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const MATERIAL: CoachMaterial = {
    id: 'cm_coach1_test_1000',
    coachId: 'coach1',
    clientId: '홍길동_010-1234-5678',
    clientName: '홍길동',
    clientPhone: '010-1234-5678',
    title: '테스트 교재',
    type: 'LESSON_GUIDE',
    content: '## 테스트\n내용',
    goal: '테스트 목표',
    status: 'draft',
    createdAt: 1000,
    updatedAt: 1000,
  };

  it('returns empty array when no materials saved', () => {
    expect(storageService.getCoachMaterials()).toEqual([]);
  });

  it('saves and retrieves a coach material', () => {
    storageService.saveCoachMaterial(MATERIAL);
    const result = storageService.getCoachMaterials();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(MATERIAL.id);
    expect(result[0].type).toBe('LESSON_GUIDE');
  });

  it('updates an existing material when saved with same id', () => {
    storageService.saveCoachMaterial(MATERIAL);
    const updated: CoachMaterial = {
      ...MATERIAL,
      content: '## 업데이트된 내용',
      status: 'published',
      updatedAt: 9999,
    };
    storageService.saveCoachMaterial(updated);
    const result = storageService.getCoachMaterials();
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('## 업데이트된 내용');
    expect(result[0].status).toBe('published');
  });

  it('adds a new material if id differs', () => {
    storageService.saveCoachMaterial(MATERIAL);
    const another: CoachMaterial = { ...MATERIAL, id: 'cm_coach1_test_2000' };
    storageService.saveCoachMaterial(another);
    expect(storageService.getCoachMaterials()).toHaveLength(2);
  });

  it('deletes a material by id', () => {
    storageService.saveCoachMaterial(MATERIAL);
    storageService.deleteCoachMaterial(MATERIAL.id);
    expect(storageService.getCoachMaterials()).toHaveLength(0);
  });

  it('does not throw when deleting a non-existent id', () => {
    expect(() =>
      storageService.deleteCoachMaterial('nonexistent')
    ).not.toThrow();
  });
});
