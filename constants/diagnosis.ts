import { DiagnosisFactor, DiagnosisProcessStep } from '../types/diagnosis';

export const DIAGNOSIS_FACTORS: DiagnosisFactor[] = [
  {
    key: 'body',
    label: '골프 체형 분석 및 능력 진단',
    score: 74,
    maxScore: 100,
    description:
      '고객의 자세를 촬영한 뒤 스켈레톤 분석을 통해 키를 기준으로 신체 길이와 기울기를 측정하고, 체형 정렬과 움직임 특성을 분석합니다.',
  },
  {
    key: 'equipment',
    label: '장비 진단',
    score: 68,
    maxScore: 100,
    description:
      '트랙맨 데이터 화면을 캡처해 드라이버와 6번 아이언의 주요 측정값을 수집하고, 클럽별 최적화 기준 데이터와 비교하여 성능 차이와 개선 필요 요소를 분석합니다.',
  },
  {
    key: 'skill',
    label: '기술 진단',
    score: 82,
    maxScore: 100,
    description:
      '트랙맨 데이터를 활용해 130m, 150m, 170m, 190m, 210m 목표 샷과 30m, 50m, 70m, 100m 숏게임 샷의 캐리, 토탈 거리, 탄착군, 발사각, 최고점, 스핀을 분석하고, 거리 제어 능력과 핀 위치별 공략 기술을 평가합니다.',
  },
];

export const DIAGNOSIS_PROCESS: DiagnosisProcessStep[] = [
  {
    id: 'goal-check',
    title: '기본 정보 및 플레이 목표 확인',
    description: '회원 기본 정보와 현재 플레이 목표를 확인해 진단 기준을 설정합니다.',
  },
  {
    id: 'area-diagnosis',
    title: '체형·장비·기술 진단 진행',
    description: '자세 촬영/트랙맨 데이터 수집을 기반으로 3개 핵심 영역을 진단합니다.',
  },
  {
    id: 'integrated-report',
    title: '통합 분석 및 결과 리포트 제공',
    description: '3개 영역 결과를 통합 분석해 병목 요인과 우선 개선 과제를 도출합니다.',
  },
  {
    id: 'action-plan',
    title: '개선 방향 확인',
    description: '통합 리포트를 바탕으로 맞춤형 개선 방향과 실행 우선순위를 확인합니다.',
  },
];
