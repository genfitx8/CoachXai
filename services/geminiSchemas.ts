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

export const extractGolfDataSchema = {
  type: 'OBJECT',
  properties: {
    isScorecard: { type: 'BOOLEAN' },
    score: { type: 'NUMBER', nullable: true },
    metrics: {
      type: 'OBJECT',
      nullable: true,
      properties: {
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
      },
    },
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
