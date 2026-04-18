import { describe, expect, it } from 'vitest';
import { parseBodyPhotoAnalysisResponse } from '../services/geminiService';

describe('parseBodyPhotoAnalysisResponse', () => {
  it('정상 JSON 응답을 폼 입력값 형태로 파싱한다', () => {
    const result = parseBodyPhotoAnalysisResponse(
      JSON.stringify({
        bodyType: '역삼각체형',
        patternScores: {
          이상체형: 10.0,
          삼각체형: 20.1,
          역삼각체형: 33.24,
          사각체형: 35.94,
          모래시계형: null,
          마름모꼴체형: null,
          둥근체형: null,
          튜브체형: null,
        },
        structuralInput: {
          frontAxisTiltDeg: 1.234,
          headTiltDeg: -0.55,
          shoulderTiltDeg: 2.07,
          pelvisTiltDeg: null,
          kneeTiltDeg: 4.01,
        },
        coachComment: '어깨/무릎 비대칭이 관찰됩니다.',
      })
    );

    expect(result.bodyType).toBe('사각체형');
    expect(result.patternScores?.사각체형).toBe(35.9);
    expect(result.structuralInput).toEqual({
      frontAxisTiltDeg: 1.2,
      headTiltDeg: -0.6,
      shoulderTiltDeg: 2.1,
      pelvisTiltDeg: undefined,
      kneeTiltDeg: 4,
    });
    expect(result.coachComment).toBe('어깨/무릎 비대칭이 관찰됩니다.');
  });

  it('잘못된 체형/코멘트 누락 시 안전한 기본값으로 보정한다', () => {
    const result = parseBodyPhotoAnalysisResponse(
      JSON.stringify({
        bodyType: '알수없음',
        structuralInput: {},
      })
    );

    expect(result.bodyType).toBe('사각체형');
    expect(result.coachComment).toContain('자동 분석 결과');
  });

  it('패턴 점수가 없으면 bodyType 필드를 기본으로 사용한다', () => {
    const result = parseBodyPhotoAnalysisResponse(
      JSON.stringify({
        bodyType: '마름모꼴체형',
        structuralInput: {},
      })
    );

    expect(result.bodyType).toBe('마름모꼴체형');
    expect(result.patternScores).toBeUndefined();
  });
});
