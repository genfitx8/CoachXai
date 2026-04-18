/**
 * Tests for CoachX Intelligence Service:
 * 1. buildMemberGrowthReports returns correct fields from lesson data.
 * 2. trendIndicator is 'new' for members with fewer than 3 lessons.
 * 3. trendIndicator is 'inactive' when last lesson was more than 45 days ago.
 * 4. trendIndicator is 'plateau' when the same topic dominates early and recent lessons.
 * 5. trendIndicator is 'improving' when recent topics differ from early topics.
 * 6. curriculumPlan5 always contains exactly 5 items.
 * 7. drillSuggestions are non-empty.
 * 8. generateCoachInsights returns at least one insight even with no lessons.
 * 9. generateCoachInsights includes stagnation insight for inactive members.
 * 10. generateHeuristicResponse matches member-specific query by client name.
 * 11. generateHeuristicResponse handles plateau query.
 */

import { describe, it, expect } from 'vitest';
import {
  buildMemberGrowthReports,
  generateCoachInsights,
  generateHeuristicResponse,
} from '../services/coachXService';
import { Lesson, ClientProfile, CoachProfile } from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const now = Date.now();
const daysAgo = (n: number) => now - n * 86_400_000;

function makeLesson(
  overrides: Partial<Lesson> & { clientName: string; clientPhone: string }
): Lesson {
  return {
    id: Math.random().toString(36).slice(2),
    coachId: 'coach1',
    clientName: overrides.clientName,
    clientPhone: overrides.clientPhone,
    title: overrides.title ?? '레슨',
    date: overrides.date ?? new Date(daysAgo(7)).toISOString().split('T')[0],
    coachNotes: overrides.coachNotes ?? '',
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? daysAgo(7),
    videoUrl: '',
    mediaType: 'video',
    createdBy: 'COACH',
    photos: [],
    status: 'completed',
    type: 'lesson',
  } as unknown as Lesson;
}

const baseClient: ClientProfile = {
  name: '김민준',
  phone: '01011112222',
  email: '',
  coachId: 'coach1',
};

const baseCoach: CoachProfile = {
  id: 'coach1',
  name: '이코치',
  email: 'coach@test.com',
  phone: '01099998888',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildMemberGrowthReports', () => {
  it('returns empty array when no lessons provided', () => {
    const reports = buildMemberGrowthReports([], []);
    expect(reports).toHaveLength(0);
  });

  it('groups lessons by clientName+clientPhone and returns one report per member', () => {
    const lessons = [
      makeLesson({ clientName: '김민준', clientPhone: '01011112222' }),
      makeLesson({ clientName: '김민준', clientPhone: '01011112222' }),
      makeLesson({ clientName: '박지수', clientPhone: '01033334444' }),
    ];
    const reports = buildMemberGrowthReports(lessons, []);
    expect(reports).toHaveLength(2);
  });

  it('report contains all required fields', () => {
    const lessons = [
      makeLesson({ clientName: '김민준', clientPhone: '01011112222' }),
    ];
    const [report] = buildMemberGrowthReports(lessons, [baseClient]);
    expect(report).toHaveProperty('clientName', '김민준');
    expect(report).toHaveProperty('trendIndicator');
    expect(report).toHaveProperty('lastLessonDate');
    expect(report).toHaveProperty('daysSinceLastLesson');
    expect(report).toHaveProperty('curriculumPlan5');
    expect(report).toHaveProperty('drillSuggestions');
  });

  it('trendIndicator is "new" for a member with fewer than 3 lessons', () => {
    const lessons = [
      makeLesson({ clientName: '김민준', clientPhone: '01011112222', date: new Date(daysAgo(5)).toISOString().split('T')[0] }),
      makeLesson({ clientName: '김민준', clientPhone: '01011112222', date: new Date(daysAgo(3)).toISOString().split('T')[0] }),
    ];
    const [report] = buildMemberGrowthReports(lessons, []);
    expect(report.trendIndicator).toBe('new');
  });

  it('trendIndicator is "inactive" when last lesson was more than 45 days ago', () => {
    const lessons = [
      makeLesson({ clientName: '김민준', clientPhone: '01011112222', date: new Date(daysAgo(60)).toISOString().split('T')[0], createdAt: daysAgo(60) }),
      makeLesson({ clientName: '김민준', clientPhone: '01011112222', date: new Date(daysAgo(70)).toISOString().split('T')[0], createdAt: daysAgo(70) }),
      makeLesson({ clientName: '김민준', clientPhone: '01011112222', date: new Date(daysAgo(80)).toISOString().split('T')[0], createdAt: daysAgo(80) }),
    ];
    const [report] = buildMemberGrowthReports(lessons, []);
    expect(report.trendIndicator).toBe('inactive');
  });

  it('trendIndicator is "plateau" when the same issue dominates early and recent lessons', () => {
    // 6 lessons all mentioning '슬라이스' – same topic throughout
    const lessons = Array.from({ length: 6 }, (_, i) =>
      makeLesson({
        clientName: '박지수',
        clientPhone: '01033334444',
        title: '슬라이스 교정',
        coachNotes: '슬라이스 반복',
        date: new Date(daysAgo(50 - i * 5)).toISOString().split('T')[0],
        createdAt: daysAgo(50 - i * 5),
      })
    );
    const [report] = buildMemberGrowthReports(lessons, []);
    expect(report.trendIndicator).toBe('plateau');
  });

  it('trendIndicator is "improving" when recent topics differ from early topics', () => {
    const earlyLessons = Array.from({ length: 3 }, (_, i) =>
      makeLesson({
        clientName: '이영수',
        clientPhone: '01055556666',
        title: '슬라이스 교정',
        coachNotes: '슬라이스',
        date: new Date(daysAgo(40 + i * 5)).toISOString().split('T')[0],
        createdAt: daysAgo(40 + i * 5),
      })
    );
    const recentLessons = Array.from({ length: 3 }, (_, i) =>
      makeLesson({
        clientName: '이영수',
        clientPhone: '01055556666',
        title: '임팩트 감각',
        coachNotes: '임팩트 드릴',
        date: new Date(daysAgo(5 + i)).toISOString().split('T')[0],
        createdAt: daysAgo(5 + i),
      })
    );
    const [report] = buildMemberGrowthReports([...earlyLessons, ...recentLessons], []);
    expect(report.trendIndicator).toBe('improving');
  });

  it('curriculumPlan5 always has exactly 5 sessions', () => {
    const lessons = Array.from({ length: 4 }, (_, i) =>
      makeLesson({ clientName: '최서연', clientPhone: '01077778888', date: new Date(daysAgo(i * 7)).toISOString().split('T')[0], createdAt: daysAgo(i * 7) })
    );
    const [report] = buildMemberGrowthReports(lessons, []);
    expect(report.curriculumPlan5).toHaveLength(5);
  });

  it('drillSuggestions is non-empty', () => {
    const lessons = [
      makeLesson({ clientName: '최서연', clientPhone: '01077778888', title: '슬라이스 교정', coachNotes: '슬라이스' }),
    ];
    const [report] = buildMemberGrowthReports(lessons, []);
    expect(report.drillSuggestions.length).toBeGreaterThan(0);
  });

  it('lastLessonDate matches the most recent lesson date', () => {
    const lessons = [
      makeLesson({ clientName: '김민준', clientPhone: '01011112222', date: '2024-01-10', createdAt: daysAgo(30) }),
      makeLesson({ clientName: '김민준', clientPhone: '01011112222', date: '2024-01-20', createdAt: daysAgo(10) }),
    ];
    const [report] = buildMemberGrowthReports(lessons, []);
    expect(report.lastLessonDate).toBe('2024-01-20');
  });
});

describe('generateCoachInsights', () => {
  it('returns at least one insight when no lessons provided', () => {
    const insights = generateCoachInsights([], baseCoach);
    expect(insights.length).toBeGreaterThanOrEqual(1);
  });

  it('includes a pattern insight when lessons exist', () => {
    const lessons = [
      makeLesson({ clientName: '김민준', clientPhone: '01011112222', title: '슬라이스 교정', coachNotes: '슬라이스' }),
    ];
    const insights = generateCoachInsights(lessons, baseCoach);
    const types = insights.map(i => i.type);
    expect(types).toContain('pattern');
  });

  it('includes stagnation insight for inactive members (>45 days)', () => {
    const lessons = [
      makeLesson({ clientName: '김민준', clientPhone: '01011112222', date: new Date(daysAgo(60)).toISOString().split('T')[0], createdAt: daysAgo(60) }),
    ];
    const insights = generateCoachInsights(lessons, baseCoach);
    const hasStagnation = insights.some(i => i.type === 'stagnation');
    expect(hasStagnation).toBe(true);
  });
});

describe('generateHeuristicResponse', () => {
  it('returns a response with member name when queried with a known member name', () => {
    const lessons = [
      makeLesson({ clientName: '김민준', clientPhone: '01011112222', title: '슬라이스', coachNotes: '슬라이스' }),
    ];
    const response = generateHeuristicResponse('김민준 회원 분석해줘', lessons, [baseClient]);
    expect(response).toContain('김민준');
  });

  it('handles plateau query and returns plateau analysis', () => {
    const lessons = [
      makeLesson({ clientName: '박지수', clientPhone: '01033334444' }),
    ];
    const response = generateHeuristicResponse('정체 중인 회원 있어?', lessons, []);
    expect(response.toLowerCase()).toMatch(/정체|plateau/i);
  });

  it('returns default help response for unknown query', () => {
    const response = generateHeuristicResponse('알 수 없는 질문', [], []);
    expect(response).toContain('CoachX');
  });

  it('includes 5-session curriculum when curriculum is requested', () => {
    const lessons = [makeLesson({ clientName: '이영수', clientPhone: '01055556666', title: '슬라이스', coachNotes: '슬라이스' })];
    const response = generateHeuristicResponse('커리큘럼 추천해줘', lessons, []);
    // Should mention 5 sessions (1️⃣ through 5️⃣ or "5")
    expect(response).toMatch(/5|五/);
  });
});
