import { DIAGNOSIS_FACTORS, DIAGNOSIS_PROCESS } from '../constants/diagnosis';
import { DiagnosisSession } from '../types/diagnosis';
import { getDiagnosisAverageScore, getDiagnosisGrade } from '../utils/diagnosis';

const averageScore = getDiagnosisAverageScore(DIAGNOSIS_FACTORS);

export const mockDiagnosisSession: DiagnosisSession = {
  program: {
    title: 'coachxai 정밀진단 프로그램',
    subtitle: '골퍼의 플레이를 3개 핵심 영역에서 진단하고, 모든 분석 결과를 통합 리포트로 제공하는 골프 퍼포먼스 진단 프로그램',
    description:
      '신체, 장비, 기술을 종합적으로 분석해 현재 상태를 정확히 파악하고 개선 방향 수립의 기초 데이터를 제공합니다.',
    factors: DIAGNOSIS_FACTORS,
    steps: DIAGNOSIS_PROCESS,
  },
  result: {
    memberName: '김회원',
    overallScore: averageScore,
    grade: getDiagnosisGrade(averageScore),
    summary: '장비 진단이 강점이며, 기술 진단 보강 시 전체 퍼포먼스 상승이 기대됩니다.',
    factors: DIAGNOSIS_FACTORS,
    partResults: [
      {
        id: 'integrated-overview',
        title: '통합 분석 개요',
        summary: '3개 핵심 영역의 편차를 기반으로 우선 개선 영역을 도출합니다.',
        details: ['현재 가장 큰 병목: 기술 진단', '강점 영역: 장비 진단'],
      },
      {
        id: 'domain-breakdown',
        title: '3개 영역별 결과',
        summary: '신체·장비·기술 영역별 현재 수준을 제공합니다.',
        details: ['신체 72점 / 장비 69점 / 기술 76점'],
      },
    ],
    recommendations: [
      {
        id: 'rec-skill',
        title: '기술 수행 보완 과제',
        content: '130~210m와 30~100m 구간 중 편차가 큰 거리대를 중심으로 캐리·스핀·탄착군 제어 훈련을 강화하세요.',
      },
      {
        id: 'rec-body',
        title: '체형·능력 개선 과제',
        content: '촬영·스켈레톤 분석에서 편차가 큰 정렬 포인트를 우선순위로 정해 자세 교정 루틴을 반복하세요.',
      },
      {
        id: 'rec-equipment',
        title: '장비 적합성 점검',
        content: '드라이버·6번 아이언의 트랙맨 측정값과 최적화 기준값 차이가 큰 항목부터 장비 보완 계획을 수립하세요.',
      },
    ],
  },
};
