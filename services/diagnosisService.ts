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
  setup: {
    title: '셋업 루틴 안정화',
    low: '거울 앞 어드레스 체크를 10회 반복해 체중 배분과 정렬을 고정하세요.',
    high: '현재 셋업 안정성이 좋습니다. 루틴 시간을 일정하게 유지해 재현성을 높이세요.',
  },
  backswing: {
    title: '백스윙 궤도 훈련',
    low: '백스윙 탑에서 클럽 헤드 경로를 점검하는 슬로우 모션 드릴을 주 3회 진행하세요.',
    high: '백스윙 궤도가 안정적입니다. 현재 리듬을 유지하며 정확도 중심 훈련을 이어가세요.',
  },
  impact: {
    title: '임팩트 컨택 개선',
    low: '임팩트 백 또는 하프 스윙 드릴로 손목 릴리즈 타이밍을 반복 점검하세요.',
    high: '임팩트 품질이 우수합니다. 거리와 방향성 밸런스 훈련으로 퍼포먼스를 확장하세요.',
  },
  tempo: {
    title: '템포 일관성 강화',
    low: '3:1 카운트 리듬 스윙으로 전환 구간 속도를 일정하게 맞추세요.',
    high: '템포 유지력이 좋습니다. 클럽별 스윙에서도 동일한 리듬을 유지해 보세요.',
  },
  balance: {
    title: '피니시 밸런스 강화',
    low: '피니시 2초 정지 드릴로 하체 축과 상체 균형을 동시에 훈련하세요.',
    high: '밸런스가 안정적입니다. 스윙 속도를 높여도 피니시 축이 유지되는지 확인하세요.',
  },
};

const getScoreDescription = (factor: DiagnosisFactor, score: number): string => {
  if (score >= 85) return `${factor.label} 구간이 매우 안정적이며 현재 패턴을 유지하면 좋습니다.`;
  if (score >= 70) return `${factor.label} 구간은 양호하지만 일관성 보강 시 성능 향상이 기대됩니다.`;
  return `${factor.label} 구간은 보완이 필요하며 반복 드릴을 통한 패턴 교정이 우선입니다.`;
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
  const upperBodyAverage = getDiagnosisAverageScore([byKey.backswing, byKey.impact, byKey.tempo]);
  const lowerBodyAverage = getDiagnosisAverageScore([byKey.setup, byKey.balance]);

  return [
    {
      id: 'upper-body',
      title: '상체·클럽 제어',
      summary:
        upperBodyAverage >= 75
          ? '상체 회전과 클럽 제어가 비교적 안정적입니다.'
          : '상체 회전과 클럽 제어 구간의 리듬 보강이 필요합니다.',
      details: [
        `백스윙 ${byKey.backswing.score}점 / 임팩트 ${byKey.impact.score}점 / 템포 ${byKey.tempo.score}점`,
        upperBodyAverage >= 75
          ? '현재 스윙 리듬을 유지하면서 정확도 중심 훈련을 권장합니다.'
          : '슬로우 모션 백스윙과 카운트 템포 드릴로 전환 구간을 교정하세요.',
      ],
    },
    {
      id: 'lower-body',
      title: '하체 안정성',
      summary:
        lowerBodyAverage >= 75
          ? '하체 지지와 피니시 밸런스가 안정적으로 유지됩니다.'
          : '체중 이동과 피니시 균형 구간 보강이 필요합니다.',
      details: [
        `셋업 ${byKey.setup.score}점 / 밸런스 ${byKey.balance.score}점`,
        lowerBodyAverage >= 75
          ? '속도를 높여도 하체 축이 유지되는지 확인해 보세요.'
          : '셋업 루틴 체크와 피니시 정지 드릴을 우선 수행하세요.',
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
      summary: `강점은 ${strongestFactor.label}(${strongestFactor.score}점)이며, 우선 보완 영역은 ${weakestFactor.label}(${weakestFactor.score}점)입니다.`,
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
