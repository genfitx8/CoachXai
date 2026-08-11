/**
 * Gemini responseSchema definitions.
 *
 * Passing one of these as `responseSchema` in an AI backend payload makes
 * Gemini 2.5+ guarantee the returned JSON matches the shape — eliminating
 * the parseJsonObjectFromText / parseJsonArrayFromText fallback path for
 * these features.
 *
 * Type strings follow the OpenAPI 3.0 subset Gemini accepts.
 */

/**
 * Numeric-metric properties shared by `metrics` (session average) and
 * each entry in the `shots` array (per-shot row). Kept as a `const` so
 * both schema slots stay in lockstep — a coach adding a new metric only
 * has to touch this object.
 */
const SHOT_METRIC_PROPERTIES = {
  carryDistance: { type: 'NUMBER', nullable: true },
  totalDistance: { type: 'NUMBER', nullable: true },
  ballSpeed: { type: 'NUMBER', nullable: true },
  clubHeadSpeed: { type: 'NUMBER', nullable: true },
  launchAngle: { type: 'NUMBER', nullable: true },
  attackAngle: { type: 'NUMBER', nullable: true },
  backSpin: { type: 'NUMBER', nullable: true },
  sideSpin: { type: 'NUMBER', nullable: true },
  spinRate: { type: 'NUMBER', nullable: true },
  smashFactor: { type: 'NUMBER', nullable: true },
  clubPath: { type: 'NUMBER', nullable: true },
  dynamicLoft: { type: 'NUMBER', nullable: true },
  spinLoft: { type: 'NUMBER', nullable: true },
  faceAngle: { type: 'NUMBER', nullable: true },
  sideTotal: { type: 'NUMBER', nullable: true },
} as const;

export const extractGolfDataSchema = {
  type: 'OBJECT',
  properties: {
    isScorecard: { type: 'BOOLEAN' },
    score: { type: 'NUMBER', nullable: true },
    metrics: {
      type: 'OBJECT',
      nullable: true,
      properties: SHOT_METRIC_PROPERTIES,
    },
    /**
     * Per-shot rows from a multi-shot table (Trackman / Tracey / JB /
     * 골프존 등). One entry per visible shot row, ordered as they appear
     * in the image. Omitted / empty when the screen is a single-shot
     * summary. Do NOT include the 평균 / ± / Consistency rows here —
     * the average lives in `metrics` and ± is a std-dev, not a shot.
     */
    shots: {
      type: 'ARRAY',
      nullable: true,
      items: {
        type: 'OBJECT',
        properties: {
          index: { type: 'NUMBER', nullable: true },
          ...SHOT_METRIC_PROPERTIES,
        },
      },
    },
    /**
     * Shot count the image itself reported (the row-count header, or the
     * count implied by the table). Optional — samples.length is used as
     * the fallback source of truth.
     */
    shotCount: { type: 'NUMBER', nullable: true },
    comment: { type: 'STRING' },
  },
  required: ['isScorecard', 'comment'],
} as const;

export const weeklyInsightSchema = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    keyPatterns: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
    recommendedFocus: { type: 'STRING' },
  },
  required: ['summary', 'keyPatterns', 'recommendedFocus'],
} as const;

export const coachXInsightsSchema = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      type: {
        type: 'STRING',
        enum: ['pattern', 'attention', 'curriculum', 'coach_growth', 'stagnation'],
      },
      title: { type: 'STRING' },
      body: { type: 'STRING' },
    },
    required: ['type', 'title', 'body'],
  },
} as const;

export const coachXGrowthProfileSchema = {
  type: 'OBJECT',
  properties: {
    recommendedActions: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
    geminiSummary: { type: 'STRING' },
  },
  required: ['recommendedActions', 'geminiSummary'],
} as const;

export const motionCaptureSchema = {
  type: 'OBJECT',
  properties: {
    measurements: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          swingPhase: { type: 'STRING' },
          timeSeconds: { type: 'NUMBER' },
          headForwardTilt: { type: 'NUMBER' },
          headLateralSway: { type: 'NUMBER' },
          upperBodyPush: { type: 'NUMBER' },
          headLift: { type: 'NUMBER' },
          upperBodyLateralMove: { type: 'NUMBER' },
          hipSlide: { type: 'NUMBER' },
          upperBodyLift: { type: 'NUMBER' },
        },
        required: ['swingPhase', 'timeSeconds'],
      },
    },
    aiAnalysis: { type: 'STRING' },
  },
  required: ['measurements', 'aiAnalysis'],
} as const;

export const trackmanScreenSchema = {
  type: 'OBJECT',
  properties: {
    clubSpeed: { type: 'NUMBER', nullable: true },
    ballSpeed: { type: 'NUMBER', nullable: true },
    smashFactor: { type: 'NUMBER', nullable: true },
    launchAngle: { type: 'NUMBER', nullable: true },
    spinRate: { type: 'NUMBER', nullable: true },
    carryDistance: { type: 'NUMBER', nullable: true },
    totalDistance: { type: 'NUMBER', nullable: true },
  },
} as const;

/**
 * Result of an AI-guided interview turn. The model reads the transcript so
 * far and decides what to ask next, or signals that it has enough info to
 * synthesise a systemPrompt (isFinal=true).
 */
export const interviewQuestionSchema = {
  type: 'OBJECT',
  properties: {
    question: { type: 'STRING' },
    isFinal: { type: 'BOOLEAN' },
    rationale: { type: 'STRING' },
  },
  required: ['question', 'isFinal'],
} as const;

/**
 * Result of extracting a coach's methodology from an uploaded document and
 * turning it into a runnable system prompt for a specific AI feature (target).
 * - `systemPrompt`: the drop-in text a coach can save as PromptTemplate.systemPrompt
 * - `summary`: 1–2 sentences a coach can skim to trust what was extracted
 * - `principles`: 3–8 bullet points distilled from the document (for reference)
 * - `preferredTerminology`: words the coach uses (term → what it means)
 */
export const generateSystemPromptFromDocumentSchema = {
  type: 'OBJECT',
  properties: {
    systemPrompt: { type: 'STRING' },
    summary: { type: 'STRING' },
    principles: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
    preferredTerminology: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          term: { type: 'STRING' },
          meaning: { type: 'STRING' },
        },
        required: ['term', 'meaning'],
      },
    },
  },
  required: ['systemPrompt', 'summary'],
} as const;
