import {
  DiagnosisPartType,
  MetricDefinition,
  GradeDefinition,
  DiagnosisGrade,
  DiagnosisLevel,
  ProgramOverview,
  ApplicationStatus,
  DiagnosisStatus,
  RecommendationCategory,
} from '../types/diagnosis';

// ─── Five diagnosis parts ─────────────────────────────────────────────────────

export interface DiagnosisPartDefinition {
  type: DiagnosisPartType;
  title: string;
  shortTitle: string;
  description: string;
  maxScore: number;
  icon: string; // emoji
  metrics: MetricDefinition[];
}

export const DIAGNOSIS_PARTS: DiagnosisPartDefinition[] = [
  {
    type: 'COURSE_MANAGEMENT',
    title: '코스 매니지먼트',
    shortTitle: '코스 관리',
    description: '코스 공략 전략, 클럽 선택, 리스크 관리 능력을 평가합니다.',
    maxScore: 100,
    icon: '🗺️',
    metrics: [
      { id: 'cm_strategy', label: '공략 전략', maxScore: 25, description: '홀별 공략 계획 수립 능력' },
      { id: 'cm_club_selection', label: '클럽 선택', maxScore: 25, description: '상황별 클럽 선택의 정확성' },
      { id: 'cm_risk_management', label: '리스크 관리', maxScore: 25, description: '무리한 샷 억제 및 안전 플레이' },
      { id: 'cm_scoring', label: '스코어링', maxScore: 25, description: '파세이브 및 버디 기회 전환' },
    ],
  },
  {
    type: 'MENTAL_CONTROL',
    title: '멘탈 및 심리 제어',
    shortTitle: '멘탈',
    description: '경기 중 감정 조절, 루틴, 집중력 유지 능력을 평가합니다.',
    maxScore: 100,
    icon: '🧠',
    metrics: [
      { id: 'mc_focus', label: '집중력', maxScore: 25, description: '매 샷 집중 및 루틴 일관성' },
      { id: 'mc_emotion', label: '감정 조절', maxScore: 25, description: '실수 후 감정 회복 속도' },
      { id: 'mc_pressure', label: '압박 관리', maxScore: 25, description: '중요 순간 압박 대처 능력' },
      { id: 'mc_confidence', label: '자신감', maxScore: 25, description: '긍정적 자기 암시 및 확신' },
    ],
  },
  {
    type: 'TECHNICAL',
    title: '기술 진단',
    shortTitle: '기술',
    description: '스윙 메카닉스, 어프로치, 퍼팅 등 기술적 요소를 종합 평가합니다.',
    maxScore: 100,
    icon: '⛳',
    metrics: [
      { id: 'tc_swing', label: '스윙 메카닉스', maxScore: 25, description: '어드레스, 백스윙, 임팩트, 팔로우 스루' },
      { id: 'tc_approach', label: '어프로치 & 쇼트게임', maxScore: 25, description: '100m 이내 샷 정확성 및 거리 조절' },
      { id: 'tc_putting', label: '퍼팅', maxScore: 25, description: '퍼팅 라인 읽기 및 거리감' },
      { id: 'tc_driver', label: '드라이버 & 장타', maxScore: 25, description: '티샷 방향성 및 비거리' },
    ],
  },
  {
    type: 'PHYSICAL',
    title: '신체 능력 및 제한',
    shortTitle: '신체',
    description: '유연성, 근력, 밸런스, 체력 등 골프에 필요한 신체 조건을 평가합니다.',
    maxScore: 100,
    icon: '💪',
    metrics: [
      { id: 'ph_flexibility', label: '유연성', maxScore: 25, description: '척추 회전, 어깨·고관절 가동성' },
      { id: 'ph_strength', label: '근력', maxScore: 25, description: '코어 및 하체 안정성' },
      { id: 'ph_balance', label: '밸런스', maxScore: 25, description: '스윙 중 체중 이동 및 정적 밸런스' },
      { id: 'ph_endurance', label: '지구력', maxScore: 25, description: '18홀 체력 유지 능력' },
    ],
  },
  {
    type: 'EQUIPMENT',
    title: '장비 진단',
    shortTitle: '장비',
    description: '클럽 피팅 적합도, 샤프트 특성, 볼 선택 등 장비의 최적화 수준을 평가합니다.',
    maxScore: 100,
    icon: '🏌️',
    metrics: [
      { id: 'eq_fitting', label: '클럽 피팅', maxScore: 25, description: '체형·스윙에 맞는 클럽 세트 구성' },
      { id: 'eq_shaft', label: '샤프트 특성', maxScore: 25, description: '플렉스, 무게, 킥포인트 적합도' },
      { id: 'eq_ball', label: '볼 선택', maxScore: 25, description: '스윙 속도 및 게임 스타일에 맞는 볼' },
      { id: 'eq_condition', label: '장비 상태', maxScore: 25, description: '클럽 마모도 및 유지보수 상태' },
    ],
  },
];

// ─── Grade thresholds ─────────────────────────────────────────────────────────

export const GRADE_DEFINITIONS: GradeDefinition[] = [
  {
    grade: 'S',
    level: 'ELITE',
    label: 'Elite',
    description: '프로 수준의 역량을 갖춘 최상위 골퍼입니다.',
    minScore: 90,
    maxScore: 100,
    color: 'text-yellow-300',
  },
  {
    grade: 'A',
    level: 'ADVANCED',
    label: 'Advanced',
    description: '싱글 핸디캡 수준의 고급 골퍼입니다.',
    minScore: 75,
    maxScore: 89,
    color: 'text-emerald-400',
  },
  {
    grade: 'B',
    level: 'DEVELOPING',
    label: 'Developing',
    description: '꾸준한 발전 중인 중급 골퍼입니다.',
    minScore: 55,
    maxScore: 74,
    color: 'text-sky-400',
  },
  {
    grade: 'C',
    level: 'FOUNDATION',
    label: 'Foundation',
    description: '기초를 다지고 있는 입문 골퍼입니다.',
    minScore: 35,
    maxScore: 54,
    color: 'text-orange-400',
  },
  {
    grade: 'D',
    level: 'RESET_NEEDED',
    label: 'Reset Needed',
    description: '근본적인 재정립이 필요한 단계입니다.',
    minScore: 0,
    maxScore: 34,
    color: 'text-red-400',
  },
];

// ─── Program overview ─────────────────────────────────────────────────────────

export const DIAGNOSIS_PROGRAM_OVERVIEW: ProgramOverview = {
  title: '정밀 진단 프로그램',
  subtitle: 'Precision Golf Diagnosis',
  description:
    '5가지 핵심 영역을 전문 코치가 체계적으로 분석하여, 당신의 골프를 다음 레벨로 끌어올릴 맞춤 로드맵을 제공합니다.',
  duration: '약 2~3시간',
  price: '₩350,000',
  includesItems: [
    '5개 영역 심층 분석 리포트',
    'TrackMan 데이터 분석',
    '스윙 영상 분석 (4방향)',
    '신체 능력 측정',
    '장비 피팅 점검',
    '개인 맞춤 12주 훈련 로드맵',
    '코치 1:1 피드백 세션',
  ],
};

// ─── Status label maps ────────────────────────────────────────────────────────

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  SUBMITTED: '신청 완료',
  UNDER_REVIEW: '검토 중',
  SCHEDULED: '일정 확정',
  COMPLETED: '완료',
  REJECTED: '취소',
};

export const DIAGNOSIS_STATUS_LABELS: Record<DiagnosisStatus, string> = {
  PENDING: '대기 중',
  IN_PROGRESS: '진행 중',
  COMPLETED: '완료',
  CANCELLED: '취소',
};

export const RECOMMENDATION_CATEGORY_LABELS: Record<RecommendationCategory, string> = {
  IMMEDIATE: '즉시 개선',
  SHORT_TERM: '단기 (1-4주)',
  LONG_TERM: '장기 (1-3개월)',
  MAINTENANCE: '유지',
};
