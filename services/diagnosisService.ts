import { DIAGNOSIS_FACTORS } from '../constants/diagnosis';
import {
  DiagnosisFactor,
  DiagnosisFactorKey,
  DiagnosisInput,
  DiagnosisRecommendation,
  DiagnosisResult,
  DiagnosisSavedSession,
  GolferProfile,
} from '../types/diagnosis';
import { clampDiagnosisScore, getAgeFromBirthDate, getDiagnosisAverageScore, getDiagnosisGrade } from '../utils/diagnosis';
import { createLogger } from '../utils/logger';

const log = createLogger('diagnosisService');
const STORAGE_KEY = 'swingnote_diagnosis_sessions';
const DEFAULT_MEMBER_NAME = '회원';

const normalizeInput = (input: DiagnosisInput): DiagnosisInput => {
  const fallbackName = input.memberName.trim() || input.golferProfile?.name?.trim() || DEFAULT_MEMBER_NAME;
  if (!input.golferProfile) {
    return {
      ...input,
      memberName: fallbackName,
    };
  }

  return {
    ...input,
    memberName: fallbackName,
    golferProfile: {
      ...input.golferProfile,
      age: input.golferProfile.age ?? getAgeFromBirthDate(input.golferProfile.birthDate),
      name: fallbackName,
    },
  };
};

const FACTOR_RECOMMENDATION_MAP: Record<DiagnosisFactorKey, { title: string; low: string; high: string }> = {
  body: {
    title: '체형·능력 개선 과제',
    low: '촬영·스켈레톤 분석에서 편차가 큰 정렬 포인트를 우선순위로 정해 자세 교정 루틴을 반복하세요.',
    high: '체형 정렬과 움직임 특성이 안정적입니다. 워밍업 루틴을 고정해 재현성을 유지하세요.',
  },
  equipment: {
    title: '장비 적합성 점검',
    low: '드라이버·6번 아이언의 트랙맨 측정값과 최적화 기준값 차이가 큰 항목부터 장비 보완 계획을 수립하세요.',
    high: '장비 적합성이 양호합니다. 트랙맨 기준값 대비 편차를 정기 점검해 성능을 유지하세요.',
  },
  skill: {
    title: '기술 수행 보완 과제',
    low: '130~210m와 30~100m 구간 중 편차가 큰 거리대를 중심으로 캐리·스핀·탄착군 제어 훈련을 강화하세요.',
    high: '기술 수행이 안정적입니다. 핀 위치별 샷 전략을 구체화해 실전 공략 정확도를 높이세요.',
  },
};

const getScoreDescription = (factor: DiagnosisFactor, score: number): string => {
  if (score >= 85) return `${factor.label}이 강점입니다. 현재 패턴을 유지하며 실전 적용 범위를 확장하세요.`;
  if (score >= 70) return `${factor.label}은 양호하지만, 세부 보완을 통해 스코어 개선 여지가 있습니다.`;
  return `${factor.label}은 우선 개선이 필요합니다. 병목 원인을 중심으로 단계별 보완을 진행하세요.`;
};

const toFactorScores = (factorScores: Record<DiagnosisFactorKey, number>): DiagnosisFactor[] =>
  DIAGNOSIS_FACTORS.map((factor) => {
    const score = clampDiagnosisScore(factorScores[factor.key] ?? factor.score);
    return {
      ...factor,
      score,
      description: getScoreDescription(factor, score),
    };
  });

const getPartResults = (factors: DiagnosisFactor[], profile?: GolferProfile): DiagnosisResult['partResults'] => {
  const byKey = Object.fromEntries(factors.map((factor) => [factor.key, factor])) as Record<
    DiagnosisFactorKey,
    DiagnosisFactor
  >;
  const integratedScore = getDiagnosisAverageScore(factors);
  const weakestFactor = [...factors].sort((a, b) => a.score - b.score)[0];

  // Derive specific weak distances from skill data
  const domainDetails: string[] = [
    `신체 ${byKey.body.score}점 / 장비 ${byKey.equipment.score}점 / 기술 ${byKey.skill.score}점`,
  ];
  if (profile?.skillDiagnosisData) {
    const allShots = [
      ...profile.skillDiagnosisData.fullShots,
      ...profile.skillDiagnosisData.shortGameShots,
    ].filter((s) => s.carryDistance != null);
    if (allShots.length > 0) {
      const sorted = [...allShots].sort((a, b) => {
        const ea = Math.abs((a.carryDistance ?? 0) - a.targetDistance) / a.targetDistance;
        const eb = Math.abs((b.carryDistance ?? 0) - b.targetDistance) / b.targetDistance;
        return eb - ea;
      });
      const worstTwo = sorted.slice(0, 2).map((s) => `${s.targetDistance}m`).join(', ');
      domainDetails.push(`거리 편차 최대 구간: ${worstTwo}`);
      const bestTwo = [...sorted].reverse().slice(0, 2).map((s) => `${s.targetDistance}m`).join(', ');
      domainDetails.push(`거리 제어 우수 구간: ${bestTwo}`);
    }
  }

  // Course/mental summary
  const courseMentalDetails: string[] = [];
  if (profile?.courseMentalData) {
    const allRated = [...profile.courseMentalData.courseManagement, ...profile.courseMentalData.mental]
      .filter((i) => i.rating !== null);
    if (allRated.length > 0) {
      const avg = allRated.reduce((sum, i) => sum + (i.rating ?? 0), 0) / allRated.length;
      courseMentalDetails.push(`코스메니지먼트·멘탈 평균 평점: ${avg.toFixed(1)} / 5.0`);
      const worst = [...allRated].sort((a, b) => (a.rating ?? 0) - (b.rating ?? 0))[0];
      if (worst && (worst.rating ?? 5) <= 3) {
        courseMentalDetails.push(`보완 우선 항목: ${worst.label} (${worst.rating}점)`);
      }
      const best = [...allRated].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0];
      if (best && (best.rating ?? 0) >= 4) {
        courseMentalDetails.push(`강점 항목: ${best.label} (${best.rating}점)`);
      }
    }
  }

  const parts: DiagnosisResult['partResults'] = [
    {
      id: 'integrated-overview',
      title: '통합 분석 개요',
      summary:
        integratedScore >= 75
          ? '3개 핵심 영역의 균형이 비교적 안정적이며 실전 성과 연결 가능성이 높습니다.'
          : '핵심 영역 간 편차가 있어 우선 개선 영역을 중심으로 로드맵 실행이 필요합니다.',
      details: [
        `종합 분석 점수 ${integratedScore}점 / 우선 개선 영역: ${weakestFactor.label} (${weakestFactor.score}점)`,
        integratedScore >= 75
          ? '현재 강점을 유지하면서 약점 영역의 미세 조정 중심으로 개선하세요.'
          : '우선 개선 영역 1~2개에 집중해 단계별 실행 계획을 수립하세요.',
      ],
    },
    {
      id: 'domain-breakdown',
      title: '3개 영역별 결과',
      summary: '신체·장비·기술 영역의 현재 수준과 개선 우선순위를 제공합니다.',
      details: domainDetails,
    },
  ];

  if (courseMentalDetails.length > 0) {
    parts.push({
      id: 'course-mental-overview',
      title: '코스메니지먼트 & 멘탈',
      summary: '코스 운영 전략과 멘탈 역량 종합 평가 결과입니다.',
      details: courseMentalDetails,
    });
  }

  return parts;
};

const getRecommendations = (factors: DiagnosisFactor[]): DiagnosisRecommendation[] =>
  [...factors]
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((factor) => {
      const template = FACTOR_RECOMMENDATION_MAP[factor.key];
      return {
        id: `rec-${factor.key}`,
        title: template.title,
        content: factor.score < 75 ? template.low : template.high,
      };
    });

const readSessions = (): DiagnosisSavedSession[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    log.error('Failed to load diagnosis sessions', error);
    return [];
  }
};

const writeSessions = (sessions: DiagnosisSavedSession[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (error) {
    log.error('Failed to save diagnosis sessions', error);
  }
};

export const diagnosisService = {
  createResult(input: DiagnosisInput): DiagnosisResult {
    const normalizedInput = normalizeInput(input);
    const factors = toFactorScores(normalizedInput.factorScores);
    const overallScore = getDiagnosisAverageScore(factors);
    const weakestFactor = [...factors].sort((a, b) => a.score - b.score)[0];
    const strongestFactor = [...factors].sort((a, b) => b.score - a.score)[0];

    return {
      memberName: normalizedInput.memberName,
      golferProfile: normalizedInput.golferProfile,
      overallScore,
      grade: getDiagnosisGrade(overallScore),
      summary: `종합 분석 결과 ${strongestFactor.label}(${strongestFactor.score}점)이 강점이며, 현재 가장 큰 병목은 ${weakestFactor.label}(${weakestFactor.score}점)입니다. 병목 영역 중심의 맞춤형 개선 로드맵을 권장합니다.`,
      factors,
      partResults: getPartResults(factors, normalizedInput.golferProfile),
      recommendations: getRecommendations(factors),
    };
  },

  saveResult(input: DiagnosisInput): DiagnosisSavedSession {
    const normalizedInput = normalizeInput(input);
    const fallbackId = `diagnosis-${Date.now()}-${Math.floor(performance.now() * 1000)}`;
    const session: DiagnosisSavedSession = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : fallbackId,
      createdAt: new Date().toISOString(),
      input: normalizedInput,
      result: this.createResult(normalizedInput),
    };
    const all = [session, ...readSessions()];
    writeSessions(all);
    return session;
  },

  getSessions(): DiagnosisSavedSession[] {
    return readSessions();
  },

  getLatestSession(): DiagnosisSavedSession | null {
    return readSessions()[0] ?? null;
  },
};
