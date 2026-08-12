/**
 * Shared "why do you believe this?" fields — the envelope every AI
 * judgement the coach sees should carry.
 *
 * Modelled on `AICoachingInsight` (types/aiCoachingReport.ts), which pioneered
 * the pattern for the swing-coaching report. The redesign asks every other
 * AI feature (shot analysis, coachx insights, weekly insight, motion capture,
 * conversational chat) to follow the same envelope so the coach-facing UI
 * can consistently show frame/metric citations, past-lesson references, a
 * confidence badge, and any caveats the model wants surfaced.
 *
 * All fields are optional: rolling this out to a schema doesn't force the
 * matching prompt update in the same commit — a model that isn't yet asked
 * to fill them simply omits them, and downstream code treats `undefined`
 * as "no envelope yet".
 */
export interface AIEvidenceEnvelope {
  /** Frame/metric citations pulled straight from the analysis pipeline. */
  swingEvidence?: string[];
  /** References to prior lessons/rounds the judgement leans on. */
  historyEvidence?: string[];
  /**
   * How firm the correlation is:
   * - `strong` — well-established biomechanical/statistical link
   * - `plausible` — suggestive
   * - `speculative` — surface but flag as low confidence (UI shows "추정")
   */
  confidence?: 'strong' | 'plausible' | 'speculative';
  /** Free-form caveats the coach should read before trusting the call. */
  caveats?: string[];
}
