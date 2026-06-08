import { DIAGNOSIS_FACTORS, DIAGNOSIS_PROCESS } from '../constants/diagnosis';
import { DiagnosisSession } from '../types/diagnosis';
import { getDiagnosisAverageScore, getDiagnosisGrade } from '../utils/diagnosis';

const averageScore = getDiagnosisAverageScore(DIAGNOSIS_FACTORS);

export const mockDiagnosisSession: DiagnosisSession = {
  program: {
    title: 'coachxai 정밀진단 프로그램',
    subtitle: '골퍼 기본정보부터 통합 리포트까지 6단계 프로세스로 진행하는 골프 퍼포먼스 정밀진단 프로그램',
    description:
      '신체, 장비, 기술 진단과 코스메니지먼트·멘탈 입력을 순차적으로 진행해 통합 분석 결과를 제공합니다.',
    factors: DIAGNOSIS_FACTORS,
    steps: DIAGNOSIS_PROCESS,
  },
  result: {
    memberName: '김회원',
    golferProfile: {
      name: '김회원',
      gender: 'male',
      birthDate: '1990-01-15',
      contact: '010-1111-0001',
      heightCm: 175,
      weightKg: 72,
      yearsOfExperience: 6,
      handicap: 14,
      averageScore: 88,
      bestScore: 79,
      dominantHand: 'right',
      roundFrequency: '월 2회',
      practiceFrequency: '주 2회',
      injuryHistory: '허리 통증 이력',
      injuryMemo: '장시간 라운드 후 허리 피로감',
      currentPainAreas: '허리',
      otherSportsExperience: '수영 3년',
      flexibilitySelfAssessment: 3,
      driverModel: 'TaylorMade Qi10',
      ironModel: 'Mizuno JPX',
      shaftFlex: 'S',
      ballBrand: 'Titleist Pro V1',
      diagnosisGoals: ['score-improvement', 'consistency'],
      primaryConcern: '아이언 거리 편차',
      targetHandicap: 10,
    },
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
