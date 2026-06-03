import {
  DiagnosisGrade,
  DiagnosisLevel,
  DiagnosisPartType,
  DiagnosisRecommendation,
  DiagnosisSession,
  PartScore,
  RadarChartPoint,
} from '../types/diagnosis';
import {
  DIAGNOSIS_PARTS,
  GRADE_DEFINITIONS,
  DiagnosisPartDefinition,
} from '../constants/diagnosis';

// ─── Grade utilities ──────────────────────────────────────────────────────────

/** Derives a diagnosis grade from a total score percentage (0-100). */
export function getDiagnosisGrade(totalScore: number, maxTotalScore: number): DiagnosisGrade {
  const pct = maxTotalScore > 0 ? (totalScore / maxTotalScore) * 100 : 0;
  const def = GRADE_DEFINITIONS.find((g) => pct >= g.minScore && pct <= g.maxScore);
  return def ? def.grade : 'D';
}

/** Returns the GradeDefinition for a given grade key. */
export function getGradeDefinition(grade: DiagnosisGrade) {
  return GRADE_DEFINITIONS.find((g) => g.grade === grade) ?? GRADE_DEFINITIONS[GRADE_DEFINITIONS.length - 1];
}

/** Returns the DiagnosisLevel for a score percentage. */
export function getDiagnosisLevel(totalScore: number, maxTotalScore: number): DiagnosisLevel {
  return getGradeDefinition(getDiagnosisGrade(totalScore, maxTotalScore)).level;
}

// ─── Part utilities ───────────────────────────────────────────────────────────

/** Returns the DiagnosisPartDefinition for a given part type. */
export function getPartDefinition(partType: DiagnosisPartType): DiagnosisPartDefinition {
  return DIAGNOSIS_PARTS.find((p) => p.type === partType) ?? DIAGNOSIS_PARTS[0];
}

/** Returns the Korean title for a part type. */
export function getPartTitle(partType: DiagnosisPartType): string {
  return getPartDefinition(partType).title;
}

/** Selects the PartScore for a specific part from a session. */
export function getPartScore(session: DiagnosisSession, partType: DiagnosisPartType): PartScore | undefined {
  return session.partScores.find((p) => p.partType === partType);
}

// ─── Score utilities ──────────────────────────────────────────────────────────

/** Calculates the total score from an array of part scores. */
export function calculateTotalScore(partScores: PartScore[]): number {
  return partScores.reduce((sum, p) => sum + p.score, 0);
}

/** Returns the score as a percentage (0-100) for display. */
export function getScorePercentage(score: number, maxScore: number): number {
  return maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
}

// ─── Radar chart utilities ────────────────────────────────────────────────────

/** Converts a session's part scores into radar chart data points. */
export function toRadarChartData(session: DiagnosisSession): RadarChartPoint[] {
  return DIAGNOSIS_PARTS.map((part) => {
    const ps = getPartScore(session, part.type);
    const value = ps ? getScorePercentage(ps.score, ps.maxScore) : 0;
    return {
      label: part.shortTitle,
      value,
      partType: part.type,
    };
  });
}

// ─── Recommendation utilities ─────────────────────────────────────────────────

/** Sorts recommendations by priority (ascending, 1 = highest). */
export function sortRecommendationsByPriority(
  recommendations: DiagnosisRecommendation[]
): DiagnosisRecommendation[] {
  return [...recommendations].sort((a, b) => a.priority - b.priority);
}

/** Returns the top-priority recommendation for each part. */
export function getTopPriorityRecommendations(
  recommendations: DiagnosisRecommendation[],
  limit = 3
): DiagnosisRecommendation[] {
  return sortRecommendationsByPriority(recommendations).slice(0, limit);
}

// ─── Top-priority parts ───────────────────────────────────────────────────────

/** Returns the parts with the lowest score percentage, sorted ascending. */
export function getWeakestParts(session: DiagnosisSession, limit = 2): DiagnosisPartType[] {
  return [...session.partScores]
    .sort((a, b) => getScorePercentage(a.score, a.maxScore) - getScorePercentage(b.score, b.maxScore))
    .slice(0, limit)
    .map((p) => p.partType);
}
