/**
 * Tests for services/lessonContext.ts — shared per-lesson formatter and
 * coach-side member activity overview.
 */

import { describe, it, expect } from 'vitest';
import {
  buildMemberActivityOverview,
  formatLessonEntry,
} from '../services/lessonContext';
import { ClientProfile, Lesson } from '../types';

const now = Date.now();
const daysAgo = (n: number) => now - n * 86_400_000;

const makeLesson = (overrides: Partial<Lesson> = {}): Lesson => ({
  id: overrides.id ?? Math.random().toString(36).slice(2),
  clientName: overrides.clientName ?? '김철수',
  clientPhone: overrides.clientPhone ?? '010-0000-0001',
  coachId: 'coach1',
  createdBy: 'COACH',
  recordType: overrides.recordType ?? 'LESSON',
  date: overrides.date ?? new Date(daysAgo(3)).toISOString().split('T')[0],
  title: overrides.title ?? '스윙 교정 레슨',
  coachNotes: overrides.coachNotes ?? '',
  tags: overrides.tags ?? [],
  videoUrl: '',
  mediaType: 'video',
  createdAt: overrides.createdAt ?? daysAgo(3),
  ...overrides,
});

describe('formatLessonEntry', () => {
  it('renders a minimal lesson with header only', () => {
    const output = formatLessonEntry(
      makeLesson({ title: '기초 그립 점검', date: '2026-05-01' })
    );
    expect(output).toContain('[2026-05-01] 기초 그립 점검');
    expect(output).toContain('(레슨');
    // No noise for missing fields.
    expect(output).not.toContain('구질 데이터:');
    expect(output).not.toContain('모션캡처:');
    expect(output).not.toContain('스코어카드:');
    expect(output).not.toContain('태그:');
  });

  it('omits the client name by default (student-chat mode)', () => {
    const output = formatLessonEntry(makeLesson({ clientName: '홍길동' }));
    expect(output).not.toContain('홍길동');
  });

  it('includes the client name when requested (coach-chat mode)', () => {
    const output = formatLessonEntry(
      makeLesson({ clientName: '홍길동' }),
      { includeClientName: true }
    );
    expect(output).toContain('홍길동');
  });

  it('renders golf metrics when present', () => {
    const output = formatLessonEntry(
      makeLesson({
        golfData: {
          carryDistance: 235,
          ballSpeed: 155,
          smashFactor: 1.48,
        },
      })
    );
    expect(output).toContain('구질 데이터:');
    expect(output).toContain('캐리 235m');
    expect(output).toContain('볼속도 155km/h');
    expect(output).toContain('스매시팩터 1.48');
  });

  it('renders scorecard summary with hard holes and GIR count', () => {
    const output = formatLessonEntry(
      makeLesson({
        recordType: 'SCORE',
        scorecardDetail: {
          courseName: '레이크사이드 CC',
          totalScore: 92,
          totalPutts: 34,
          holes: [
            { holeNumber: 1, par: 4, score: 4, putts: 2 },
            { holeNumber: 2, par: 5, score: 8, putts: 3 }, // > par+2 → bad
            { holeNumber: 3, par: 3, score: 3, putts: 1 },
          ],
        },
      })
    );
    expect(output).toContain('(라운드');
    expect(output).toContain('스코어카드: 레이크사이드 CC | 92타 | 퍼팅 34개');
    expect(output).toContain('어려웠던 홀:');
    expect(output).toContain('홀2(8타·3퍼팅)');
    expect(output).toContain('파온: 2홀/3홀');
  });

  it('truncates long coachNotes at maxNoteLength', () => {
    const long = 'ㄱ'.repeat(500);
    const output = formatLessonEntry(
      makeLesson({ coachNotes: long }),
      { maxNoteLength: 50 }
    );
    const noteLine = output.split('\n').find((line) => line.includes('코치 노트:'));
    expect(noteLine).toBeDefined();
    // 50 chars of content plus '  코치 노트: ' prefix
    expect(noteLine!.length).toBeLessThan(80);
  });

  it('renders record type label for PRACTICE', () => {
    const output = formatLessonEntry(makeLesson({ recordType: 'PRACTICE' }));
    expect(output).toContain('(연습');
  });
});

describe('buildMemberActivityOverview', () => {
  const clients: ClientProfile[] = [
    { id: 'c1', name: '김철수', phone: '010-0000-0001', handicap: 15 } as ClientProfile,
    { id: 'c2', name: '이영희', phone: '010-0000-0002' } as ClientProfile,
  ];

  it('returns empty string when there are no lessons', () => {
    expect(buildMemberActivityOverview([], clients)).toBe('');
  });

  it('returns empty string when nothing is within the recent window', () => {
    const lessons = [
      makeLesson({
        clientName: '김철수',
        clientPhone: '010-0000-0001',
        createdAt: daysAgo(200),
      }),
    ];
    expect(buildMemberActivityOverview(lessons, clients, { recentDays: 45 })).toBe('');
  });

  it('groups by client and sorts by most-recent activity', () => {
    const lessons = [
      // 김철수: 2 recent lessons, most recent 2 days ago
      makeLesson({
        clientName: '김철수',
        clientPhone: '010-0000-0001',
        createdAt: daysAgo(2),
        date: '2026-07-25',
        tags: ['슬라이스'],
      }),
      makeLesson({
        clientName: '김철수',
        clientPhone: '010-0000-0001',
        createdAt: daysAgo(10),
        date: '2026-07-17',
      }),
      // 이영희: 1 recent lesson, most recent 5 days ago
      makeLesson({
        clientName: '이영희',
        clientPhone: '010-0000-0002',
        createdAt: daysAgo(5),
        date: '2026-07-22',
        golfData: { carryDistance: 180 },
      }),
    ];
    const overview = buildMemberActivityOverview(lessons, clients, { limit: 10 });
    expect(overview).toContain('활동 회원 요약');
    // 김철수 must come before 이영희 (more recent).
    const kimIdx = overview.indexOf('김철수');
    const leeIdx = overview.indexOf('이영희');
    expect(kimIdx).toBeGreaterThan(-1);
    expect(leeIdx).toBeGreaterThan(-1);
    expect(kimIdx).toBeLessThan(leeIdx);
    // Handicap is pulled from client profile when known.
    expect(overview).toContain('핸디캡 15');
    // Recent lesson count and last-lesson date are surfaced.
    expect(overview).toContain('최근 2건');
    expect(overview).toContain('마지막 2026-07-25');
    // Topic keyword extracted from tags/notes/title.
    expect(overview).toContain('토픽: 슬라이스');
    // Latest golf metric surfaced for 이영희.
    expect(overview).toContain('최근 캐리 180m');
  });

  it('honours the limit option', () => {
    const lessons: Lesson[] = [];
    for (let i = 0; i < 12; i++) {
      lessons.push(
        makeLesson({
          clientName: `회원${i}`,
          clientPhone: `010-${String(i).padStart(4, '0')}-0000`,
          createdAt: daysAgo(i),
        })
      );
    }
    const overview = buildMemberActivityOverview(lessons, [], { limit: 5 });
    const lines = overview.split('\n').filter((l) => l.startsWith('•'));
    expect(lines).toHaveLength(5);
  });
});
