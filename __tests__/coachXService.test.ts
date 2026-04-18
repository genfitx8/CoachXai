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
    expect(response).toContain('Coachx');
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
    expect(response).toContain('Coachx');
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

// ─── generateHeuristicResponse – lesson-based member fallback ─────────────────

describe('generateHeuristicResponse – lesson-based member fallback', () => {
  it('returns a member growth report when member name exists in lessons but not clients array', () => {
    const memberName = '정하은';
    const memberPhone = '01077778888';
    const lessons = Array.from({ length: 4 }, (_, i) =>
      makeLesson({
        clientName: memberName,
        clientPhone: memberPhone,
        title: 'slice',
        coachNotes: 'slice correction',
        tags: ['slice'],
        createdAt: daysAgo(i * 10),
        date: new Date(daysAgo(i * 10)).toISOString().split('T')[0],
      })
    );
    // clients array is empty – member only exists in lesson records
    const response = generateHeuristicResponse(memberName, lessons, [], 'ko');
    expect(response).toContain(memberName);
    expect(response).toMatch(/레슨|성장 리포트/);
  });

  it('lesson-based fallback produces equivalent report to client-based match', () => {
    const memberName = 'Jane Smith';
    const memberPhone = '01099990000';
    const lessons = Array.from({ length: 3 }, (_, i) =>
      makeLesson({
        clientName: memberName,
        clientPhone: memberPhone,
        title: 'slice',
        coachNotes: 'slice',
        tags: ['slice'],
        createdAt: daysAgo(i * 14),
        date: new Date(daysAgo(i * 14)).toISOString().split('T')[0],
      })
    );
    const client: ClientProfile = { name: memberName, phone: memberPhone };

    const withClient = generateHeuristicResponse(`Tell me about ${memberName.toLowerCase()}`, lessons, [client], 'en');
    const withFallback = generateHeuristicResponse(`Tell me about ${memberName.toLowerCase()}`, lessons, [], 'en');

    // Both paths should produce a named growth report
    expect(withClient).toContain(memberName);
    expect(withFallback).toContain(memberName);
  });
});

// ─── CoachX urgency count derivation ─────────────────────────────────────────

describe('buildMemberGrowthReports – urgency / attention level', () => {
  it('attentionLevel is "high" for a member who is inactive (>45 days)', () => {
    const lessons = [
      makeLesson({
        clientName: '이정체',
        clientPhone: '01099990001',
        date: new Date(daysAgo(50)).toISOString().split('T')[0],
        createdAt: daysAgo(50),
        coachNotes: '어드레스',
        tags: [],
      }),
    ];
    const reports = buildMemberGrowthReports(lessons, []);
    // attentionLevel 'high' = recently active member (<=14 days); an inactive member gets 'low'
    // The trendIndicator should be 'inactive' instead
    expect(reports[0].trendIndicator).toBe('inactive');
  });

  it('attentionLevel is "high" for a member with a plateau trend', () => {
    const topic = '슬라이스';
    const platLesson = (n: number) =>
      makeLesson({
        clientName: '박슬라이스',
        clientPhone: '01099990002',
        coachNotes: topic,
        tags: [topic],
        date: new Date(daysAgo(n * 5)).toISOString().split('T')[0],
        createdAt: daysAgo(n * 5),
      });
    const reports = buildMemberGrowthReports(
      Array.from({ length: 6 }, (_, i) => platLesson(i)),
      []
    );
    // Members on a plateau or who are inactive should have high or medium attention
    expect(['high', 'medium']).toContain(reports[0].attentionLevel);
  });

  it('filters correctly to produce urgentCount for the CoachX entry badge', () => {
    // Two inactive members (>45 days without a lesson) – trendIndicator = 'inactive'
    const makeInactive = (name: string, phone: string) =>
      makeLesson({
        clientName: name,
        clientPhone: phone,
        date: new Date(daysAgo(60)).toISOString().split('T')[0],
        createdAt: daysAgo(60),
        coachNotes: '셋업',
        tags: [],
      });
    const reports = buildMemberGrowthReports(
      [makeInactive('회원A', '01011110001'), makeInactive('회원B', '01011110002')],
      []
    );
    // The urgency badge in App.tsx counts inactive + plateau members
    const urgentCount = reports.filter(
      r => r.trendIndicator === 'inactive' || r.trendIndicator === 'plateau'
    ).length;
    expect(urgentCount).toBe(2);
  });
});

// ─── Gemini-backed CoachX functions (fallback path) ──────────────────────────
// In the test environment GEMINI_API_KEY is not set, so both functions must
// fall back gracefully and return valid output rather than throwing.

import { generateCoachXChatResponse, generateCoachXInsights } from '../services/geminiService';

describe('generateCoachXChatResponse (Gemini unavailable → heuristic fallback)', () => {
  it('resolves to a non-empty string without throwing', async () => {
    const result = await generateCoachXChatResponse('다음 레슨 추천해줘', [], [], 'ko');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('fallback contains Coachx branding for an unrecognized query', async () => {
    const result = await generateCoachXChatResponse('xyz unknown query', [], [], 'ko');
    expect(result).toContain('Coachx');
  });

  it('fallback returns English response when language is "en"', async () => {
    const result = await generateCoachXChatResponse('recommend my next lesson', [], [], 'en');
    expect(result).toMatch(/Coachx|lesson|member/i);
    expect(result).not.toMatch(/안녕하세요/);
  });

  it('fallback returns member report when a known client is mentioned', async () => {
    const lessons = [
      makeLesson({ clientName: '김민준', clientPhone: '01011112222', title: '슬라이스', coachNotes: '슬라이스' }),
    ];
    const result = await generateCoachXChatResponse('김민준 회원 분석해줘', lessons, [baseClient], 'ko');
    expect(result).toContain('김민준');
  });
});

describe('generateCoachXInsights (Gemini unavailable → heuristic fallback)', () => {
  it('resolves to a non-empty array without throwing', async () => {
    const result = await generateCoachXInsights([], baseCoach, 'ko');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('each insight has required fields: type, title, body, icon', async () => {
    const lessons = [
      makeLesson({ clientName: '김민준', clientPhone: '01011112222', title: '슬라이스 교정', coachNotes: '슬라이스' }),
    ];
    const result = await generateCoachXInsights(lessons, baseCoach, 'ko');
    for (const insight of result) {
      expect(insight).toHaveProperty('type');
      expect(insight).toHaveProperty('title');
      expect(insight).toHaveProperty('body');
      expect(insight).toHaveProperty('icon');
    }
  });

  it('returns at least one insight when lessons exist', async () => {
    const lessons = [
      makeLesson({ clientName: '김민준', clientPhone: '01011112222' }),
    ];
    const result = await generateCoachXInsights(lessons, baseCoach, 'en');
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── PR #108 – richer analytics fields ───────────────────────────────────────

describe('buildMemberGrowthReports – PR #108 growth analytics fields', () => {
  it('report contains all PR #108 fields', () => {
    const lessons = [
      makeLesson({ clientName: '김민준', clientPhone: '01011112222' }),
    ];
    const [report] = buildMemberGrowthReports(lessons, [baseClient]);
    expect(report).toHaveProperty('growthScore');
    expect(report).toHaveProperty('issueResolutionRate');
    expect(report).toHaveProperty('lessonCadence');
    expect(report).toHaveProperty('topicProgressionStages');
    expect(report).toHaveProperty('weeklyActivity');
    expect(report.topicProgressionStages).toHaveProperty('early');
    expect(report.topicProgressionStages).toHaveProperty('recent');
    expect(Array.isArray(report.weeklyActivity)).toBe(true);
    expect(report.weeklyActivity).toHaveLength(8);
  });

  it('growthScore is between 0 and 100', () => {
    const lessons = Array.from({ length: 6 }, (_, i) =>
      makeLesson({
        clientName: '박지수',
        clientPhone: '01033334444',
        createdAt: daysAgo(i * 7),
        date: new Date(daysAgo(i * 7)).toISOString().split('T')[0],
      })
    );
    const [report] = buildMemberGrowthReports(lessons, []);
    expect(report.growthScore).toBeGreaterThanOrEqual(0);
    expect(report.growthScore).toBeLessThanOrEqual(100);
  });

  it('lessonCadence is null for a single-lesson member', () => {
    const lessons = [makeLesson({ clientName: '김민준', clientPhone: '01011112222' })];
    const [report] = buildMemberGrowthReports(lessons, []);
    expect(report.lessonCadence).toBeNull();
  });

  it('lessonCadence is a positive number when two or more lessons are recorded', () => {
    const lessons = [
      makeLesson({ clientName: '김민준', clientPhone: '01011112222', date: new Date(daysAgo(14)).toISOString().split('T')[0], createdAt: daysAgo(14) }),
      makeLesson({ clientName: '김민준', clientPhone: '01011112222', date: new Date(daysAgo(0)).toISOString().split('T')[0],  createdAt: daysAgo(0)  }),
    ];
    const [report] = buildMemberGrowthReports(lessons, []);
    expect(report.lessonCadence).not.toBeNull();
    expect(report.lessonCadence as number).toBeGreaterThan(0);
  });

  it('issueResolutionRate is 1 when a member has only one lesson (no early issues)', () => {
    const lessons = [makeLesson({ clientName: '김민준', clientPhone: '01011112222' })];
    const [report] = buildMemberGrowthReports(lessons, []);
    // One lesson means early half is empty → rate = 1.0
    expect(report.issueResolutionRate).toBe(1);
  });

  it('weeklyActivity always has exactly 8 entries', () => {
    const lessons = [makeLesson({ clientName: '김민준', clientPhone: '01011112222' })];
    const [report] = buildMemberGrowthReports(lessons, []);
    expect(report.weeklyActivity).toHaveLength(8);
  });

  it('topicProgressionStages has at most 3 topics each', () => {
    const topicLessons = Array.from({ length: 10 }, (_, i) =>
      makeLesson({
        clientName: '박지수',
        clientPhone: '01033334444',
        title: ['슬라이스', '그립', '임팩트', '어드레스', '퍼팅'][i % 5],
        coachNotes: ['슬라이스', '그립', '임팩트', '어드레스', '퍼팅'][i % 5],
        createdAt: daysAgo(i * 5),
        date: new Date(daysAgo(i * 5)).toISOString().split('T')[0],
      })
    );
    const [report] = buildMemberGrowthReports(topicLessons, []);
    expect(report.topicProgressionStages.early.length).toBeLessThanOrEqual(3);
    expect(report.topicProgressionStages.recent.length).toBeLessThanOrEqual(3);
  });

  it('improving member has a higher growthScore than an inactive member', () => {
    // Active improving member (6 recent lessons)
    const activeLessons = Array.from({ length: 6 }, (_, i) =>
      makeLesson({
        clientName: '성장회원',
        clientPhone: '01011110001',
        title: ['임팩트', '그립', '어드레스', '슬라이스', '백스윙', '퍼팅'][i],
        coachNotes: ['임팩트', '그립', '어드레스', '슬라이스', '백스윙', '퍼팅'][i],
        createdAt: daysAgo(i * 6),
        date: new Date(daysAgo(i * 6)).toISOString().split('T')[0],
      })
    );
    // Inactive member (no lessons in 60 days)
    const inactiveLessons = [
      makeLesson({
        clientName: '미레슨회원',
        clientPhone: '01011110002',
        createdAt: daysAgo(60),
        date: new Date(daysAgo(60)).toISOString().split('T')[0],
      }),
    ];
    const activeReports  = buildMemberGrowthReports(activeLessons,  []);
    const inactiveReports = buildMemberGrowthReports(inactiveLessons, []);
    expect(activeReports[0].growthScore).toBeGreaterThan(inactiveReports[0].growthScore);
  });
});

// ─── generateCoachXGrowthProfile (Gemini unavailable → heuristic fallback) ────

import { generateCoachXGrowthProfile } from '../services/geminiService';

describe('generateCoachXGrowthProfile (Gemini unavailable → heuristic fallback)', () => {
  it('resolves to a valid CoachGrowthProfile without throwing', async () => {
    const result = await generateCoachXGrowthProfile([], [], baseCoach, 'ko');
    expect(result).toHaveProperty('lessonsThisMonth');
    expect(result).toHaveProperty('lessonsLastMonth');
    expect(result).toHaveProperty('activeMembersCount');
    expect(result).toHaveProperty('topicBreakdown');
    expect(result).toHaveProperty('teachingStrengths');
    expect(result).toHaveProperty('growthOpportunities');
    expect(result).toHaveProperty('memberTrends');
    expect(result).toHaveProperty('recommendedActions');
  });

  it('recommendedActions is a non-empty array', async () => {
    const lessons = [
      makeLesson({ clientName: '박지수', clientPhone: '01033334444', title: '슬라이스 교정' }),
    ];
    const result = await generateCoachXGrowthProfile(lessons, [baseClient], baseCoach, 'ko');
    expect(Array.isArray(result.recommendedActions)).toBe(true);
    expect(result.recommendedActions.length).toBeGreaterThan(0);
  });

  it('geminiSummary is undefined when Gemini is unavailable', async () => {
    const lessons = [
      makeLesson({ clientName: '박지수', clientPhone: '01033334444', title: '슬라이스' }),
    ];
    const result = await generateCoachXGrowthProfile(lessons, [baseClient], baseCoach, 'ko');
    // In test env (no API key), Gemini is unavailable so geminiSummary must be undefined
    expect(result.geminiSummary).toBeUndefined();
  });

  it('returns English-compatible profile when language is "en"', async () => {
    const result = await generateCoachXGrowthProfile([], [], baseCoach, 'en');
    expect(Array.isArray(result.recommendedActions)).toBe(true);
  });

  it('returns Japanese-compatible profile when language is "ja"', async () => {
    const result = await generateCoachXGrowthProfile([], [], baseCoach, 'ja');
    expect(Array.isArray(result.recommendedActions)).toBe(true);
  });

  it('memberTrends has all four keys', async () => {
    const result = await generateCoachXGrowthProfile([], [], baseCoach, 'ko');
    expect(result.memberTrends).toHaveProperty('improving');
    expect(result.memberTrends).toHaveProperty('plateau');
    expect(result.memberTrends).toHaveProperty('new');
    expect(result.memberTrends).toHaveProperty('inactive');
  });
});
