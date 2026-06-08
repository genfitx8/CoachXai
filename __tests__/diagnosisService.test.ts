import { describe, it, expect, beforeEach } from 'vitest';
import { diagnosisService } from '../services/diagnosisService';

describe('diagnosisService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates diagnosis result from input scores', () => {
    const result = diagnosisService.createResult({
      memberName: '테스트회원',
      golferProfile: {
        name: '테스트회원',
        gender: 'male',
        birthDate: '1990-01-01',
        contact: '010-0000-0000',
        heightCm: 175,
        weightKg: 72,
        golfStartDate: '2020-01-01',
        handicap: 10,
        averageScore: 85,
        bestScore: 79,
        dominantHand: 'right',
        roundFrequency: '월 2회',
        practiceFrequency: '주 2회',
        injuryHistory: '',
        injuryMemo: '',
        currentPainAreas: '',
        otherSportsExperience: '',
        flexibilitySelfAssessment: 3,
        driverModel: '',
        ironModel: '',
        shaftFlex: '',
        ballBrand: '',
        diagnosisGoals: ['score-improvement'],
        primaryConcern: '',
        targetHandicap: 8,
      },
      factorScores: {
        body: 90,
        equipment: 80,
        skill: 70,
      },
    });

    expect(result.memberName).toBe('테스트회원');
    expect(result.overallScore).toBe(80);
    expect(result.grade).toBe('B');
    expect(result.factors).toHaveLength(3);
    expect(result.recommendations).toHaveLength(3);
    expect(result.golferProfile?.name).toBe('테스트회원');
    expect(result.summary).toContain('기술 진단');
    expect(result.partResults[0].title).toBe('통합 분석 개요');
  });

  it('persists and returns latest diagnosis session', () => {
    const saved = diagnosisService.saveResult({
      memberName: '회원A',
      golferProfile: {
        name: '다른이름',
        gender: 'female',
        birthDate: '1991-06-01',
        contact: '010-2222-3333',
        heightCm: 165,
        weightKg: null,
        golfStartDate: '2018-05-01',
        handicap: null,
        averageScore: 90,
        bestScore: 82,
        dominantHand: 'left',
        roundFrequency: '',
        practiceFrequency: '',
        injuryHistory: '',
        injuryMemo: '',
        currentPainAreas: '',
        otherSportsExperience: '',
        flexibilitySelfAssessment: null,
        driverModel: '',
        ironModel: '',
        shaftFlex: '',
        ballBrand: '',
        diagnosisGoals: ['accuracy'],
        primaryConcern: '',
        targetHandicap: null,
      },
      factorScores: {
        body: 70,
        equipment: 71,
        skill: 72,
      },
    });

    const latest = diagnosisService.getLatestSession();
    const sessions = diagnosisService.getSessions();

    expect(latest).not.toBeNull();
    expect(latest?.id).toBe(saved.id);
    expect(latest?.result.memberName).toBe('회원A');
    expect(latest?.input.golferProfile?.name).toBe('회원A');
    expect(sessions).toHaveLength(1);
  });
});
