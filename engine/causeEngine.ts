import type { BiomechanicalCause, ShotClassification, SwingMetricsInput } from './analysisEngine';

interface CauseCandidate extends BiomechanicalCause {
  triggerScore: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const pushCandidate = (
  candidates: CauseCandidate[],
  candidate: Omit<CauseCandidate, 'confidence' | 'severity'> & { confidence: number; severity: number }
): void => {
  if (candidate.confidence <= 0.05 || candidate.severity <= 0.05) return;
  candidates.push({ ...candidate, triggerScore: candidate.confidence * candidate.severity });
};

export const analyzeRootCauses = (
  input: SwingMetricsInput,
  classification: ShotClassification
): BiomechanicalCause[] => {
  const candidates: CauseCandidate[] = [];
  const absFace = Math.abs(input.faceAngle);
  const absPath = Math.abs(input.clubPath);
  const absAttack = Math.abs(input.attackAngle);

  if (input.faceAngle >= 0.8) {
    const confidence = clamp01((input.faceAngle - 0.8) / 3.2);
    const severity = clamp01((absFace + Math.max(0, classification.faceToPath)) / 8);
    pushCandidate(candidates, {
      id: 'face-open-impact',
      title: 'Open clubface through impact',
      explanation:
        'Face remains open relative to target and often to path, producing right-start and right-curving shots.',
      signals: [
        `Face angle measured ${input.faceAngle.toFixed(1)}° open`,
        `Face-to-path measured ${classification.faceToPath.toFixed(1)}°`
      ],
      confidence,
      severity,
    });
  }

  if (input.faceAngle <= -0.8) {
    const confidence = clamp01((Math.abs(input.faceAngle) - 0.8) / 3.2);
    const severity = clamp01((absFace + Math.max(0, -classification.faceToPath)) / 8);
    pushCandidate(candidates, {
      id: 'face-closed-impact',
      title: 'Closed clubface through impact',
      explanation:
        'Face closes too much by impact, typically creating left-start and left-curving misses.',
      signals: [
        `Face angle measured ${input.faceAngle.toFixed(1)}° closed`,
        `Face-to-path measured ${classification.faceToPath.toFixed(1)}°`
      ],
      confidence,
      severity,
    });
  }

  if (input.clubPath <= -0.8) {
    const confidence = clamp01((Math.abs(input.clubPath) - 0.8) / 3.2);
    const severity = clamp01((absPath + Math.max(0, input.attackAngle * -0.15)) / 5);
    pushCandidate(candidates, {
      id: 'out-to-in-path',
      title: 'Out-to-in swing direction',
      explanation:
        'Path traveling left of target indicates over-the-top transition and torso-dominant downswing sequencing.',
      signals: [
        `Club path measured ${input.clubPath.toFixed(1)}° out-to-in`,
        `Shot pattern classified as ${classification.pattern}`
      ],
      confidence,
      severity,
    });
  }

  if (input.clubPath >= 0.8) {
    const confidence = clamp01((input.clubPath - 0.8) / 3.2);
    const severity = clamp01((absPath + Math.max(0, input.attackAngle * 0.12)) / 5);
    pushCandidate(candidates, {
      id: 'in-to-out-path',
      title: 'Excessive in-to-out delivery',
      explanation:
        'Path strongly from inside can produce push patterns and hooks when face closure rate is high.',
      signals: [
        `Club path measured ${input.clubPath.toFixed(1)}° in-to-out`,
        `Shot pattern classified as ${classification.pattern}`
      ],
      confidence,
      severity,
    });
  }

  if (input.attackAngle <= -3.2) {
    const confidence = clamp01((Math.abs(input.attackAngle) - 3.2) / 3.8);
    const severity = clamp01((absAttack + absPath * 0.5) / 9);
    pushCandidate(candidates, {
      id: 'steep-attack',
      title: 'Steep attack and downward strike',
      explanation:
        'Steep attack can reduce dynamic loft, increase heel/toe strike variability, and amplify directional misses.',
      signals: [
        `Attack angle measured ${input.attackAngle.toFixed(1)}°`,
        `Attack profile classified as ${classification.attackProfile}`
      ],
      confidence,
      severity,
    });
  }

  if (input.attackAngle >= 3.2) {
    const confidence = clamp01((input.attackAngle - 3.2) / 3.8);
    const severity = clamp01((absAttack + absFace * 0.35) / 9);
    pushCandidate(candidates, {
      id: 'shallow-flip',
      title: 'Excessive upward strike / early release',
      explanation:
        'Very positive attack angles can indicate hang-back and throwaway release, reducing face and strike stability.',
      signals: [
        `Attack angle measured ${input.attackAngle.toFixed(1)}°`,
        `Attack profile classified as ${classification.attackProfile}`
      ],
      confidence,
      severity,
    });
  }

  if (Math.abs(classification.faceToPath) >= 2) {
    const confidence = clamp01((Math.abs(classification.faceToPath) - 2) / 4);
    const severity = clamp01((Math.abs(classification.faceToPath) + absFace * 0.5 + absPath * 0.3) / 7);
    pushCandidate(candidates, {
      id: 'face-path-sequencing',
      title: 'Face-path timing mismatch',
      explanation:
        'Clubface closure timing does not match delivery path, creating excessive spin-axis tilt and unstable curvature.',
      signals: [
        `Face-to-path measured ${classification.faceToPath.toFixed(1)}°`,
        `Curvature magnitude classified as ${classification.curvatureMagnitude}`
      ],
      confidence,
      severity,
    });
  }

  return candidates
    .sort((a, b) => b.triggerScore - a.triggerScore)
    .slice(0, 5)
    .map(({ id, title, explanation, signals, confidence, severity }) => ({
      id,
      title,
      explanation,
      signals,
      confidence,
      severity,
    }));
};
