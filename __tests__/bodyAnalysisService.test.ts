import { describe, expect, it } from 'vitest';
import {
  analyzeStructuralFactors,
  buildSwingAiCoachingResult,
  classifyBodyType,
  deriveCause,
  inferSwingTypeFromBodyType,
  StandardSwingModel,
} from '../services/bodyAnalysisService';

describe('bodyAnalysisService', () => {
  it('자료의 체형→스윙유형 매핑을 그대로 반환한다', () => {
    expect(inferSwingTypeFromBodyType('이상체형')).toBe('지렛대형');
    expect(inferSwingTypeFromBodyType('삼각체형')).toBe('아크형');
    expect(inferSwingTypeFromBodyType('역삼각체형')).toBe('넓이형');
    expect(inferSwingTypeFromBodyType('사각체형')).toBe('아크형');
    expect(inferSwingTypeFromBodyType('모래시계형')).toBe('지렛대형');
    expect(inferSwingTypeFromBodyType('마름모꼴체형')).toBe('넓이형');
    expect(inferSwingTypeFromBodyType('둥근체형')).toBe('넓이형');
    expect(inferSwingTypeFromBodyType('튜브체형')).toBe('넓이형');
  });

  it('체형 패턴 점수 최대값 기준으로 체형을 분류한다', () => {
    const bodyType = classifyBodyType({
      사각체형: 35.9,
      삼각체형: 12.2,
      역삼각체형: 33.2,
      이상체형: 10,
    });

    expect(bodyType).toBe('사각체형');
  });

  it('신체 구조 특성 분석 결과에서 고영향도를 판정한다', () => {
    const factors = analyzeStructuralFactors({
      frontAxisTiltDeg: -3.4,
      headTiltDeg: -3.2,
      pelvisTiltDeg: 2.83,
      rightBowLegDeg: 3.3,
      sideTiltDeg: -3.6,
      roundedShoulderDeg: -1.2,
    });

    expect(factors.find(f => f.name.includes('정면 축'))?.impact).toBe('상');
    expect(factors.find(f => f.name.includes('머리 균형도(머리'))?.impact).toBe('상');
    expect(factors.find(f => f.name.includes('골반'))?.impact).toBe('하');
    expect(factors.find(f => f.name.includes('오른쪽 오다리'))?.impact).toBe('상');
    expect(factors.find(f => f.name.includes('측면 기울기'))?.impact).toBe('하');
    expect(factors.find(f => f.name.includes('굽은 어깨'))?.impact).toBe('상');
  });

  it('스윙 AI 코칭 결과를 문제요약/해결책 형태로 생성한다', () => {
    const models: StandardSwingModel[] = [
      {
        id: 'model-001',
        swingType: '아크형',
        headSpeedRange: [95, 100],
        ballSpeedRange: [138, 144],
        smashFactorRange: [1.39, 1.44],
        btRange: [86, 92],
      },
      {
        id: 'model-002',
        swingType: '넓이형',
        headSpeedRange: [100, 104],
        ballSpeedRange: [144, 149],
        smashFactorRange: [1.43, 1.48],
        btRange: [87, 94],
      },
    ];

    const result = buildSwingAiCoachingResult({
      structuralInput: {
        frontAxisTiltDeg: -3.4,
        headTiltDeg: -3.2,
        roundedShoulderDeg: -1.2,
      },
      patternScores: {
        사각체형: 35.9,
        역삼각체형: 33.2,
      },
      swingSnapshot: {
        headSpeed: 97,
        ballSpeed: 135,
        smashFactor: 1.39,
        missClass: 'MISS',
        sa: 'LEFT MOVE 5INCH',
        bt: 85,
        tbec: 'NO',
      },
      standardModels: models,
    });

    expect(result.bodyType).toBe('사각체형');
    expect(result.swingType).toBe('아크형');
    expect(result.nearestModelId).toBe('model-001');
    expect(result.problemSummary.join(' ')).toContain('MISS');
    expect(result.problemSummary.join(' ')).toContain('중심축');
    expect(result.personalizedSolution.join(' ')).toContain('실시간 스윙 모션 비교 분석');
  });

  it('face/path 조합으로 Open face 원인을 도출한다', () => {
    expect(deriveCause(3, -1, 0)).toEqual({
      primary: 'Open face',
      secondary: 'Out-to-in path',
      biomechanics: 'Over-the-top + late release',
    });
  });

  it('face/path 조합으로 Closed face 원인을 도출한다', () => {
    expect(deriveCause(-3, 1, 0)).toEqual({
      primary: 'Closed face',
      secondary: 'In-to-out path',
      biomechanics: 'Excessive hand rotation',
    });
  });

  it('attack 값으로 Steep attack 원인을 도출한다', () => {
    expect(deriveCause(0, 0, -6)).toEqual({
      primary: 'Steep attack',
      secondary: 'Weight back',
      biomechanics: 'Early upper body drop',
    });
  });

  it('attack 값으로 Too upward strike 원인을 도출한다', () => {
    expect(deriveCause(0, 0, 5)).toEqual({
      primary: 'Too upward strike',
      secondary: 'Early extension',
      biomechanics: 'Loss of posture',
    });
  });

  it('조건에 해당하지 않으면 Neutral을 반환한다', () => {
    expect(deriveCause(1, 0, 0)).toEqual({
      primary: 'Neutral',
      secondary: 'Balanced',
      biomechanics: 'Stable motion',
    });
  });
});
