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
  onAdd: vi.fn(),
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
