export type ImpactLevel = '상' | '하' | '-';

export type BodyType =
  | '이상체형'
  | '삼각체형'
  | '역삼각체형'
  | '사각체형'
  | '모래시계형'
  | '마름모꼴체형'
  | '둥근체형'
  | '튜브체형';

export type SwingType = '지렛대형' | '아크형' | '넓이형';

export interface StructuralMetricInput {
  frontAxisTiltDeg?: number; // 정면 축 기울기(좌우)
  headTiltDeg?: number; // 머리 균형도
  shoulderTiltDeg?: number; // 어깨 균형도
  pelvisTiltDeg?: number; // 골반 균형도
  kneeTiltDeg?: number; // 무릎 균형도
  rightBowLegDeg?: number; // 오른쪽 오다리 값
  leftBowLegDeg?: number; // 왼쪽 오다리 값
  sideTiltDeg?: number; // 측면 기울기(앞뒤)
  sideHeadTiltDeg?: number; // 측면 머리 균형도
  forwardHeadDeg?: number; // 거북목 여부(각도)
  roundedShoulderDeg?: number; // 굽은 어깨 기울기
}

export interface StructuralFactorResult {
  name: string;
  value: string;
  impact: ImpactLevel;
}

export interface BodyShapePatternScores {
  이상체형?: number;
  삼각체형?: number;
  역삼각체형?: number;
  사각체형?: number;
  모래시계형?: number;
  마름모꼴체형?: number;
  둥근체형?: number;
  튜브체형?: number;
}

export interface SwingSnapshotInput {
  headSpeed: number;
  ballSpeed: number;
  smashFactor: number;
  missClass: 'MISS' | 'NOT_BAD' | 'GOOD';
  sa: string;
  bt: number;
  tbec: 'YES' | 'NO';
}

export interface StandardSwingModel {
  id: string;
  swingType: SwingType;
  headSpeedRange: [number, number];
  ballSpeedRange: [number, number];
  smashFactorRange: [number, number];
  btRange: [number, number];
}

export interface BodyAnalysisResult {
  structuralFactors: StructuralFactorResult[];
  bodyType: BodyType;
  swingType: SwingType;
}

export interface SwingAiCoachingResult extends BodyAnalysisResult {
  nearestModelId: string | null;
  problemSummary: string[];
  personalizedSolution: string[];
}

export interface ShotClassificationResult {
  problemSummary: string[];
  needsBtDrill: boolean;
}

const bodyTypeToSwingType: Record<BodyType, SwingType> = {
  이상체형: '지렛대형',
  삼각체형: '아크형',
  역삼각체형: '넓이형',
  사각체형: '아크형',
  모래시계형: '지렛대형',
  마름모꼴체형: '넓이형',
  둥근체형: '넓이형',
  튜브체형: '넓이형',
};

const BODY_TYPES: BodyType[] = [
  '이상체형',
  '삼각체형',
  '역삼각체형',
  '사각체형',
  '모래시계형',
  '마름모꼴체형',
  '둥근체형',
  '튜브체형',
];

const BT_DRILL_THRESHOLD = 85;

function toDirectionValue(angle?: number): string {
  if (angle === undefined || Number.isNaN(angle)) return '-';
  if (angle === 0) return '0°';
  const direction = angle < 0 ? 'L' : 'R';
  return `${direction}/${Math.abs(angle).toFixed(2)}°`;
}

function toImpactLevel(angle: number | undefined, highThreshold: number): ImpactLevel {
  if (angle === undefined || Number.isNaN(angle)) return '-';
  return Math.abs(angle) >= highThreshold ? '상' : '하';
}

/**
 * 신체 구조 특성 수치화 영향도 분석
 * - 이미지 자료에 나온 항목을 동일하게 산출하도록 구성
 */
export function analyzeStructuralFactors(input: StructuralMetricInput): StructuralFactorResult[] {
  return [
    { name: '정면 축 기울기(좌우 기울기)', value: toDirectionValue(input.frontAxisTiltDeg), impact: toImpactLevel(input.frontAxisTiltDeg, 3) },
    { name: '머리 균형도(머리 기울기)', value: toDirectionValue(input.headTiltDeg), impact: toImpactLevel(input.headTiltDeg, 2.5) },
    { name: '어깨 균형도(어깨 기울기)', value: toDirectionValue(input.shoulderTiltDeg), impact: toImpactLevel(input.shoulderTiltDeg, 3) },
    { name: '골반 균형도(골반 기울기)', value: toDirectionValue(input.pelvisTiltDeg), impact: toImpactLevel(input.pelvisTiltDeg, 3) },
    { name: '무릎 균형도(무릎 기울기)', value: toDirectionValue(input.kneeTiltDeg), impact: toImpactLevel(input.kneeTiltDeg, 3) },
    { name: '오른쪽 오다리 값', value: toDirectionValue(input.rightBowLegDeg), impact: toImpactLevel(input.rightBowLegDeg, 3) },
    { name: '왼쪽 오다리값', value: toDirectionValue(input.leftBowLegDeg), impact: toImpactLevel(input.leftBowLegDeg, 3) },
    { name: '측면 기울기(앞뒤 기울기)', value: input.sideTiltDeg === undefined ? '-' : `${input.sideTiltDeg.toFixed(1)}°`, impact: toImpactLevel(input.sideTiltDeg, 4) },
    { name: '측면 머리 균형도(측면 머리 기울기)', value: input.sideHeadTiltDeg === undefined ? '-' : `${input.sideHeadTiltDeg.toFixed(1)}°`, impact: toImpactLevel(input.sideHeadTiltDeg, 3) },
    { name: '거북목 여부', value: input.forwardHeadDeg === undefined ? '-' : `${input.forwardHeadDeg.toFixed(1)}°`, impact: toImpactLevel(input.forwardHeadDeg, 4) },
    { name: '굽은 어깨 기울기', value: input.roundedShoulderDeg === undefined ? '-' : input.roundedShoulderDeg.toFixed(1), impact: toImpactLevel(input.roundedShoulderDeg, 1) },
  ];
}

/**
 * 2D에서 3D로 도출된 체형 패턴 점수 중 최대값을 체형으로 채택.
 */
export function classifyBodyType(patternScores: BodyShapePatternScores): BodyType {
  let bestType: BodyType = '사각체형';
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const type of BODY_TYPES) {
    const score = patternScores[type] ?? Number.NEGATIVE_INFINITY;
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  return bestType;
}

/**
 * 자료 내 "체형 종류 → 스윙 유형" 매핑을 그대로 사용.
 */
export function inferSwingTypeFromBodyType(bodyType: BodyType): SwingType {
  return bodyTypeToSwingType[bodyType];
}

function modelDistance(snapshot: SwingSnapshotInput, model: StandardSwingModel): number {
  const center = (range: [number, number]) => (range[0] + range[1]) / 2;

  const dHead = Math.abs(snapshot.headSpeed - center(model.headSpeedRange));
  const dBall = Math.abs(snapshot.ballSpeed - center(model.ballSpeedRange));
  const dSmash = Math.abs(snapshot.smashFactor - center(model.smashFactorRange));
  const dBt = Math.abs(snapshot.bt - center(model.btRange));

  return dHead + dBall + dSmash * 30 + dBt;
}

function findNearestModel(snapshot: SwingSnapshotInput, models: StandardSwingModel[], swingType: SwingType): StandardSwingModel | null {
  const candidates = models.filter(m => m.swingType === swingType);
  if (!candidates.length) return null;

  return candidates.reduce((best, curr) => (modelDistance(snapshot, curr) < modelDistance(snapshot, best) ? curr : best));
}

export function classifyShot(snapshot: SwingSnapshotInput): ShotClassificationResult {
  const problemSummary: string[] = [];
  const needsBtDrill = snapshot.bt <= BT_DRILL_THRESHOLD;

  if (snapshot.missClass === 'MISS') {
    problemSummary.push('미스샷 분류가 MISS로 확인되었습니다.');
  }
  if (needsBtDrill) {
    problemSummary.push(`백스윙 턴(BT)이 ${BT_DRILL_THRESHOLD}도 이하(포함)로 중심축 이동 제한이 필요합니다.`);
  }
  if (snapshot.sa.toUpperCase().includes('LEFT MOVE')) {
    problemSummary.push('백스윙 시 중심축이 좌측으로 이동하는 패턴이 관찰됩니다.');
  }

  return {
    problemSummary,
    needsBtDrill,
  };
}

export function analyzeImpact(structuralFactors: StructuralFactorResult[]): string[] {
  return structuralFactors
    .filter(f => f.impact === '상')
    .map(f => f.name);
}

/**
 * "신체 분석 + 샷/모션 데이터 + 표준 모델(예: 729개) 비교" 흐름 구현
 */
export function buildSwingAiCoachingResult(params: {
  structuralInput: StructuralMetricInput;
  patternScores: BodyShapePatternScores;
  swingSnapshot: SwingSnapshotInput;
  standardModels: StandardSwingModel[];
}): SwingAiCoachingResult {
  const structuralFactors = analyzeStructuralFactors(params.structuralInput);
  const bodyType = classifyBodyType(params.patternScores);
  const swingType = inferSwingTypeFromBodyType(bodyType);
  const nearestModel = findNearestModel(params.swingSnapshot, params.standardModels, swingType);
  const shotClassification = classifyShot(params.swingSnapshot);
  const highImpact = analyzeImpact(structuralFactors);
  const problemSummary: string[] = [...shotClassification.problemSummary];
  if (highImpact.length) {
    problemSummary.push(`신체 특성 고영향 항목: ${highImpact.join(', ')}`);
  }

  const personalizedSolution = [
    '문제점에 따른 동작 훈련 방법 제시',
    '개인 훈련 중 실시간 스윙 모션 비교 분석',
    '스윙 변화 히스토리 추적',
  ];

  if (shotClassification.needsBtDrill) {
    personalizedSolution.push('중심축 좌우 이동을 제한하는 체중 이동 드릴 제공');
  }

  return {
    structuralFactors,
    bodyType,
    swingType,
    nearestModelId: nearestModel?.id ?? null,
    problemSummary,
    personalizedSolution,
  };
}
