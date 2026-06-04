import { DIAGNOSIS_FACTORS, DIAGNOSIS_PROCESS } from '../constants/diagnosis';
import { DiagnosisSession } from '../types/diagnosis';
import { getDiagnosisAverageScore, getDiagnosisGrade } from '../utils/diagnosis';

const averageScore = getDiagnosisAverageScore(DIAGNOSIS_FACTORS);

export const mockDiagnosisSession: DiagnosisSession = {
  program: {
    title: '정밀진단 프로그램',
    subtitle: '스윙 5요소 분석 기반 MVP',
    description:
      '레슨 전후 핵심 동작 변화를 정량화해 회원별 개선 우선순위를 빠르게 제안하는 MVP 뼈대입니다.',
    factors: DIAGNOSIS_FACTORS,
    steps: DIAGNOSIS_PROCESS,
  },
  result: {
    memberName: '김회원',
    overallScore: averageScore,
    grade: getDiagnosisGrade(averageScore),
    summary: '임팩트 안정성이 강점이며, 백스윙 궤도와 템포 일관성 보강 시 전체 퍼포먼스 상승이 기대됩니다.',
    factors: DIAGNOSIS_FACTORS,
    partResults: [
      {
        id: 'upper-body',
        title: '상체 회전',
        summary: '회전량은 충분하나 탑 구간에서 클럽 경로 흔들림이 관찰됩니다.',
        details: ['탑에서 손목 코킹 과다', '다운스윙 시작 시 어깨 개입 시점 불균형'],
      },
      {
        id: 'lower-body',
        title: '하체 안정성',
        summary: '리드 레그 지지력이 좋아 임팩트 구간 안정성이 높습니다.',
        details: ['체중 이동 타이밍 양호', '피니시 축 유지 우수'],
      },
    ],
    recommendations: [
      {
        id: 'drill-1',
        title: '백스윙 플레인 드릴',
        content: '주 3회, 10분씩 미러 체크로 탑 구간 궤도 일관성을 확보하세요.',
      },
      {
        id: 'drill-2',
        title: '템포 카운트 스윙',
        content: '3:1 리듬 카운트(백스윙:다운스윙)로 전환 구간 속도를 일정하게 유지하세요.',
      },
      {
        id: 'drill-3',
        title: '임팩트 백 고정 훈련',
        content: '임팩트 백으로 하체 고정과 손목 릴리즈 타이밍을 함께 점검하세요.',
      },
    ],
  },
};
