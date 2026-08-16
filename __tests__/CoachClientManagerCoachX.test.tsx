/**
 * Tests for CoachX integration in CoachClientManager:
 * 1. CoachX trend badge is shown next to a member's name when a report is provided.
 * 2. "Ask CoachX" button does not render in the Student information list.
 * 3. Full report button still renders when onOpenCoachX and report are present.
 * 4. No CoachX report actions when there is no report for the member.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { CoachClientManager } from '../components/CoachClientManager';
import { MemberGrowthReport } from '../services/coachXService';
import { ClientProfile } from '../types';

// ─── LanguageProvider mock ────────────────────────────────────────────────────
// CoachClientManager now uses useLanguage for CoachX-related strings.
vi.mock('../components/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'ko',
    t: (key: string) => {
      const map: Record<string, string> = {
        coachx_trend_improving: '성장 중',
        coachx_trend_plateau: '정체 구간',
        coachx_trend_inactive: '장기 미레슨',
        coachx_trend_new: '초기 단계',
        coachx_stat_lessons: '레슨 기록',
        coachx_view_full_report: '분석 리포트',
        coach_client_linking_guide:
          '회원은 학생 앱에서 직접 가입한 뒤 담당 코치를 지정하면 연동됩니다.',
      };
      return map[key] ?? key;
    },
  }),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CLIENT: ClientProfile = {
  name: '김테스트',
  phone: '01011112222',
  coachId: 'coach1',
};

const CLIENT_NO_REPORT: ClientProfile = {
  name: '이노리포트',
  phone: '01033334444',
  coachId: 'coach1',
};

const IMPROVING_REPORT: MemberGrowthReport = {
  clientName: CLIENT.name,
  clientPhone: CLIENT.phone,
  lessonCount: 5,
  lastLessonDate: '2026-03-01',
  daysSinceLastLesson: 10,
  trendIndicator: 'improving',
  attentionLevel: 'low',
  repeatedIssues: [],
  recentTopics: ['그립'],
  strengths: [],
  suggestedNextLesson: '',
  curriculumPlan: ['1회'],
  curriculumPlan5: ['1회', '2회', '3회', '4회', '5회'],
  drillSuggestions: [],
  growthScore: 60,
  issueResolutionRate: 1,
  lessonCadence: 7,
  topicProgressionStages: { early: [], recent: ['그립'] },
  weeklyActivity: [],
};

const PLATEAU_REPORT: MemberGrowthReport = {
  ...IMPROVING_REPORT,
  trendIndicator: 'plateau',
  attentionLevel: 'high',
};

const DEFAULT_PROPS = {
  clients: [CLIENT, CLIENT_NO_REPORT],
  onUpdate: vi.fn(),
  onDelete: vi.fn(),
  onBack: vi.fn(),
  coachId: 'coach1',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CoachClientManager – CoachX integration', () => {
  it('shows CoachX trend badge when a matching report is provided', () => {
    render(
      <CoachClientManager
        {...DEFAULT_PROPS}
        memberReports={[IMPROVING_REPORT]}
      />
    );
    expect(screen.getByText('성장 중')).toBeTruthy();
  });

  it('shows plateau trend badge correctly', () => {
    render(
      <CoachClientManager
        {...DEFAULT_PROPS}
        memberReports={[PLATEAU_REPORT]}
      />
    );
    expect(screen.getByText('정체 구간')).toBeTruthy();
  });

  it('does not render Ask CoachX button in student information cards', () => {
    render(
      <CoachClientManager
        {...DEFAULT_PROPS}
        memberReports={[IMPROVING_REPORT]}
        onOpenCoachX={vi.fn()}
      />
    );
    expect(screen.queryByTestId(`coachx-btn-${CLIENT.name}`)).toBeNull();
  });

  it('renders full report button when onOpenCoachX and report are both present', () => {
    render(
      <CoachClientManager
        {...DEFAULT_PROPS}
        memberReports={[IMPROVING_REPORT]}
        onOpenCoachX={vi.fn()}
      />
    );
    expect(screen.getByTestId(`growth-report-btn-${CLIENT.name}`)).toBeTruthy();
    expect(screen.getByText('분석 리포트')).toBeTruthy();
  });

  it('renders lesson-record button and opens member lesson list when clicked', () => {
    const onViewLessons = vi.fn();
    render(
      <CoachClientManager
        {...DEFAULT_PROPS}
        onViewLessons={onViewLessons}
      />
    );

    fireEvent.click(screen.getByTestId(`view-lessons-btn-${CLIENT.name}`));
    expect(onViewLessons).toHaveBeenCalledWith(CLIENT);
  });

  it('does not render CoachX report buttons when onOpenCoachX is not provided', () => {
    render(
      <CoachClientManager
        {...DEFAULT_PROPS}
        memberReports={[IMPROVING_REPORT]}
        // onOpenCoachX intentionally omitted
      />
    );
    expect(screen.queryByTestId(`coachx-btn-${CLIENT.name}`)).toBeNull();
    expect(screen.queryByTestId(`growth-report-btn-${CLIENT.name}`)).toBeNull();
  });

  it('does not render CoachX report buttons for members with no report', () => {
    render(
      <CoachClientManager
        {...DEFAULT_PROPS}
        memberReports={[IMPROVING_REPORT]}
        onOpenCoachX={vi.fn()}
      />
    );
    // CLIENT_NO_REPORT has no entry in memberReports
    expect(screen.queryByTestId(`coachx-btn-${CLIENT_NO_REPORT.name}`)).toBeNull();
    expect(screen.queryByTestId(`growth-report-btn-${CLIENT_NO_REPORT.name}`)).toBeNull();
  });

  it('shows no trend badge when memberReports is not provided', () => {
    render(
      <CoachClientManager
        {...DEFAULT_PROPS}
        // memberReports intentionally omitted
      />
    );
    // None of the trend labels should appear
    expect(screen.queryByText('성장 중')).toBeNull();
    expect(screen.queryByText('정체 구간')).toBeNull();
  });
});

describe('CoachClientManager – no coach-side member registration', () => {
  it('renders no add-member button, FAB, or form', () => {
    render(<CoachClientManager {...DEFAULT_PROPS} />);
    expect(screen.queryByTestId('coach-client-add-btn')).toBeNull();
    expect(screen.queryByTestId('coach-client-add-fab')).toBeNull();
    expect(screen.queryByTestId('coach-client-add-modal')).toBeNull();
  });

  it('tells the coach how members link themselves instead', () => {
    render(<CoachClientManager {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('coach-client-linking-guide')).toBeTruthy();
  });

  it('edits the private coach note without touching the student-owned fields', () => {
    const onUpdate = vi.fn();
    const withNotes = {
      ...CLIENT,
      memo: '올해 목표는 깨백',
      coachMemo: '어깨 회전 부족',
    };
    render(
      <CoachClientManager
        {...DEFAULT_PROPS}
        clients={[withNotes]}
        onUpdate={onUpdate}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: '' })[0]);
    const textarea = screen.getByTestId('coach-client-coach-memo-input');
    // The form is seeded from coachMemo, never from the student's bio.
    expect((textarea as HTMLTextAreaElement).value).toBe('어깨 회전 부족');

    fireEvent.change(textarea, { target: { value: '상체 조기 신전 교정 중' } });
    fireEvent.click(screen.getByText('coach_client_save_btn'));

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        coachMemo: '상체 조기 신전 교정 중',
        // Student-owned fields pass through untouched.
        memo: '올해 목표는 깨백',
        name: CLIENT.name,
        phone: CLIENT.phone,
      })
    );
  });

  it('opens an edit form whose name and phone are read-only', () => {
    const onUpdate = vi.fn();
    render(<CoachClientManager {...DEFAULT_PROPS} onUpdate={onUpdate} />);

    // The edit affordance is the only way into the modal now.
    fireEvent.click(screen.getAllByRole('button', { name: '' })[0]);
    const modal = screen.getByTestId('coach-client-edit-modal');
    expect(modal).toBeTruthy();
    // Identity is rendered as text, never as an editable input.
    expect(screen.getByTestId('coach-client-name-readonly').tagName).toBe('P');
    expect(screen.getByTestId('coach-client-phone-readonly').tagName).toBe('P');
    expect(modal.querySelector('input[type="tel"]')).toBeNull();
  });
});

describe('CoachClientManager – pageTitle prop', () => {
  it('shows default coach_client_title when pageTitle is not provided', () => {
    render(<CoachClientManager {...DEFAULT_PROPS} />);
    expect(screen.getByText('coach_client_title')).toBeTruthy();
  });

  it('shows custom pageTitle instead of default title when pageTitle is provided', () => {
    render(
      <CoachClientManager
        {...DEFAULT_PROPS}
        pageTitle="정밀진단 프로그램"
      />
    );
    expect(screen.getByText('정밀진단 프로그램')).toBeTruthy();
    expect(screen.queryByText('coach_client_title')).toBeNull();
  });

  it('shows training program generate button per client when onGenerateProgram is provided', () => {
    const onGenerateProgram = vi.fn();
    render(
      <CoachClientManager
        {...DEFAULT_PROPS}
        pageTitle="정밀진단 프로그램"
        onGenerateProgram={onGenerateProgram}
      />
    );
    // The generate-program button key falls back to the translation key in this mock
    const btns = screen.getAllByText('coach_client_training_create');
    expect(btns.length).toBeGreaterThan(0);
    fireEvent.click(btns[0]);
    expect(onGenerateProgram).toHaveBeenCalled();
  });
});
