import { DiagnosisFactor, DiagnosisProcessStep } from '../types/diagnosis';

export const DIAGNOSIS_FACTORS: DiagnosisFactor[] = [
  {
    key: 'body',
    label: '골프 체형 분석 및 능력 진단',
    score: 72,
    maxScore: 100,
    description:
      '고객의 자세를 촬영한 뒤 스켈레톤 분석을 통해 키를 기준으로 신체 길이와 기울기를 측정하고, 체형 정렬과 움직임 특성을 분석합니다.',
  },
  {
    key: 'equipment',
    label: '장비 진단',
    score: 69,
    maxScore: 100,
    description:
      '트랙맨 데이터 화면을 캡처해 드라이버와 6번 아이언의 주요 측정값을 수집하고, 클럽별 최적화 기준 데이터와 비교하여 성능 차이와 개선 필요 요소를 분석합니다.',
  },
  {
    key: 'skill',
    label: '기술 진단',
    score: 76,
    maxScore: 100,
    description:
      '트랙맨 데이터를 활용해 130m, 150m, 170m, 190m, 210m 목표 샷과 30m, 50m, 70m, 100m 숏게임 샷의 캐리, 토탈 거리, 탄착군, 발사각, 최고점, 스핀을 분석하고, 거리 제어 능력과 핀 위치별 공략 기술을 평가합니다.',
  },
];

export const DIAGNOSIS_PROCESS: DiagnosisProcessStep[] = [
  {
    id: 'golfer-profile',
    title: '골퍼 기본정보 입력',
    description: '골퍼 기본정보를 입력하고 진단 기준을 설정합니다.',
  },
  {
    id: 'body-diagnosis',
    title: '신체 체형 진단',
    description: '신체 체형 데이터를 입력해 정렬과 움직임 특성을 확인합니다.',
  },
  {
    id: 'equipment-diagnosis',
    title: '장비 진단',
    description: '클럽과 측정값을 기준으로 장비 적합성을 확인합니다.',
  },
  {
    id: 'skill-diagnosis',
    title: '기술 진단',
    description: '거리대별 샷 데이터를 바탕으로 기술 수행 수준을 확인합니다.',
  },
  {
    id: 'course-mental',
    title: '코스메니지먼트 & 멘탈',
    description: '코스 운영과 멘탈 루틴 관점의 진단 의견을 입력합니다.',
  },
  {
    id: 'integrated-report',
    title: '통합 데이터 분석 리포트',
    description: '입력된 전체 진단 정보를 통합해 결과 리포트를 생성합니다.',
  },
];
