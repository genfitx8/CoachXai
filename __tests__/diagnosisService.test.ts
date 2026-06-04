import { describe, it, expect, beforeEach } from 'vitest';
import { diagnosisService } from '../services/diagnosisService';

describe('diagnosisService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates diagnosis result from input scores', () => {
    const result = diagnosisService.createResult({
      memberName: '테스트회원',
      factorScores: {
        body: 90,
        equipment: 80,
        skill: 70,
        courseManagement: 60,
        mental: 50,
      },
    });

    expect(result.memberName).toBe('테스트회원');
    expect(result.overallScore).toBe(70);
    expect(result.grade).toBe('C');
    expect(result.factors).toHaveLength(5);
    expect(result.recommendations).toHaveLength(3);
    expect(result.summary).toContain('멘탈 진단');
    expect(result.partResults[0].title).toBe('통합 분석 개요');
  });

  it('persists and returns latest diagnosis session', () => {
    const saved = diagnosisService.saveResult({
      memberName: '회원A',
      factorScores: {
        body: 70,
        equipment: 71,
        skill: 72,
        courseManagement: 73,
        mental: 74,
      },
    });

    const latest = diagnosisService.getLatestSession();
    const sessions = diagnosisService.getSessions();

    expect(latest).not.toBeNull();
    expect(latest?.id).toBe(saved.id);
    expect(latest?.result.memberName).toBe('회원A');
    expect(sessions).toHaveLength(1);
  });
});
