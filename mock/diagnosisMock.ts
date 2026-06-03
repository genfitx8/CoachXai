import { DiagnosisSession } from '../types/diagnosis';

export const mockDiagnosisSession: DiagnosisSession = {
  id: 'diag_001',
  applicationId: 'app_001',
  clientName: '김민준',
  coachName: '박성현',
  conductedAt: Date.now() - 7 * 24 * 60 * 60 * 1000, // 1 week ago
  status: 'COMPLETED',
  totalScore: 326,
  maxTotalScore: 500,
  overallComment:
    '전반적으로 기술적 기반은 안정적이나, 코스 매니지먼트와 멘탈 제어 영역에서 명확한 개선 기회가 있습니다. 특히 압박 상황에서의 의사결정과 리스크 관리 능력을 집중 훈련하면 2~3개월 내 2~3타 향상이 가능할 것으로 판단됩니다.',
  grade: 'B',
  level: 'DEVELOPING',
  partScores: [
    {
      partType: 'COURSE_MANAGEMENT',
      score: 58,
      maxScore: 100,
      summary:
        '홀별 공략 계획은 있으나 실행 일관성이 부족합니다. 특히 위험 구역 인근 티샷 시 불필요한 도전 샷이 스코어를 높이는 주요 원인입니다.',
      metrics: [
        { metricId: 'cm_strategy', score: 16, comment: '공략 계획 수립 능력은 있으나 코스별 편차가 큽니다.' },
        { metricId: 'cm_club_selection', score: 14, comment: '거리 계산은 정확하나 바람과 경사 반영이 미흡합니다.' },
        { metricId: 'cm_risk_management', score: 13, comment: '위험 구역에서의 도전 빈도가 높아 더블보기 유발.' },
        { metricId: 'cm_scoring', score: 15, comment: '파세이브 성공률 62%로 개선 여지가 있습니다.' },
      ],
    },
    {
      partType: 'MENTAL_CONTROL',
      score: 61,
      maxScore: 100,
      summary:
        '집중력과 자신감은 양호하나, 실수 후 감정 회복이 느려 연속 보기로 이어지는 경향이 있습니다. 루틴 확립이 핵심 과제입니다.',
      metrics: [
        { metricId: 'mc_focus', score: 18, comment: '일반 상황에서의 집중력은 우수합니다.' },
        { metricId: 'mc_emotion', score: 14, comment: '더블보기 이후 다음 홀 성적 저하 패턴 확인.' },
        { metricId: 'mc_pressure', score: 14, comment: '후반 9홀 압박 상황에서 스코어 붕괴 빈도 높음.' },
        { metricId: 'mc_confidence', score: 15, comment: '자신 있는 클럽과 그렇지 않은 클럽의 차이가 큽니다.' },
      ],
    },
    {
      partType: 'TECHNICAL',
      score: 74,
      maxScore: 100,
      summary:
        '드라이버와 아이언 메카닉스는 안정적이며 TrackMan 데이터상 스매시팩터가 우수합니다. 어프로치 거리 조절과 3m 이내 퍼팅 성공률 향상이 다음 단계 목표입니다.',
      metrics: [
        { metricId: 'tc_swing', score: 20, comment: '스윙 플레인 일관성 양호, 임팩트 포지션 안정.' },
        { metricId: 'tc_approach', score: 17, comment: '50m 이내 거리 조절 오차 ±8m, 개선 필요.' },
        { metricId: 'tc_putting', score: 18, comment: '3m 이내 퍼팅 성공률 54%로 평균 이하.' },
        { metricId: 'tc_driver', score: 19, comment: '평균 비거리 248m, 방향성 페어웨이 안착률 71%.' },
      ],
    },
    {
      partType: 'PHYSICAL',
      score: 70,
      maxScore: 100,
      summary:
        '하체 안정성과 코어 근력은 우수하나, 흉추 회전 가동성에 제한이 확인됩니다. 유연성 개선을 통해 백스윙 충분한 어깨 회전을 확보하면 비거리 증가가 기대됩니다.',
      metrics: [
        { metricId: 'ph_flexibility', score: 16, comment: '흉추 회전 각도 42°로 목표치(50°) 미달.' },
        { metricId: 'ph_strength', score: 19, comment: '코어 안정성 및 하체 근력 우수.' },
        { metricId: 'ph_balance', score: 19, comment: '스윙 밸런스 점수 상위 20%.' },
        { metricId: 'ph_endurance', score: 16, comment: '후반 9홀 체력 저하로 스윙 일관성 감소.' },
      ],
    },
    {
      partType: 'EQUIPMENT',
      score: 63,
      maxScore: 100,
      summary:
        '드라이버 샤프트 플렉스가 스윙 스피드 대비 약간 부드러워 에너지 손실이 발생하고 있습니다. 아이언 라이각 재조정 및 퍼터 길이 최적화를 권장합니다.',
      metrics: [
        { metricId: 'eq_fitting', score: 16, comment: '아이언 라이각 2° 플랫 조정 필요.' },
        { metricId: 'eq_shaft', score: 15, comment: '드라이버 샤프트 SR → S 플렉스 변경 검토.' },
        { metricId: 'eq_ball', score: 17, comment: '현재 볼 선택 스윙 스피드에 적합.' },
        { metricId: 'eq_condition', score: 15, comment: '아이언 그루브 마모, 웨지 교체 권장.' },
      ],
    },
  ],
  recommendations: [
    {
      id: 'rec_001',
      partType: 'COURSE_MANAGEMENT',
      category: 'IMMEDIATE',
      priority: 1,
      title: '위험 구역 티샷 클럽 다운그레이드',
      detail: '해저드·OB 인근 홀에서는 드라이버 대신 3번 우드 또는 하이브리드를 사용하는 규칙을 설정하세요. 3라운드 적용만으로 더블보기 발생 빈도 30% 감소 효과가 예상됩니다.',
      estimatedWeeks: 1,
    },
    {
      id: 'rec_002',
      partType: 'MENTAL_CONTROL',
      category: 'IMMEDIATE',
      priority: 2,
      title: '실수 후 리셋 루틴 확립',
      detail: '더블보기 이후 다음 홀 티잉그라운드에서 3회 깊게 호흡하고 긍정적 목표만 설정하는 루틴을 만드세요. 부정적 감정 연장 차단이 핵심입니다.',
      estimatedWeeks: 2,
    },
    {
      id: 'rec_003',
      partType: 'TECHNICAL',
      category: 'SHORT_TERM',
      priority: 3,
      title: '50m 이내 어프로치 거리 제어 훈련',
      detail: '50, 60, 70m 거리별 반복 훈련으로 캐리 오차를 ±5m 이내로 줄이세요. 주 3회 30분 이상 집중 훈련을 권장합니다.',
      estimatedWeeks: 4,
    },
    {
      id: 'rec_004',
      partType: 'PHYSICAL',
      category: 'SHORT_TERM',
      priority: 4,
      title: '흉추 회전 스트레칭 프로그램',
      detail: '매일 아침 10분 흉추 가동성 루틴을 수행하세요. 목표는 6주 내 흉추 회전 50° 달성입니다. 제공된 운동 가이드 영상을 참고하세요.',
      estimatedWeeks: 6,
    },
    {
      id: 'rec_005',
      partType: 'EQUIPMENT',
      category: 'LONG_TERM',
      priority: 5,
      title: '드라이버 샤프트 피팅 및 아이언 라이각 조정',
      detail: 'S 플렉스 샤프트 테스트 피팅 후 최적 모델을 선택하세요. 아이언 라이각 2° 플랫 조정은 샷 방향성 개선에 즉각적인 효과를 줍니다.',
      estimatedWeeks: 8,
    },
    {
      id: 'rec_006',
      partType: 'TECHNICAL',
      category: 'SHORT_TERM',
      priority: 6,
      title: '3m 이내 퍼팅 집중 훈련',
      detail: '매 연습 세션 마지막 15분을 3m 퍼팅에 할애하세요. 원형 드릴(3m 반경 8방향)로 다양한 라인 경험을 쌓으세요.',
      estimatedWeeks: 4,
    },
  ],
  followUpPlan: {
    nextCheckInWeeks: 6,
    coachNote:
      '6주 후 중간 점검에서 코스 매니지먼트와 퍼팅 지표를 우선 확인할 예정입니다. 연습 일지를 앱에 기록해 두세요.',
    items: [
      {
        weekOffset: 1,
        title: '루틴 정착 주간',
        description: '위험 구역 클럽 다운그레이드 규칙 및 리셋 루틴 3라운드 적용.',
        partTypes: ['COURSE_MANAGEMENT', 'MENTAL_CONTROL'],
      },
      {
        weekOffset: 2,
        title: '어프로치 집중 훈련',
        description: '50~70m 거리별 어프로치 주 3회 30분 훈련 시작, 흉추 스트레칭 매일.',
        partTypes: ['TECHNICAL', 'PHYSICAL'],
      },
      {
        weekOffset: 4,
        title: '장비 피팅 예약',
        description: '드라이버 샤프트 테스트 피팅 예약 및 아이언 라이각 조정 진행.',
        partTypes: ['EQUIPMENT'],
      },
      {
        weekOffset: 6,
        title: '중간 점검',
        description: '코치 1:1 세션에서 개선 사항 확인 및 다음 단계 계획 수립.',
        partTypes: ['COURSE_MANAGEMENT', 'MENTAL_CONTROL', 'TECHNICAL', 'PHYSICAL', 'EQUIPMENT'],
      },
    ],
  },
  assets: [
    {
      id: 'asset_001',
      type: 'SWING_VIDEO',
      label: '드라이버 스윙 (정면)',
      url: 'https://placehold.co/640x360?text=Driver+Swing+Front',
      capturedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
      note: 'TrackMan 동시 측정',
    },
    {
      id: 'asset_002',
      type: 'SWING_VIDEO',
      label: '드라이버 스윙 (측면)',
      url: 'https://placehold.co/640x360?text=Driver+Swing+Side',
      capturedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
    },
    {
      id: 'asset_003',
      type: 'TRACKMAN_CAPTURE',
      label: 'TrackMan 데이터 캡처',
      url: 'https://placehold.co/800x500?text=TrackMan+Data',
      capturedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
      note: '평균 10구 데이터',
    },
    {
      id: 'asset_004',
      type: 'BODY_SCAN',
      label: '신체 측정 결과',
      url: 'https://placehold.co/600x400?text=Body+Scan+Result',
      capturedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
    },
  ],
};
