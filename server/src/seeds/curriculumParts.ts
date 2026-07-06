import { v4 as uuidv4 } from 'uuid';

export const CURRICULUM_PART_DEFS = [
  {
    partKey: 'physical',
    partOrder: 1,
    title: '신체',
    content: `## 신체 (Physical)

골프 퍼포먼스를 뒷받침하는 몸 만들기 영역입니다. 가동성·안정성·파워·지구력을 균형 있게 훈련합니다.

### 훈련 초점
- 척추·고관절·어깨의 가동성 확보
- 코어·하체 안정성으로 스윙 축 유지
- 회전 파워 훈련으로 헤드스피드 향상
- 18홀을 견디는 지구력과 부상 예방`,
    keyPoints: [
      '가동성(척추·고관절·어깨) 훈련을 정기적으로 실시한다',
      '코어 및 하체 안정성 훈련으로 스윙 축을 유지한다',
      '회전 파워 훈련으로 헤드스피드를 향상시킨다',
      '유산소·근지구력 훈련으로 라운드 후반 집중력을 유지한다',
    ],
  },
  {
    partKey: 'swing_technique',
    partOrder: 2,
    title: '스윙 기술',
    content: `## 스윙 기술 (Swing Technique)

그립·스탠스부터 풀 스윙 역학, 숏게임과 퍼팅까지 볼을 다루는 기술 전반을 다룹니다.

### 훈련 초점
- 그립·스탠스·어드레스 기본기
- 백스윙-다운스윙-임팩트-팔로우스루의 스윙 메커니즘
- 어프로치·칩·피치·벙커 등 숏게임 시스템
- 퍼팅 메커니즘과 거리 컨트롤`,
    keyPoints: [
      '그립·스탠스·어드레스의 기본 원리를 숙지한다',
      '다운스윙은 하체부터 시작하고 임팩트에서 핸즈 퍼스트를 유지한다',
      '숏게임(어프로치/칩/피치/벙커) 별 기술 차이를 이해한다',
      '퍼팅은 방향보다 거리 컨트롤이 핵심이다',
    ],
  },
  {
    partKey: 'equipment',
    partOrder: 3,
    title: '장비',
    content: `## 장비 (Equipment)

자신의 스윙과 체형에 맞는 장비를 이해하고 활용하는 영역입니다.

### 훈련 초점
- 클럽 스펙(샤프트 강도, 로프트, 라이각) 이해
- 클럽 피팅의 필요성과 시기
- 볼 선택이 스핀·탄도에 미치는 영향
- 장비 관리(그립 교체 주기, 클럽 점검)`,
    keyPoints: [
      '자신의 스윙 스피드에 맞는 샤프트 강도를 이해한다',
      '클럽 피팅을 통해 라이각·로프트를 최적화한다',
      '볼 스펙(스핀률, 압축강도)이 결과에 미치는 영향을 안다',
      '그립 마모 등 장비 상태를 주기적으로 점검한다',
    ],
  },
  {
    partKey: 'course_management',
    partOrder: 4,
    title: '코스매니지먼트',
    content: `## 코스매니지먼트 (Course Management)

코스를 읽고 리스크를 계산해 최선의 의사결정을 내리는 전략 영역입니다.

### 훈련 초점
- 빅 넘버(더블 보기 이상) 최소화 전략
- 미스 방향 계획과 강점 지점 활용
- 3샷 역산 전략으로 홀 설계
- 라운드 컨디션에 맞춘 전략 조정`,
    keyPoints: [
      '보기는 허용하되 빅 넘버는 최소화하는 전략을 세운다',
      '미스가 나도 안전한 방향으로 조준점을 계획한다',
      '자신의 강점 각도로 그린에 접근하는 위치를 선택한다',
      '3샷 역산 전략으로 홀 전체를 설계한다',
    ],
  },
  {
    partKey: 'mental',
    partOrder: 5,
    title: '멘탈',
    content: `## 멘탈 (Mental)

압박 상황에서 루틴을 유지하고 실수 후 빠르게 회복하는 마음 관리 영역입니다.

### 훈련 초점
- 프리샷 루틴 설계와 내면화
- 압박 상황 대처 (호흡, 루틴 전환, 프로세스 집중)
- 실수 후 회복력 (10초 룰)
- 라운드 전반의 집중력 관리`,
    keyPoints: [
      '10~15초의 프리샷 루틴을 확립하고 매 샷 적용한다',
      '압박 상황에서 호흡법으로 생리적 흥분을 조절한다',
      '실수 후 10초 룰로 감정을 정리하고 다음 샷에 집중한다',
      '결과가 아닌 과정(프로세스)에 집중하는 습관을 들인다',
    ],
  },
] as const;

export type CurriculumPartKey = typeof CURRICULUM_PART_DEFS[number]['partKey'];

export function buildDefaultCurriculumParts(curriculumId: string, now: number) {
  return CURRICULUM_PART_DEFS.map((def) => ({
    id: uuidv4(),
    curriculumId,
    partKey: def.partKey,
    partOrder: def.partOrder,
    title: def.title,
    content: def.content,
    keyPoints: [...def.keyPoints],
    createdAt: now,
    updatedAt: now,
  }));
}
