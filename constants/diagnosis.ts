import { DiagnosisFactor, DiagnosisProcessStep } from '../types/diagnosis';

export const DIAGNOSIS_FACTORS: DiagnosisFactor[] = [
  {
    key: 'body',
    label: '골프 체형 분석 및 능력 진단',
    score: 72,
    maxScore: 100,
    description: '유연성·가동성·밸런스를 기반으로 스윙 수행에 필요한 신체 조건을 진단합니다.',
  },
  {
    key: 'equipment',
    label: '장비 진단',
    score: 69,
    maxScore: 100,
    description: '현재 클럽 및 장비 스펙이 플레이 특성과 신체 조건에 적합한지 점검합니다.',
  },
  {
    key: 'skill',
    label: '기술 진단',
    score: 76,
    maxScore: 100,
    description: '스윙과 숏게임의 기술 완성도, 미스 패턴, 일관성을 통합 분석합니다.',
  },
  {
    key: 'courseManagement',
    label: '코스 매니지먼트 진단',
    score: 70,
    maxScore: 100,
    description: '클럽 선택, 공략 전략, 리스크 관리 등 실전 의사결정 역량을 진단합니다.',
  },
  {
    key: 'mental',
    label: '멘탈 진단',
    score: 74,
    maxScore: 100,
    description: '집중력, 압박 대응, 실수 후 회복력 등 경기력에 영향을 주는 심리 요소를 분석합니다.',
  },
];

export const DIAGNOSIS_PROCESS: DiagnosisProcessStep[] = [
  {
    id: 'profile',
    title: '기본 정보 및 플레이 목표 확인',
    description: '구력, 평균 스코어, 연습 패턴, 개선 목표를 확인해 진단 기준을 설정합니다.',
  },
  {
    id: 'domain-assessment',
    title: '5개 핵심 영역 진단',
    description: '신체·장비·기술·코스 매니지먼트·멘탈 영역을 데이터와 설문 기반으로 진단합니다.',
  },
  {
    id: 'integrated-analysis',
    title: '통합 분석 및 결과 리포트',
    description: '5개 영역 결과를 통합해 현재 병목과 스코어 손실 요인을 도출합니다.',
  },
  {
    id: 'roadmap',
    title: '맞춤형 개선 로드맵 제안',
    description: '우선순위 기반으로 개인 맞춤 실행 과제와 개선 순서를 제안합니다.',
  },
];
