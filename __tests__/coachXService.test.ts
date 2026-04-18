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
  generateCoachGrowthProfile,
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

describe('buildMemberGrowthReports (language)', () => {
  it('generates Korean curriculum labels by default', () => {
    const lessons = Array.from({ length: 4 }, (_, i) =>
      makeLesson({
        clientName: '박지수',
        clientPhone: '01033334444',
        title: '임팩트 감각',
        date: new Date(daysAgo(i * 7)).toISOString().split('T')[0],
        createdAt: daysAgo(i * 7),
      })
    );
    const [report] = buildMemberGrowthReports(lessons, []);
    expect(report.curriculumPlan5[0]).toMatch(/회차/);
  });

  it('generates English curriculum labels when language is "en"', () => {
    const lessons = Array.from({ length: 4 }, (_, i) =>
      makeLesson({
        clientName: '박지수',
        clientPhone: '01033334444',
        title: 'impact',
        date: new Date(daysAgo(i * 7)).toISOString().split('T')[0],
        createdAt: daysAgo(i * 7),
      })
    );
    const [report] = buildMemberGrowthReports(lessons, [], 'en');
    expect(report.curriculumPlan5[0]).toMatch(/Session/i);
  });

  it('generates Japanese curriculum labels when language is "ja"', () => {
    const lessons = Array.from({ length: 4 }, (_, i) =>
      makeLesson({
        clientName: '박지수',
        clientPhone: '01033334444',
        title: 'impact',
        date: new Date(daysAgo(i * 7)).toISOString().split('T')[0],
        createdAt: daysAgo(i * 7),
      })
    );
    const [report] = buildMemberGrowthReports(lessons, [], 'ja');
    expect(report.curriculumPlan5[0]).toMatch(/第/);
  });
});

describe('generateCoachGrowthProfile', () => {
  it('returns zero metrics when no lessons provided', () => {
    const profile = generateCoachGrowthProfile([], []);
    expect(profile.lessonsThisMonth).toBe(0);
    expect(profile.lessonsLastMonth).toBe(0);
    expect(profile.activeMembersCount).toBe(0);
    expect(profile.avgSessionsPerActiveMember).toBe(0);
    expect(profile.topicBreakdown).toHaveLength(0);
    expect(profile.teachingStrengths).toHaveLength(0);
    expect(profile.memberTrends.improving).toBe(0);
  });

  it('counts lessons in the current month correctly', () => {
    const thisMonth = [
      makeLesson({ clientName: '김민준', clientPhone: '01011112222', createdAt: Date.now() }),
      makeLesson({ clientName: '박지수', clientPhone: '01033334444', createdAt: Date.now() - 86_400_000 }),
    ];
    const oldLesson = makeLesson({
      clientName: '이영수',
      clientPhone: '01055556666',
      createdAt: daysAgo(45),
      date: new Date(daysAgo(45)).toISOString().split('T')[0],
    });
    const profile = generateCoachGrowthProfile([...thisMonth, oldLesson], []);
    expect(profile.lessonsThisMonth).toBe(2);
  });

  it('populates topicBreakdown when lessons contain known keywords', () => {
    const lessons = Array.from({ length: 5 }, (_, i) =>
      makeLesson({ clientName: '김민준', clientPhone: '01011112222', title: '슬라이스 교정', coachNotes: '슬라이스' })
    );
    const profile = generateCoachGrowthProfile(lessons, []);
    expect(profile.topicBreakdown.length).toBeGreaterThan(0);
    expect(profile.teachingStrengths.length).toBeGreaterThan(0);
    expect(profile.teachingStrengths[0]).toBe('슬라이스');
  });

  it('identifies growth opportunities as topics not in lesson records', () => {
    // Only teach 슬라이스 – other topics should appear as opportunities
    const lessons = Array.from({ length: 3 }, () =>
      makeLesson({ clientName: '김민준', clientPhone: '01011112222', title: '슬라이스', coachNotes: '슬라이스' })
    );
    const profile = generateCoachGrowthProfile(lessons, []);
    expect(profile.growthOpportunities.length).toBeGreaterThan(0);
    expect(profile.growthOpportunities).not.toContain('슬라이스');
  });

  it('memberTrends reflects report trendIndicators', () => {
    // 3 new members (< 3 lessons each)
    const lessons = [
      makeLesson({ clientName: 'A', clientPhone: '001', date: new Date(daysAgo(5)).toISOString().split('T')[0], createdAt: daysAgo(5) }),
      makeLesson({ clientName: 'B', clientPhone: '002', date: new Date(daysAgo(3)).toISOString().split('T')[0], createdAt: daysAgo(3) }),
    ];
    const profile = generateCoachGrowthProfile(lessons, []);
    const totalTrends = profile.memberTrends.improving + profile.memberTrends.plateau + profile.memberTrends.new + profile.memberTrends.inactive;
    expect(totalTrends).toBe(2); // 2 distinct members
    expect(profile.memberTrends.new).toBe(2);
  });

  it('recommendedActions is non-empty', () => {
    const lessons = [makeLesson({ clientName: '김민준', clientPhone: '01011112222', title: '슬라이스', coachNotes: '슬라이스' })];
    const profile = generateCoachGrowthProfile(lessons, []);
    expect(profile.recommendedActions.length).toBeGreaterThan(0);
  });

  it('avgSessionsPerActiveMember is 0 when no lessons in last 90 days', () => {
    const lessons = [
      makeLesson({ clientName: '김민준', clientPhone: '01011112222', date: new Date(daysAgo(100)).toISOString().split('T')[0], createdAt: daysAgo(100) }),
    ];
    const profile = generateCoachGrowthProfile(lessons, []);
    expect(profile.activeMembersCount).toBe(0);
    expect(profile.avgSessionsPerActiveMember).toBe(0);
  });

  it('generates English recommended actions when language is "en"', () => {
    const lessons = Array.from({ length: 3 }, () =>
      makeLesson({ clientName: '김민준', clientPhone: '01011112222', title: '슬라이스 교정', coachNotes: '슬라이스' })
    );
    const profile = generateCoachGrowthProfile(lessons, [], 'en');
    expect(profile.recommendedActions.length).toBeGreaterThan(0);
    expect(profile.recommendedActions[0]).toMatch(/slice|visual|drill/i);
  });

  it('generates Japanese recommended actions when language is "ja"', () => {
    const lessons = Array.from({ length: 3 }, () =>
      makeLesson({ clientName: '김민준', clientPhone: '01011112222', title: '슬라이스 교정', coachNotes: '슬라이스' })
    );
    const profile = generateCoachGrowthProfile(lessons, [], 'ja');
    expect(profile.recommendedActions.length).toBeGreaterThan(0);
    expect(profile.recommendedActions[0]).toMatch(/スライス|ドリル|フェース/);
  });
});

describe('generateCoachInsights (multilingual)', () => {
  it('returns English insight titles when language is "en"', () => {
    const lessons = [
      makeLesson({ clientName: '김민준', clientPhone: '01011112222', title: 'slice', coachNotes: 'slice' }),
    ];
    const insights = generateCoachInsights(lessons, baseCoach, 'en');
    const titles = insights.map(i => i.title);
    expect(titles.some(t => /Recurring|Topics|Coach|Curriculum/i.test(t))).toBe(true);
  });

  it('returns Japanese insight titles when language is "ja"', () => {
    const lessons = [
      makeLesson({ clientName: '김민준', clientPhone: '01011112222', title: 'slice', coachNotes: 'slice' }),
    ];
    const insights = generateCoachInsights(lessons, baseCoach, 'ja');
    const titles = insights.map(i => i.title);
    expect(titles.some(t => /テーマ|コーチ|カリキュラム|会員/.test(t))).toBe(true);
  });

  it('returns English no-data message when there are no lessons and language is "en"', () => {
    const insights = generateCoachInsights([], baseCoach, 'en');
    expect(insights[0].title).toMatch(/No lesson/i);
    expect(insights[0].body).toMatch(/Start recording/i);
  });

  it('returns Japanese no-data message when there are no lessons and language is "ja"', () => {
    const insights = generateCoachInsights([], baseCoach, 'ja');
    expect(insights[0].body).toMatch(/レッスン/);
  });

  it('still includes stagnation insight for inactive members (language-agnostic check)', () => {
    const lessons = [
      makeLesson({ clientName: '김민준', clientPhone: '01011112222', date: new Date(daysAgo(60)).toISOString().split('T')[0], createdAt: daysAgo(60) }),
    ];
    // type field is language-independent
    const ko = generateCoachInsights(lessons, baseCoach, 'ko');
    const en = generateCoachInsights(lessons, baseCoach, 'en');
    const ja = generateCoachInsights(lessons, baseCoach, 'ja');
    expect(ko.some(i => i.type === 'stagnation')).toBe(true);
    expect(en.some(i => i.type === 'stagnation')).toBe(true);
    expect(ja.some(i => i.type === 'stagnation')).toBe(true);
  });
});

describe('generateHeuristicResponse (multilingual)', () => {
  it('returns English response for curriculum query when language is "en"', () => {
    const lessons = [makeLesson({ clientName: '이영수', clientPhone: '01055556666', title: 'slice' })];
    const response = generateHeuristicResponse('recommend a curriculum plan', lessons, [], 'en');
    expect(response).toMatch(/Curriculum|Session/i);
    expect(response).not.toMatch(/회차|커리큘럼/);
  });

  it('returns Japanese response for curriculum query when language is "ja"', () => {
    const lessons = [makeLesson({ clientName: '이영수', clientPhone: '01055556666', title: 'slice' })];
    const response = generateHeuristicResponse('カリキュラムを提案して', lessons, [], 'ja');
    expect(response).toMatch(/カリキュラム|推奨/);
  });

  it('returns English response for plateau query when language is "en"', () => {
    const response = generateHeuristicResponse('any members in a plateau?', [], [], 'en');
    expect(response).toMatch(/plateau|inactive/i);
  });

  it('returns Japanese response for plateau query when language is "ja"', () => {
    const response = generateHeuristicResponse('停滞している会員はいる？', [], [], 'ja');
    expect(response).toMatch(/停滞/);
  });

  it('returns English default help response for unknown query when language is "en"', () => {
    const response = generateHeuristicResponse('something unrecognized', [], [], 'en');
    expect(response).toContain('CoachX');
    expect(response).toMatch(/lesson|member/i);
  });

  it('returns language-aware member report for matched client when language is "en"', () => {
    const lessons = [
      makeLesson({ clientName: '김민준', clientPhone: '01011112222', title: 'slice' }),
    ];
    const response = generateHeuristicResponse('김민준 member report', lessons, [baseClient], 'en');
    expect(response).toContain('김민준');
    expect(response).toMatch(/Total lessons|Growth Report/i);
  });

  it('includes 5-session plan keywords in English curriculum response', () => {
    const lessons = [makeLesson({ clientName: '이영수', clientPhone: '01055556666', title: 'impact', coachNotes: 'impact' })];
    const response = generateHeuristicResponse('suggest a curriculum plan', lessons, [], 'en');
    expect(response).toMatch(/5|Session/i);
  });
});

describe('buildMemberGrowthReports (language – 3-session plan)', () => {
  it('generates Korean short curriculum labels by default', () => {
    const lessons = Array.from({ length: 2 }, (_, i) =>
      makeLesson({ clientName: '박지수', clientPhone: '01033334444', createdAt: daysAgo(i * 7) })
    );
    const [report] = buildMemberGrowthReports(lessons, []);
    expect(report.curriculumPlan[0]).toMatch(/회차/);
    expect(report.curriculumPlan).toHaveLength(3);
  });

  it('generates English short curriculum labels when language is "en"', () => {
    const lessons = Array.from({ length: 2 }, (_, i) =>
      makeLesson({ clientName: '박지수', clientPhone: '01033334444', createdAt: daysAgo(i * 7) })
    );
    const [report] = buildMemberGrowthReports(lessons, [], 'en');
    expect(report.curriculumPlan[0]).toMatch(/Session/i);
    expect(report.curriculumPlan[2]).toMatch(/review/i);
  });

  it('generates Japanese short curriculum labels when language is "ja"', () => {
    const lessons = Array.from({ length: 2 }, (_, i) =>
      makeLesson({ clientName: '박지수', clientPhone: '01033334444', createdAt: daysAgo(i * 7) })
    );
    const [report] = buildMemberGrowthReports(lessons, [], 'ja');
    expect(report.curriculumPlan[0]).toMatch(/第/);
  });

  it('generates English suggestedNextLesson when language is "en"', () => {
    const lessons = [
      makeLesson({ clientName: '박지수', clientPhone: '01033334444', title: 'slice', coachNotes: 'slice' }),
    ];
    const [report] = buildMemberGrowthReports(lessons, [], 'en');
    expect(report.suggestedNextLesson).toMatch(/Focus on|review/i);
  });

  it('generates Japanese suggestedNextLesson when language is "ja"', () => {
    const lessons = [
      makeLesson({ clientName: '박지수', clientPhone: '01033334444', title: 'slice', coachNotes: 'slice' }),
    ];
    const [report] = buildMemberGrowthReports(lessons, [], 'ja');
    expect(report.suggestedNextLesson).toMatch(/集中矯正|復習/);
  });
});
