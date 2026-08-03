/**
 * Tests for the AI 종합 분석 리포트 card added to ClientStats.
 *
 * Verifies:
 * 1. Without a clientProfile, the AI report card does not render (backwards
 *    compat for legacy call sites that only pass lessons).
 * 2. With a clientProfile but no ball-data lessons, the button is disabled
 *    and shows the "데이터 부족" copy.
 * 3. With ball data available, clicking the button calls analyzeShotStrategy
 *    (with lessons + coachId) and renders the returned markdown.
 * 4. Error path shows the retry affordance.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClientStats } from '../components/ClientStats';
import { ClientProfile, Lesson } from '../types';

// The service is stubbed so no real fetch fires.
const analyzeShotStrategyMock = vi.fn();
vi.mock('../services/geminiService', () => ({
  analyzeShotStrategy: (...args: unknown[]) => analyzeShotStrategyMock(...args),
}));

// Minimal markdown renderer stub — just dump content so assertions on text work.
vi.mock('../utils/renderMarkdown', () => ({
  renderMarkdown: (md: string) => <div data-testid="md">{md}</div>,
}));

// Recharts renders SVG that isn't relevant here; a lightweight no-op keeps
// the test focused and fast.
vi.mock('recharts', () => {
  const Pass: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
    <div>{children}</div>
  );
  return {
    LineChart: Pass,
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
    ResponsiveContainer: Pass,
    ReferenceLine: () => null,
    AreaChart: Pass,
    Area: () => null,
    BarChart: Pass,
    Bar: () => null,
    Cell: () => null,
  };
});

const client: ClientProfile = {
  id: 'c1',
  name: '김철수',
  phone: '010-0000-0001',
  handicap: 18,
} as ClientProfile;

const makeLesson = (over: Partial<Lesson> & { id: string }): Lesson => ({
  clientName: '김철수',
  clientPhone: '010-0000-0001',
  coachId: 'coach-1',
  createdBy: 'COACH',
  recordType: 'PRACTICE',
  date: '2026-05-15',
  title: '연습',
  coachNotes: '',
  tags: [],
  videoUrl: '',
  mediaType: 'video',
  createdAt: Date.now() - 86_400_000,
  ...over,
});

beforeEach(() => {
  analyzeShotStrategyMock.mockReset();
});

describe('ClientStats · AI 종합 분석 리포트', () => {
  it('does not render the AI report card when clientProfile is omitted', () => {
    render(<ClientStats lessons={[]} onBack={() => {}} />);
    expect(screen.queryByText('AI 종합 분석 리포트')).not.toBeInTheDocument();
  });

  it('renders the card but disables the button when there is no ball data', () => {
    render(
      <ClientStats
        lessons={[makeLesson({ id: '1' })]}
        onBack={() => {}}
        clientProfile={client}
      />
    );
    expect(screen.getByText('AI 종합 분석 리포트')).toBeInTheDocument();
    const btn = screen.getByRole('button', {
      name: /분석할 볼 데이터가 부족합니다/,
    });
    expect(btn).toBeDisabled();
  });

  it('calls analyzeShotStrategy and renders the returned markdown on click', async () => {
    analyzeShotStrategyMock.mockResolvedValue({
      markdown: '## 🎯 실제 샷 분포\n- 7I median 135m',
      contributingLessonCount: 2,
      clubsAnalysed: ['7I'],
    });

    render(
      <ClientStats
        lessons={[
          makeLesson({ id: '1', club: '7I', golfData: { carryDistance: 133 } }),
          makeLesson({ id: '2', club: '7I', golfData: { carryDistance: 135 } }),
        ]}
        onBack={() => {}}
        clientProfile={client}
        coachId="coach-1"
      />
    );

    const btn = screen.getByRole('button', { name: /종합 분석 리포트 생성/ });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);

    // Waits for the report to render.
    await waitFor(() =>
      expect(screen.getByTestId('md').textContent).toContain('실제 샷 분포')
    );

    // Meta line: contributing count + clubs count.
    expect(screen.getByText(/2건의 볼데이터 · 클럽 1종/)).toBeInTheDocument();

    // Service was called with the coachId + full lesson set.
    expect(analyzeShotStrategyMock).toHaveBeenCalledTimes(1);
    const arg = analyzeShotStrategyMock.mock.calls[0][0];
    expect(arg.clientProfile).toBe(client);
    expect(arg.coachId).toBe('coach-1');
    expect(arg.lessons).toHaveLength(2);
  });

  it('shows an error with a retry affordance when the service throws', async () => {
    analyzeShotStrategyMock.mockRejectedValue(new Error('네트워크 오류'));

    render(
      <ClientStats
        lessons={[
          makeLesson({ id: '1', club: '7I', golfData: { carryDistance: 133 } }),
        ]}
        onBack={() => {}}
        clientProfile={client}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /종합 분석 리포트 생성/ }));

    await waitFor(() => expect(screen.getByText('네트워크 오류')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });
});
