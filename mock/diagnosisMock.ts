import { DIAGNOSIS_FACTORS, DIAGNOSIS_PROCESS } from '../constants/diagnosis';
import { DiagnosisSession } from '../types/diagnosis';
import { getDiagnosisAverageScore, getDiagnosisGrade } from '../utils/diagnosis';

const averageScore = getDiagnosisAverageScore(DIAGNOSIS_FACTORS);

export const mockDiagnosisSession: DiagnosisSession = {
  program: {
    title: 'coachxai 정밀진단 프로그램',
    subtitle: '골퍼의 플레이를 5개 핵심 영역에서 진단하고, 맞춤형 개선 로드맵을 제공하는 통합 분석 서비스',
    description:
      '신체, 장비, 기술, 코스 매니지먼트, 멘탈을 종합 분석해 실질적인 스코어 개선 방향을 제시합니다. 단순 점수화가 아닌 통합 진단 기반의 개인 맞춤 개선 로드맵을 제공합니다.',
    factors: DIAGNOSIS_FACTORS,
    steps: DIAGNOSIS_PROCESS,
  },
  result: {
    memberName: '김회원',
    overallScore: averageScore,
    grade: getDiagnosisGrade(averageScore),
    summary: '장비 진단이 강점이며, 코스 매니지먼트 진단 보강 시 전체 퍼포먼스 상승이 기대됩니다.',
    factors: DIAGNOSIS_FACTORS,
    partResults: [
      {
        id: 'integrated-overview',
        title: '통합 분석 개요',
        summary: '5개 핵심 영역의 편차를 기반으로 우선 개선 영역을 도출합니다.',
        details: ['현재 가장 큰 병목: 코스 매니지먼트 진단', '강점 영역: 장비 진단'],
      },
      {
        id: 'domain-breakdown',
        title: '5개 영역별 결과',
        summary: '신체·장비·기술·코스 매니지먼트·멘탈 영역별 현재 수준을 제공합니다.',
        details: ['신체 72점 / 장비 69점 / 기술 76점', '코스 매니지먼트 70점 / 멘탈 74점'],
      },
    ],
    recommendations: [
      {
        id: 'rec-courseManagement',
        title: '코스 운영 전략 보강',
        content: '라운드 손실 상황 2개를 선정해 클럽 선택·공략 루틴을 시나리오로 반복 연습하세요.',
      },
      {
        id: 'rec-body',
        title: '체형·능력 개선 과제',
        content: '가동성·안정성 점검 루틴과 하체 밸런스 훈련을 주 3회 이상 배치하세요.',
      },
      {
        id: 'rec-mental',
        title: '멘탈 루틴 설계',
        content: '실수 후 리셋 루틴(호흡·키워드·프리샷)을 만들어 매 샷 전 동일하게 실행하세요.',
      },
    ],
  },
};
