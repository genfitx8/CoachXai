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
 * Shared "why do you believe this?" envelope pattern.
 *
 * The redesign requires every AI judgement the coach sees to carry the
 * frames/metrics it looked at, how confident it is, and any past-lesson
 * references it drew on. `aiCoachingSummaryService` already ships this
 * shape via prompt-level schema hints (see `AICoachingInsight`); this
 * fragment lets us bolt the same fields onto feature-schema level so the
 * server-enforced JSON output includes them for shot_analysis, coachx
 * insights, weekly insights, and motion capture.
 *
 * Spread it into a schema's `properties` map; the fields stay optional so
 * upgrading a schema doesn't force a matching prompt change in the same
 * commit — models simply omit fields they weren't asked to fill.
 */
export const evidenceEnvelopeSchema = {
  /** Frame/metric citations pulled straight from the analysis pipeline. */
  swingEvidence: {
    type: 'ARRAY',
    items: { type: 'STRING' },
  },
  /** References to prior lessons/rounds the judgement leans on. */
  historyEvidence: {
    type: 'ARRAY',
    items: { type: 'STRING' },
  },
  /** How firm the correlation is — surface warning UI below `plausible`. */
  confidence: {
    type: 'STRING',
    enum: ['strong', 'plausible', 'speculative'],
  },
  /** Free-form caveats the coach should read before trusting the call. */
  caveats: {
    type: 'ARRAY',
    items: { type: 'STRING' },
  },
} as const;

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
    ...evidenceEnvelopeSchema,
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
      ...evidenceEnvelopeSchema,
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

/**
 * Draft of a coach's post-lesson review record (redesign screen 8b).
 * The coach edits every field in place before hitting 승인 — the model
 * just seeds sensible starting text. Evidence envelope rides along so
 * "왜 이 제안?" can open the 6a modal on the feedback section.
 *
 * Kept intentionally shallow: no nested insights, no per-action metadata.
 * The coach's edit surface is a plain textarea per section, so a
 * complex schema would only be flattened before display.
 */
export const lessonReviewDraftSchema = {
  type: 'OBJECT',
  properties: {
    todayCovered: { type: 'STRING' },
    feedback: { type: 'STRING' },
    nextActions: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
    ...evidenceEnvelopeSchema,
  },
  required: ['todayCovered', 'feedback', 'nextActions'],
} as const;

/**
 * 레슨 스토리 표지 문구 — 헤드라인과 리드 한 줄.
 *
 * 기록을 일기처럼 읽히게 만드는 것은 목록에서 되돌아보게 하는 제목
 * 한 줄이다(docs/LESSON_STORY_UI_PLAN.md §7). 입력은 **코치가 승인한
 * 문장**뿐이므로 모델이 새 사실을 만들 여지가 없다 — 이미 있는 글을
 * 압축하는 일이다.
 *
 * 캡션과 대표컷은 이 스키마에 없다. 캡션은 사진을 봐야 쓸 수 있는데
 * 코치 검수 없이 내보내면 "사진에 없는 것을 지어내는" 가장 큰 위험을
 * 그대로 안게 되고(§14), 대표컷은 조판기의 결정 규칙(§5.2)이 메타데이터
 * 없이 추측하는 모델보다 낫다. 둘 다 M3(코치 저작)에서 다룬다.
 */
export const lessonStoryMetaSchema = {
  type: 'OBJECT',
  properties: {
    /** 그날의 한 줄. 18자 내외, 명사형 종결. */
    headline: { type: 'STRING' },
    /** 리드 위 한 줄 요약. 40자 내외. 쓸 말이 없으면 생략. */
    dek: { type: 'STRING' },
  },
  required: ['headline'],
} as const;

/**
 * 7a · Coach handover briefing.
 *
 * Composed at handover time from the outgoing coach's APPROVED lesson
 * history (never freeMemo — that field is coach-private and stripped
 * server-side for anyone but the author). The new coach reads this on
 * their first visit to the student, so structure it for a quick scan:
 *
 *   - `headline`: one-line "여기서 이어서 하시면 됩니다."
 *   - `keyPoints`: what the outgoing coach has been focusing on.
 *   - `recentFocus`: the most recent lesson's coaching angle.
 *   - `watchOuts`: student-specific pitfalls or preferences.
 *   - `evidenceEnvelope`: which past lessons this leaned on, plus a
 *     confidence signal — the new coach can jump to source lessons
 *     directly instead of trusting the summary blindly.
 */
export const handoverSummarySchema = {
  type: 'OBJECT',
  properties: {
    headline: { type: 'STRING' },
    keyPoints: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
    recentFocus: { type: 'STRING' },
    watchOuts: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
    ...evidenceEnvelopeSchema,
  },
  required: ['headline', 'keyPoints', 'recentFocus'],
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
    ...evidenceEnvelopeSchema,
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
