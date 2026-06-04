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
    title: '체형·능력 개선 과제',
    low: '가동성·안정성 점검 루틴과 하체 밸런스 훈련을 주 3회 이상 배치해 기본 움직임을 보완하세요.',
    high: '신체 조건이 안정적입니다. 경기 전 워밍업 루틴을 고정해 컨디션 편차를 최소화하세요.',
  },
  equipment: {
    title: '장비 적합성 점검',
    low: '현재 구질과 미스 패턴 기준으로 클럽 스펙을 재점검하고, 우선순위 장비부터 피팅을 진행하세요.',
    high: '장비 적합성이 양호합니다. 시즌 중에는 그립·로프트·라이각 등 유지 점검 중심으로 관리하세요.',
  },
  skill: {
    title: '기술 완성도 향상',
    low: '미스 패턴을 기준으로 핵심 기술 1~2개를 선정해 드릴 루틴을 고정하고 반복 훈련하세요.',
    high: '기술 완성도가 좋습니다. 실전 상황별 샷 선택과 거리 컨트롤 훈련으로 정확도를 높이세요.',
  },
  courseManagement: {
    title: '코스 운영 전략 보강',
    low: '라운드 복기에서 손실이 큰 상황을 2개 선정하고, 클럽 선택·공략 루틴을 시나리오로 연습하세요.',
    high: '코스 운영 역량이 좋습니다. 위험 관리와 기대타수 기반 의사결정 루틴을 계속 유지하세요.',
  },
  mental: {
    title: '멘탈 루틴 설계',
    low: '실수 후 리셋 루틴(호흡·키워드·프리샷)을 만들어 매 샷 전 동일하게 실행하세요.',
    high: '멘탈 안정성이 좋습니다. 압박 상황에서도 루틴이 유지되도록 경기 시뮬레이션을 병행하세요.',
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

const getPartResults = (factors: DiagnosisFactor[]): DiagnosisResult['partResults'] => {
  const byKey = Object.fromEntries(factors.map((factor) => [factor.key, factor])) as Record<
    DiagnosisFactorKey,
    DiagnosisFactor
  >;
  const integratedScore = getDiagnosisAverageScore(factors);
  const weakestFactor = [...factors].sort((a, b) => a.score - b.score)[0];

  return [
    {
      id: 'integrated-overview',
      title: '통합 분석 개요',
      summary:
        integratedScore >= 75
          ? '5개 핵심 영역의 균형이 비교적 안정적이며 실전 성과 연결 가능성이 높습니다.'
          : '핵심 영역 간 편차가 있어 우선 개선 영역을 중심으로 로드맵 실행이 필요합니다.',
      details: [
        `종합 분석 점수 ${integratedScore}점 / 우선 개선 영역 ${weakestFactor.label} (${weakestFactor.score}점)`,
        integratedScore >= 75
          ? '현재 강점을 유지하면서 약점 영역의 미세 조정 중심으로 개선하세요.'
          : '우선 개선 영역 1~2개에 집중해 단계별 실행 계획을 수립하세요.',
      ],
    },
    {
      id: 'domain-breakdown',
      title: '5개 영역별 결과',
      summary: '신체·장비·기술·코스 매니지먼트·멘탈 영역의 현재 수준과 개선 우선순위를 제공합니다.',
      details: [
        `신체 ${byKey.body.score}점 / 장비 ${byKey.equipment.score}점 / 기술 ${byKey.skill.score}점`,
        `코스 매니지먼트 ${byKey.courseManagement.score}점 / 멘탈 ${byKey.mental.score}점`,
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
      summary: `종합 분석 결과 ${strongestFactor.label}(${strongestFactor.score}점)이 강점이며, 현재 가장 큰 병목은 ${weakestFactor.label}(${weakestFactor.score}점)입니다. 병목 영역 중심의 맞춤형 개선 로드맵을 권장합니다.`,
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
