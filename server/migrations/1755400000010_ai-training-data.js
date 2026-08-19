/**
 * 학습 데이터 3종 세트 (docs/DATA_ARCHITECTURE.md §5.5, §6.1, §8.2).
 *
 * §6.1의 데이터 가치 서열 1·2위와 그 전제인 동의 게이트를 한 번에 세운다.
 *
 * 1. lessons.review_sections_draft — AI가 처음 뽑은 초안. 지금까지는
 *    review_sections 한 칸을 코치 수정본이 덮어써서 "AI 초안 vs 코치
 *    최종본" 페어(가치 1위, DPO/RLHF 학습쌍)가 매 레슨 사라지고 있었다.
 *    초안은 write-once — 한 번 적히면 갱신되지 않는다.
 *
 * 2. ai_feedback_events — 별표/수정/반려/재생성/승인취소. 이미 UI에
 *    존재하는 코치의 행동 자체가 라벨이다(§6.2). coach_style_exemplars가
 *    "무엇을 좋다고 했나"만 남기는 반면 이 표는 부정 신호와 원안까지
 *    남겨 하드 네거티브 페어를 만든다.
 *
 * 3. consents — 목적별 동의(§8.2). ai_interactions의 프롬프트/응답 원문
 *    저장과 §6.3 데이터셋 추출이 모두 이 표를 게이트로 쓴다. 소급 동의는
 *    불가능하므로, 이 표가 서지 않는 기간의 원문은 영구히 학습에 못 쓴다.
 */

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // ── 1. AI 초안 보존 (가치 1위 페어의 왼쪽 항) ──────────────────────────
  pgm.sql(
    'ALTER TABLE lessons ADD COLUMN IF NOT EXISTS review_sections_draft JSONB'
  );
  pgm.sql(
    'ALTER TABLE lessons ADD COLUMN IF NOT EXISTS review_draft_at BIGINT'
  );
  // 초안의 출처. 'agent' = 드래프터가 만든 것을 클라이언트가 명시적으로
  // 보냈다(신뢰 가능한 학습쌍). 'first_save' = 서버가 첫 저장분을 초안으로
  // 추정했다(레거시 필드에서 유래했을 수 있으므로 추출 시 구분 필요).
  pgm.sql(
    'ALTER TABLE lessons ADD COLUMN IF NOT EXISTS review_draft_source VARCHAR(20)'
  );

  // ── 2. 코치·학생의 AI 출력에 대한 반응 = 라벨 ─────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS ai_feedback_events (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      interaction_id  UUID,                  -- ai_interactions.id (있을 때)
      user_id         TEXT NOT NULL,
      user_role       VARCHAR(20) NOT NULL,
      kind            VARCHAR(24) NOT NULL,  -- starred | edited | dissent |
                                             -- regenerated | approval_undo |
                                             -- thumbs_up | thumbs_down
      target          VARCHAR(60),           -- PromptTarget
      entity_type     VARCHAR(40),           -- lesson | weekly_insight | ...
      entity_id       TEXT,
      original_output TEXT,                  -- AI 원안
      final_output    TEXT,                  -- 사용자 수정본 (edited/dissent)
      tier            SMALLINT,              -- CoachStyleExemplar tier 1|2|3
      note            TEXT,
      schema_version  SMALLINT NOT NULL DEFAULT 1,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  pgm.sql(
    `CREATE INDEX IF NOT EXISTS idx_ai_feedback_kind ON ai_feedback_events (kind, created_at)`
  );
  pgm.sql(
    `CREATE INDEX IF NOT EXISTS idx_ai_feedback_user ON ai_feedback_events (user_id, created_at)`
  );
  pgm.sql(
    `CREATE INDEX IF NOT EXISTS idx_ai_feedback_entity ON ai_feedback_events (entity_type, entity_id)`
  );

  // ── 3. 목적별 동의 ────────────────────────────────────────────────────
  // 철회는 행 삭제가 아니라 revoked_at 기록(§8.2). 유효한 동의는
  // revoked_at IS NULL 인 행 하나뿐이라는 것을 부분 유니크 인덱스로 강제한다.
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS consents (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        TEXT NOT NULL,
      user_role      VARCHAR(20) NOT NULL,
      purpose        VARCHAR(40) NOT NULL,  -- service | ai_training |
                                            -- media_branch_share | marketing
      policy_version VARCHAR(20) NOT NULL,
      granted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      revoked_at     TIMESTAMPTZ,
      source         VARCHAR(30)            -- signup | settings | admin
    )
  `);
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_consents_active
      ON consents (user_id, purpose) WHERE revoked_at IS NULL
  `);
  pgm.sql(
    `CREATE INDEX IF NOT EXISTS idx_consents_purpose ON consents (purpose, granted_at)`
  );
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS consents`);
  pgm.sql(`DROP TABLE IF EXISTS ai_feedback_events`);
  pgm.sql('ALTER TABLE lessons DROP COLUMN IF EXISTS review_draft_source');
  pgm.sql('ALTER TABLE lessons DROP COLUMN IF EXISTS review_draft_at');
  pgm.sql('ALTER TABLE lessons DROP COLUMN IF EXISTS review_sections_draft');
};
