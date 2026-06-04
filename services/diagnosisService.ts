import { DIAGNOSIS_FACTORS } from '../constants/diagnosis';
import {
  DiagnosisFactor,
  DiagnosisFactorKey,
  DiagnosisInput,
  DiagnosisRecommendation,
  DiagnosisResult,
  DiagnosisSavedSession,
} from '../types/diagnosis';
import { clampDiagnosisScore, getDiagnosisAverageScore, getDiagnosisGrade } from '../utils/diagnosis';
import { createLogger } from '../utils/logger';

const log = createLogger('diagnosisService');
const STORAGE_KEY = 'swingnote_diagnosis_sessions';
const DEFAULT_MEMBER_NAME = '회원';

const FACTOR_RECOMMENDATION_MAP: Record<DiagnosisFactorKey, { title: string; low: string; high: string }> = {
  body: {
    title: '체형 정렬 및 움직임 보완',
    low: '자세 촬영 기반 스켈레톤 결과에서 확인된 기울기와 길이 편차를 중심으로 정렬 보완 훈련을 우선 진행하세요.',
    high: '체형 정렬이 안정적입니다. 현재 패턴을 유지하며 가동성과 밸런스 루틴을 병행해 주세요.',
  },
  equipment: {
    title: '장비 데이터 최적화',
    low: '드라이버와 6번 아이언의 트랙맨 측정값을 최적화 기준 데이터와 재비교해 스핀/발사각 편차를 우선 보정하세요.',
    high: '장비 성능 차이가 작습니다. 현재 세팅을 유지하면서 샷 일관성 모니터링을 이어가세요.',
  },
  skill: {
    title: '거리 제어 및 공략 기술 강화',
    low: '중·장거리(130~210m)와 숏게임(30~100m) 목표 샷의 캐리·탄착군·스핀 편차를 줄이는 거리 제어 훈련을 우선 적용하세요.',
    high: '기술 수행이 안정적입니다. 핀 위치별 공략 시나리오 훈련으로 실전 재현성을 높이세요.',
  },
};

const getScoreDescription = (factor: DiagnosisFactor, score: number): string => {
  if (score >= 85) return `${factor.label} 영역이 안정적이며 통합 리포트 기준 강점으로 분류됩니다.`;
  if (score >= 70) return `${factor.label} 영역은 양호하나 세부 지표 일관성 보강 시 성능 향상이 기대됩니다.`;
  return `${factor.label} 영역은 우선 개선이 필요한 병목 구간으로 분류됩니다.`;
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

const getPartResults = (factors: DiagnosisFactor[]): DiagnosisResult['partResults'] => {
  const byKey = Object.fromEntries(factors.map((factor) => [factor.key, factor])) as Record<
    DiagnosisFactorKey,
    DiagnosisFactor
  >;

  return [
    {
      id: 'body',
      title: byKey.body.label,
      summary:
        byKey.body.score >= 75
          ? '자세 촬영 기반 정렬 분석 결과가 비교적 안정적입니다.'
          : '자세 촬영 기반 정렬 분석에서 우선 보완이 필요한 구간이 확인됩니다.',
      details: [
        `영역 점수 ${byKey.body.score}점`,
        '자세 촬영·스켈레톤 분석으로 측정한 키 기준 신체 길이/기울기 데이터를 통합 리포트에 반영합니다.',
      ],
    },
    {
      id: 'equipment',
      title: byKey.equipment.label,
      summary:
        byKey.equipment.score >= 75
          ? '드라이버/6번 아이언 장비 데이터가 최적화 기준에 근접합니다.'
          : '드라이버/6번 아이언 장비 데이터에서 기준 대비 편차 보완이 필요합니다.',
      details: [
        `영역 점수 ${byKey.equipment.score}점`,
        '트랙맨 화면 캡처로 수집한 드라이버·6번 아이언 데이터를 클럽별 최적화 기준과 비교합니다.',
      ],
    },
    {
      id: 'skill',
      title: byKey.skill.label,
      summary:
        byKey.skill.score >= 75
          ? '거리 제어와 핀 위치 공략 기술이 비교적 안정적으로 확인됩니다.'
          : '중·장거리 및 숏게임 목표 샷의 거리 제어 보강이 필요합니다.',
      details: [
        `영역 점수 ${byKey.skill.score}점`,
        '130~210m 목표 샷과 30~100m 숏게임 샷의 캐리·토탈 거리·탄착군·발사각·최고점·스핀을 종합 분석합니다.',
      ],
    },
  ];
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
    const factors = toFactorScores(input.factorScores);
    const overallScore = getDiagnosisAverageScore(factors);
    const weakestFactor = [...factors].sort((a, b) => a.score - b.score)[0];
    const strongestFactor = [...factors].sort((a, b) => b.score - a.score)[0];

    return {
      memberName: input.memberName.trim() || DEFAULT_MEMBER_NAME,
      overallScore,
      grade: getDiagnosisGrade(overallScore),
      summary: `종합 분석 점수는 ${overallScore}점이며, 강점 영역은 ${strongestFactor.label}(${strongestFactor.score}점), 현재 가장 큰 병목은 ${weakestFactor.label}(${weakestFactor.score}점)입니다. 통합 리포트에서 우선 개선 방향을 확인하세요.`,
      factors,
      partResults: getPartResults(factors),
      recommendations: getRecommendations(factors),
    };
  },

  saveResult(input: DiagnosisInput): DiagnosisSavedSession {
    const fallbackId = `diagnosis-${Date.now()}-${Math.floor(performance.now() * 1000)}`;
    const session: DiagnosisSavedSession = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : fallbackId,
      createdAt: new Date().toISOString(),
      input,
      result: this.createResult(input),
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
