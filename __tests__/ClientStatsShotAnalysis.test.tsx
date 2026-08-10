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
// Component now calls the streaming variant; the mock forwards onChunk
// with the resolved markdown so tests exercise the full stream → final
// setAiReport path (mimicking real chunked delivery in one tick).
const analyzeShotStrategyMock = vi.fn();
vi.mock('../services/geminiService', () => ({
  analyzeShotStrategyStream: async (params: {
    onChunk?: (delta: string, accumulated: string) => void;
    [k: string]: unknown;
  }) => {
    const result = await analyzeShotStrategyMock(params);
    if (result && typeof result.markdown === 'string' && params.onChunk) {
      params.onChunk(result.markdown, result.markdown);
    }
    return result;
  },
}));

// Track coachStyleService calls so we can verify the star flow persists
// the exact snapshot without hitting real storage.
const styleSaveMock = vi.fn();
const styleDeleteMock = vi.fn();
vi.mock('../services/coachStyleService', () => ({
  coachStyleService: {
    save: (...args: unknown[]) => styleSaveMock(...args),
    delete: (...args: unknown[]) => styleDeleteMock(...args),
  },
  tierForSource: () => 1 as const,
}));

// Firebase is not initialised in tests; the component asks isInitialized()
// only to route save through the right backend.
vi.mock('../services/firebase', () => ({
  firebaseService: { isInitialized: () => false },
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
  styleSaveMock.mockReset();
  styleDeleteMock.mockReset();
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

  it('star button saves the current report as a coach style exemplar', async () => {
    analyzeShotStrategyMock.mockResolvedValue({
      markdown: '## 리포트 내용\n7I 캐리 135m',
      contributingLessonCount: 3,
      clubsAnalysed: ['7I', 'DRIVER'],
    });
    styleSaveMock.mockResolvedValue(undefined);

    render(
      <ClientStats
        lessons={[
          makeLesson({ id: '1', club: '7I', golfData: { carryDistance: 133 } }),
          makeLesson({ id: '2', club: '7I', golfData: { carryDistance: 135 } }),
        ]}
        onBack={() => {}}
        clientProfile={client}
        coachId="coach-A"
      />
    );

    // Generate the report first.
    fireEvent.click(screen.getByRole('button', { name: /종합 분석 리포트 생성/ }));
    await waitFor(() => expect(screen.getByTestId('md')).toBeInTheDocument());

    // Star it — button is "즐겨찾기" until it's saved.
    const starBtn = screen.getByRole('button', { name: /이 리포트를 즐겨찾기로 저장/ });
    fireEvent.click(starBtn);

    await waitFor(() => expect(styleSaveMock).toHaveBeenCalledTimes(1));
    const [exemplar, isFirebaseMode] = styleSaveMock.mock.calls[0];
    expect(isFirebaseMode).toBe(false);
    expect(exemplar.target).toBe('shot_analysis');
    expect(exemplar.source).toBe('starred');
    expect(exemplar.tier).toBe(1);
    expect(exemplar.coachId).toBe('coach-A');
    // Input snapshot should carry client + club summary — the data needed
    // for later few-shot injection.
    expect(exemplar.input).toContain('김철수');
    expect(exemplar.input).toContain('7I');
    expect(exemplar.input).toContain('DRIVER');
    expect(exemplar.output).toContain('7I 캐리 135m');

    // After saving the button flips to "즐겨찾기 됨".
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /즐겨찾기 해제/ })).toBeInTheDocument()
    );
  });

  it('re-generating a report resets the starred state', async () => {
    analyzeShotStrategyMock
      .mockResolvedValueOnce({
        markdown: 'first',
        contributingLessonCount: 1,
        clubsAnalysed: ['7I'],
      })
      .mockResolvedValueOnce({
        markdown: 'second',
        contributingLessonCount: 1,
        clubsAnalysed: ['7I'],
      });
    styleSaveMock.mockResolvedValue(undefined);

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
    await waitFor(() => expect(screen.getByTestId('md')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /이 리포트를 즐겨찾기로 저장/ }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /즐겨찾기 해제/ })).toBeInTheDocument()
    );

    // Regenerate; the new output invalidates the previous star.
    fireEvent.click(screen.getByRole('button', { name: '다시 생성' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /이 리포트를 즐겨찾기로 저장/ })).toBeInTheDocument()
    );
  });

  it('edit-and-save persists an "edited" exemplar and updates the visible report', async () => {
    analyzeShotStrategyMock.mockResolvedValue({
      markdown: '## AI 초안\nAI가 작성한 원본 내용',
      contributingLessonCount: 5,
      clubsAnalysed: ['7I', 'PW'],
    });
    styleSaveMock.mockResolvedValue(undefined);

    render(
      <ClientStats
        lessons={[
          makeLesson({ id: '1', club: '7I', golfData: { carryDistance: 133 } }),
          makeLesson({ id: '2', club: '7I', golfData: { carryDistance: 135 } }),
        ]}
        onBack={() => {}}
        clientProfile={client}
        coachId="coach-edit"
      />
    );

    // Generate the report so an aiReport exists to edit.
    fireEvent.click(screen.getByRole('button', { name: /종합 분석 리포트 생성/ }));
    await waitFor(() => expect(screen.getByTestId('md')).toBeInTheDocument());

    // Enter edit mode.
    fireEvent.click(screen.getByRole('button', { name: /편집 후 저장/ }));

    const textarea = await screen.findByRole('textbox');
    fireEvent.change(textarea, {
      target: {
        value: '## 코치 편집본\n코치님이 손질한 최종 문장 — 스윙코드 스타일 반영',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /편집본 저장/ }));

    await waitFor(() => expect(styleSaveMock).toHaveBeenCalledTimes(1));
    const [exemplar, isFirebaseMode] = styleSaveMock.mock.calls[0];
    expect(isFirebaseMode).toBe(false);
    expect(exemplar.target).toBe('shot_analysis');
    expect(exemplar.source).toBe('edited');
    // tierForSource('edited') returns 2 — mocked to 1 in this suite, so
    // just verify it's the numeric tier the service produced (mock returns 1).
    expect(typeof exemplar.tier).toBe('number');
    expect(exemplar.coachId).toBe('coach-edit');
    expect(exemplar.output).toContain('코치 편집본');
    // The visible markdown flips to the coach's edited version and the
    // "편집본 저장됨" chip appears.
    await waitFor(() =>
      expect(screen.getByTestId('md').textContent).toContain('코치 편집본')
    );
    expect(screen.getByText('편집본 저장됨')).toBeInTheDocument();
    // Edit textarea is gone (back to render mode).
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('cancelling edit mode restores the original report untouched', async () => {
    analyzeShotStrategyMock.mockResolvedValue({
      markdown: '## 원본\n원본 문장',
      contributingLessonCount: 3,
      clubsAnalysed: ['7I'],
    });

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
    await waitFor(() => expect(screen.getByTestId('md')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /편집 후 저장/ }));
    const textarea = await screen.findByRole('textbox');
    fireEvent.change(textarea, { target: { value: '이건 취소될 편집' } });
    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    // No save happened.
    expect(styleSaveMock).not.toHaveBeenCalled();
    // Textarea is gone, original markdown still rendered.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('md').textContent).toContain('원본 문장');
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
