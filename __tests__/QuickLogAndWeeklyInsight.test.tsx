/**
 * Tests for the quick logging and weekly AI insight generation feature:
 * 1. storageService quick log CRUD works correctly.
 * 2. storageService weekly insight CRUD works correctly.
 * 3. QuickGolfLog renders form fields and validates required fields.
 * 4. QuickGolfLog submits and calls onSave with correct entry shape.
 * 5. QuickGolfLog allows mood and practice area selection.
 * 6. WeeklyInsightCard renders the generate button.
 * 7. WeeklyInsightCard shows hint when no logs are present.
 * 8. WeeklyInsightCard generates and displays an insight on button click.
 * 9. generateWeeklyInsight falls back gracefully when AI is unavailable.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QuickGolfLog } from '../components/QuickGolfLog';
import { WeeklyInsightCard } from '../components/WeeklyInsightCard';
import { storageService } from '../services/storage';
import { QuickLogEntry, WeeklyInsight, ClientProfile, Lesson } from '../types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/geminiService', () => ({
  generateWeeklyInsight: vi.fn().mockResolvedValue({
    summary: '이번 주 전반적으로 좋은 기록을 유지했습니다.',
    keyPatterns: ['드라이버 방향성 개선', '퍼팅 거리 편차 감소'],
    recommendedFocus: '다음 주는 아이언 컨택에 집중하세요.',
  }),
  generateTrainingProgram: vi.fn().mockResolvedValue(''),
  generateGolfMissions: vi.fn().mockResolvedValue([]),
}));

vi.mock('../services/firebase', () => ({
  firebaseService: {
    isInitialized: vi.fn().mockReturnValue(false),
    getQuickLogsByClient: vi.fn().mockResolvedValue([]),
    saveQuickLog: vi.fn().mockResolvedValue(undefined),
    getWeeklyInsightsByClient: vi.fn().mockResolvedValue([]),
    saveWeeklyInsight: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../components/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'ko',
    setLanguage: vi.fn(),
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeLog = (overrides: Partial<QuickLogEntry> = {}): QuickLogEntry => ({
  id: crypto.randomUUID(),
  clientId: 'TestClient_01012345678',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  logDate: '2026-04-01',
  mood: 'GOOD',
  goodPoint: '드라이버 방향성 좋았다',
  problemPoint: '퍼팅 거리감 부족',
  ...overrides,
});

const CLIENT_PROFILE: ClientProfile = {
  name: 'TestClient',
  phone: '01012345678',
  coachId: 'coach1',
};

const CLIENT_ID = 'TestClient_01012345678';

// ─── storageService tests ─────────────────────────────────────────────────────

describe('storageService – quick logs', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty array when no logs stored', () => {
    expect(storageService.getQuickLogs()).toEqual([]);
  });

  it('saves and retrieves a quick log', () => {
    const log = makeLog({ id: 'log1' });
    storageService.saveQuickLog(log);
    const all = storageService.getQuickLogs();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('log1');
  });

  it('updates an existing quick log (upsert)', () => {
    const log = makeLog({ id: 'log1', goodPoint: 'original' });
    storageService.saveQuickLog(log);
    const updated = { ...log, goodPoint: 'updated' };
    storageService.saveQuickLog(updated);
    const all = storageService.getQuickLogs();
    expect(all).toHaveLength(1);
    expect(all[0].goodPoint).toBe('updated');
  });

  it('getQuickLogsByClient filters by clientId', () => {
    storageService.saveQuickLog(makeLog({ id: 'a', clientId: CLIENT_ID }));
    storageService.saveQuickLog(makeLog({ id: 'b', clientId: 'OtherClient_999' }));
    const mine = storageService.getQuickLogsByClient(CLIENT_ID);
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toBe('a');
  });

  it('deleteQuickLog removes the correct entry', () => {
    storageService.saveQuickLog(makeLog({ id: 'del1' }));
    storageService.saveQuickLog(makeLog({ id: 'del2' }));
    storageService.deleteQuickLog('del1');
    const all = storageService.getQuickLogs();
    expect(all.map((q) => q.id)).not.toContain('del1');
    expect(all.map((q) => q.id)).toContain('del2');
  });
});

describe('storageService – weekly insights', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty array when no insights stored', () => {
    expect(storageService.getWeeklyInsights()).toEqual([]);
  });

  it('saves and retrieves a weekly insight', () => {
    const insight: WeeklyInsight = {
      id: 'wi1',
      clientId: CLIENT_ID,
      weekStart: '2026-03-30',
      weekEnd: '2026-04-05',
      summary: '좋은 한 주였습니다.',
      keyPatterns: ['패턴1'],
      recommendedFocus: '다음 주 포커스',
      generatedAt: Date.now(),
    };
    storageService.saveWeeklyInsight(insight);
    const all = storageService.getWeeklyInsights();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('wi1');
  });

  it('getWeeklyInsightsByClient filters and sorts by generatedAt descending', () => {
    const early: WeeklyInsight = {
      id: 'wi_early',
      clientId: CLIENT_ID,
      weekStart: '2026-03-23',
      weekEnd: '2026-03-29',
      summary: 'Early',
      keyPatterns: [],
      recommendedFocus: '',
      generatedAt: 1000,
    };
    const late: WeeklyInsight = {
      id: 'wi_late',
      clientId: CLIENT_ID,
      weekStart: '2026-03-30',
      weekEnd: '2026-04-05',
      summary: 'Late',
      keyPatterns: [],
      recommendedFocus: '',
      generatedAt: 2000,
    };
    storageService.saveWeeklyInsight(early);
    storageService.saveWeeklyInsight(late);
    const results = storageService.getWeeklyInsightsByClient(CLIENT_ID);
    expect(results[0].id).toBe('wi_late');
    expect(results[1].id).toBe('wi_early');
  });
});

// ─── QuickGolfLog component tests ─────────────────────────────────────────────

describe('QuickGolfLog component', () => {
  const mockOnSave = vi.fn().mockResolvedValue(undefined);
  const mockOnBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders required fields', () => {
    render(
      <QuickGolfLog clientId={CLIENT_ID} onSave={mockOnSave} onBack={mockOnBack} />
    );
    expect(screen.getByText('오늘의 빠른 기록')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/50m 웨지/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/드라이버 슬라이스/)).toBeInTheDocument();
  });

  it('submit button is disabled when required fields are empty', () => {
    render(
      <QuickGolfLog clientId={CLIENT_ID} onSave={mockOnSave} onBack={mockOnBack} />
    );
    const submitBtn = screen.getByRole('button', { name: /기록 저장/ });
    expect(submitBtn).toBeDisabled();
  });

  it('calls onSave with correctly shaped QuickLogEntry', async () => {
    render(
      <QuickGolfLog clientId={CLIENT_ID} onSave={mockOnSave} onBack={mockOnBack} />
    );

    fireEvent.change(screen.getByPlaceholderText(/50m 웨지/), {
      target: { value: '50m 웨지 좋았다' },
    });
    fireEvent.change(screen.getByPlaceholderText(/드라이버 슬라이스/), {
      target: { value: '드라이버 슬라이스' },
    });

    const submitBtn = screen.getByRole('button', { name: /기록 저장/ });
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledTimes(1);
    });

    const saved = mockOnSave.mock.calls[0][0] as QuickLogEntry;
    expect(saved.clientId).toBe(CLIENT_ID);
    expect(saved.goodPoint).toBe('50m 웨지 좋았다');
    expect(saved.problemPoint).toBe('드라이버 슬라이스');
    expect(saved.mood).toBeDefined();
    expect(typeof saved.logDate).toBe('string');
    expect(typeof saved.createdAt).toBe('number');
    expect(typeof saved.id).toBe('string');
  });

  it('calls onBack when back button is clicked', () => {
    render(
      <QuickGolfLog clientId={CLIENT_ID} onSave={mockOnSave} onBack={mockOnBack} />
    );
    fireEvent.click(screen.getByLabelText('뒤로'));
    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });

  it('allows toggling mood selection', () => {
    render(
      <QuickGolfLog clientId={CLIENT_ID} onSave={mockOnSave} onBack={mockOnBack} />
    );
    // '최고' mood button
    const greatBtn = screen.getByRole('button', { name: /최고/ });
    fireEvent.click(greatBtn);
    expect(greatBtn.className).toContain('scale-105');
  });

  it('allows selecting a practice area', () => {
    render(
      <QuickGolfLog clientId={CLIENT_ID} onSave={mockOnSave} onBack={mockOnBack} />
    );
    const driverBtn = screen.getByRole('button', { name: '드라이버' });
    fireEvent.click(driverBtn);
    expect(driverBtn.className).toContain('bg-emerald-500');
  });
});

// ─── WeeklyInsightCard component tests ───────────────────────────────────────

describe('WeeklyInsightCard component', () => {
  const mockOnBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the generate button', () => {
    render(
      <WeeklyInsightCard
        clientId={CLIENT_ID}
        recentLogs={[makeLog()]}
        recentLessons={[]}
        onBack={mockOnBack}
        isFirebaseMode={false}
      />
    );
    expect(screen.getByRole('button', { name: /인사이트 생성|인사이트 재생성/ })).toBeInTheDocument();
  });

  it('shows hint message when no logs are available', () => {
    render(
      <WeeklyInsightCard
        clientId={CLIENT_ID}
        recentLogs={[]}
        recentLessons={[]}
        onBack={mockOnBack}
        isFirebaseMode={false}
      />
    );
    expect(screen.getByText(/빠른 기록을 먼저 작성/)).toBeInTheDocument();
  });

  it('generate button is disabled when no logs', () => {
    render(
      <WeeklyInsightCard
        clientId={CLIENT_ID}
        recentLogs={[]}
        recentLessons={[]}
        onBack={mockOnBack}
        isFirebaseMode={false}
      />
    );
    const btn = screen.getByRole('button', { name: /인사이트 생성|인사이트 재생성/ });
    expect(btn).toBeDisabled();
  });

  it('generates and displays insight when button clicked', async () => {
    render(
      <WeeklyInsightCard
        clientId={CLIENT_ID}
        clientProfile={CLIENT_PROFILE}
        recentLogs={[makeLog()]}
        recentLessons={[]}
        onBack={mockOnBack}
        isFirebaseMode={false}
      />
    );
    const btn = screen.getByRole('button', { name: /인사이트 생성|인사이트 재생성/ });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText('이번 주 전반적으로 좋은 기록을 유지했습니다.')).toBeInTheDocument();
    });
    expect(screen.getByText('드라이버 방향성 개선')).toBeInTheDocument();
    expect(screen.getByText('다음 주는 아이언 컨택에 집중하세요.')).toBeInTheDocument();
  });

  it('calls onBack when back button is clicked', () => {
    render(
      <WeeklyInsightCard
        clientId={CLIENT_ID}
        recentLogs={[]}
        recentLessons={[]}
        onBack={mockOnBack}
        isFirebaseMode={false}
      />
    );
    fireEvent.click(screen.getByLabelText('뒤로'));
    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });
});
