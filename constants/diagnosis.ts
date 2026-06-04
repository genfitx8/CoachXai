import { DiagnosisFactor, DiagnosisProcessStep } from '../types/diagnosis';

export const DIAGNOSIS_FACTORS: DiagnosisFactor[] = [
  {
    key: 'setup',
    label: '셋업',
    score: 74,
    maxScore: 100,
    description: '어드레스 정렬은 안정적이지만 체중 배분 균형이 조금 더 필요합니다.',
  },
  {
    key: 'backswing',
    label: '백스윙',
    score: 68,
    maxScore: 100,
    description: '상체 회전 폭은 좋지만 클럽 궤도 일관성 보완이 필요합니다.',
  },
  {
    key: 'impact',
    label: '임팩트',
    score: 82,
    maxScore: 100,
    description: '볼 컨택과 임팩트 타이밍이 비교적 안정적입니다.',
  },
  {
    key: 'tempo',
    label: '템포',
    score: 71,
    maxScore: 100,
    description: '다운스윙 전환 구간에서 리듬 편차가 간헐적으로 발생합니다.',
  },
  {
    key: 'balance',
    label: '밸런스',
    score: 77,
    maxScore: 100,
    description: '피니시 밸런스는 양호하며 하체 고정력이 강점입니다.',
  },
];

export const DIAGNOSIS_PROCESS: DiagnosisProcessStep[] = [
  {
    id: 'interview',
    title: '사전 인터뷰',
    description: '운동 이력, 통증 여부, 목표를 확인해 진단 기준을 맞춥니다.',
  },
  {
    id: 'capture',
    title: '스윙 촬영',
    description: '정면/측면 촬영으로 핵심 동작 구간을 분해합니다.',
  },
  {
    id: 'analysis',
    title: '5요소 분석',
    description: '셋업·백스윙·임팩트·템포·밸런스를 점수화합니다.',
  },
  {
    id: 'prescription',
    title: '개선 처방',
    description: '우선순위 드릴과 훈련 계획을 제시합니다.',
  },
];
