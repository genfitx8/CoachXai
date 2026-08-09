/**
 * Coach-facing AI report produced by cross-referencing an on-video swing
 * analysis with the student's recent shot / lesson history. The differentiation:
 * every insight cites at least one datapoint, and where possible correlates a
 * pose-derived fault (e.g. early extension 62mm at impact) with a shot
 * pattern from the student's history (e.g. "3 of last 5 rounds pushed
 * right"). Nothing is hallucinated — the model is prompted to say "insufficient
 * data" instead of guessing.
 */
export interface AICoachingInsight {
  /** Short label, e.g. "얼리 익스텐션 감지". */
  title: string;
  /** One-sentence coach-facing observation. */
  observation: string;
  /**
   * Pose / kinematic evidence pulled straight from SwingAnalysis. Rendered
   * verbatim so the coach can trace the number back to the frame.
   */
  swingEvidence: string[];
  /**
   * History evidence pulled from past lessons — carry loss, spin pattern,
   * miss direction. Empty when the student has no relevant history yet.
   */
  historyEvidence: string[];
  /**
   * How confident the model is that these two pieces of evidence actually
   * connect. `strong` = well-established biomechanical link; `plausible` =
   * suggestive; `speculative` = surface up but flag as low confidence.
   */
  correlationConfidence: 'strong' | 'plausible' | 'speculative';
  /** Optional drill / cue in the coach's voice. */
  recommendation?: string;
}

export interface AICoachingReport {
  /** One-line headline the coach can lead the lesson with. */
  headline: string;
  /** Overall progress vs history (better / same / worse). Undefined = no history. */
  trend?: 'improving' | 'steady' | 'regressing' | 'insufficient_data';
  /**
   * Ordered insights, best-first. Every insight is tied to at least one
   * `swingEvidence` datapoint — the schema prevents pure prose insights.
   */
  insights: AICoachingInsight[];
  /**
   * Concrete next-lesson focus items in priority order. Coach can copy
   * these directly into the lesson plan.
   */
  nextLessonFocus: string[];
  /**
   * Free-form caveats the model surfaced (low landmark confidence, no
   * shot data yet, camera view mismatch, etc.). Shown as-is under the
   * report — helps the coach calibrate how much to trust it.
   */
  caveats: string[];
  /** ISO timestamp when the report was generated. */
  generatedAt: string;
  /** True when the report used student history; false = swing-only fallback. */
  usedHistory: boolean;
}
