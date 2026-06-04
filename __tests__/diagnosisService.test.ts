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
        setup: 90,
        backswing: 80,
        impact: 70,
        tempo: 60,
        balance: 50,
      },
    });

    expect(result.memberName).toBe('테스트회원');
    expect(result.overallScore).toBe(70);
    expect(result.grade).toBe('C');
    expect(result.factors).toHaveLength(5);
    expect(result.recommendations).toHaveLength(3);
    expect(result.summary).toContain('밸런스');
  });

  it('persists and returns latest diagnosis session', () => {
    const saved = diagnosisService.saveResult({
      memberName: '회원A',
      factorScores: {
        setup: 70,
        backswing: 71,
        impact: 72,
        tempo: 73,
        balance: 74,
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
