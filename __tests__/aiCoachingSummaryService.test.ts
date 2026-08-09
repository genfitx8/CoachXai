import { describe, it, expect } from 'vitest';
import { __testing__ } from '../services/aiCoachingSummaryService';
import type { SwingAnalysis } from '../types/swingAnalysis';
import type { Lesson } from '../types';
import type { SwingFault } from '../types/swingFault';

const {
  formatSwingAnalysisForPrompt,
  formatFaultsForPrompt,
  computeShotTrend,
  parseCoachingReport,
} = __testing__;

function makeAnalysis(): SwingAnalysis {
  return {
    videoUrl: 'mock://x',
    frames: [],
    sampledFps: 60,
    events: {
      address: {
        name: 'address',
        frameIndex: 10,
        t: 0.3,
        metrics: { spineTilt3D: 32, kneeFlex: 158, shoulderRotationFromAddress: 0, pelvisRotationFromAddress: 0 },
      },
      top: {
        name: 'top',
        frameIndex: 60,
        t: 1.1,
        metrics: { shoulderRotationFromAddress: 92, pelvisRotationFromAddress: 48 },
      },
      impact: {
        name: 'impact',
        frameIndex: 92,
        t: 1.5,
        metrics: { headSwayMm: 68, earlyExtensionMm: 55, spineTiltDelta: -7 },
      },
    },
    warnings: ['프레임 confidence 낮음'],
    summary: {
      cameraView: 'face_on',
      backswingMs: 800,
      downswingMs: 400,
      tempoRatio: 2,
      handedness: 'right',
    },
  };
}

describe('formatSwingAnalysisForPrompt', () => {
  it('quotes key numbers verbatim so the model can cite them', () => {
    const s = formatSwingAnalysisForPrompt(makeAnalysis());
    expect(s).toContain('정면');
    expect(s).toContain('60fps');
    expect(s).toContain('800ms / 400ms');
    expect(s).toContain('어깨회전 92°');
    expect(s).toContain('머리스웨이 68mm');
    expect(s).toContain('얼리익스텐션 55mm');
    expect(s).toContain('프레임 confidence 낮음');
  });
});

describe('formatFaultsForPrompt', () => {
  it('marks severity levels and includes evidence line', () => {
    const faults: SwingFault[] = [
      {
        id: 'early_extension',
        title: '얼리 익스텐션',
        severity: 'major',
        description: '임팩트에서 골반이 카메라 쪽으로 이동',
        evidence: ['골반 Z 이동 55mm'],
        drills: [],
      },
      {
        id: 'reverse_spine',
        title: '리버스 스파인',
        severity: 'minor',
        description: '탑에서 척추가 목표 방향으로 기울어짐',
        evidence: ['어드레스 대비 머리 X 좌측 30mm'],
        drills: [],
      },
    ];
    const s = formatFaultsForPrompt(faults);
    expect(s).toContain('심각');
    expect(s).toContain('주의');
    expect(s).toContain('골반 Z 이동 55mm');
  });
  it('handles empty fault list gracefully', () => {
    const s = formatFaultsForPrompt([]);
    expect(s).toContain('감지된 결점 없음');
  });
});

describe('computeShotTrend', () => {
  const mkLesson = (createdAt: number, carry: number): Lesson =>
    ({
      id: `l${createdAt}`,
      clientName: 'x',
      clientPhone: '000',
      createdBy: 'COACH',
      date: '2025-01-01',
      title: '',
      videoUrl: '',
      mediaType: 'video',
      coachNotes: '',
      tags: [],
      createdAt,
      golfData: { carryDistance: carry },
    } as Lesson);

  it('returns empty string when fewer than 3 carry samples', () => {
    expect(computeShotTrend([mkLesson(1, 200), mkLesson(2, 205)])).toBe('');
  });

  it('detects meaningful carry drop (>= 3m)', () => {
    const lessons = [
      mkLesson(1, 220), mkLesson(2, 218), mkLesson(3, 219),
      mkLesson(4, 205), mkLesson(5, 207), mkLesson(6, 210),
    ];
    const s = computeShotTrend(lessons);
    expect(s).toContain('감소');
  });

  it('ignores tiny drift (< 3m)', () => {
    const lessons = [
      mkLesson(1, 220), mkLesson(2, 219), mkLesson(3, 221),
      mkLesson(4, 220), mkLesson(5, 218), mkLesson(6, 221),
    ];
    expect(computeShotTrend(lessons)).toBe('');
  });
});

describe('parseCoachingReport', () => {
  it('parses a well-formed JSON response', () => {
    const raw = JSON.stringify({
      headline: 'X-Factor 는 좋지만 임팩트에서 얼리 익스텐션 발견',
      trend: 'steady',
      insights: [
        {
          title: '얼리 익스텐션',
          observation: '골반이 임팩트 순간 카메라 쪽으로 이동',
          swingEvidence: ['임팩트 얼리익스텐션 55mm'],
          historyEvidence: ['지난 3회 평균 캐리 10m 감소'],
          correlationConfidence: 'strong',
          recommendation: '벽 드릴',
        },
      ],
      nextLessonFocus: ['얼리 익스텐션 교정'],
      caveats: ['정면 뷰로만 분석됨'],
    });
    const r = parseCoachingReport(raw, true);
    expect(r.headline).toContain('X-Factor');
    expect(r.insights).toHaveLength(1);
    expect(r.insights[0].correlationConfidence).toBe('strong');
    expect(r.usedHistory).toBe(true);
    expect(r.trend).toBe('steady');
  });

  it('strips ```json``` fences and still parses', () => {
    const raw = '```json\n' + JSON.stringify({
      headline: 'ok', insights: [], nextLessonFocus: [], caveats: [],
    }) + '\n```';
    const r = parseCoachingReport(raw, false);
    expect(r.headline).toBe('ok');
    expect(r.usedHistory).toBe(false);
  });

  it('falls back to a skeleton report on malformed JSON', () => {
    const r = parseCoachingReport('this is not JSON', false);
    expect(r.headline).toContain('실패');
    expect(r.caveats.length).toBeGreaterThan(0);
  });

  it('clamps unknown correlationConfidence to speculative', () => {
    const raw = JSON.stringify({
      headline: 'x',
      insights: [
        {
          title: 't', observation: 'o',
          swingEvidence: ['e'], historyEvidence: [],
          correlationConfidence: 'certain-100%', // invalid
        },
      ],
      nextLessonFocus: [], caveats: [],
    });
    const r = parseCoachingReport(raw, false);
    expect(r.insights[0].correlationConfidence).toBe('speculative');
  });
});
