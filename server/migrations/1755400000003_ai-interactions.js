/**
 * Server-side AI call telemetry (docs/DATA_ARCHITECTURE.md §5.5) — the server
 * successor to the client-side localStorage AiCallLog. Every /api/ai/invoke(-stream)
 * call lands here, so accumulation starts with a server deploy alone.
 *
 * prompt_text / response_text stay NULL until the Phase 4 consent gate
 * (`consents.purpose = 'ai_training'`) ships — until then only the 12-char
 * sha-256 prompt_hash and character counts are stored, matching the privacy
 * posture of the existing client logger.
 */

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS ai_interactions (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      user_id          TEXT,
      user_role        VARCHAR(20),
      student_uuid     UUID,
      feature          VARCHAR(60) NOT NULL,
      model            VARCHAR(80),
      runtime          VARCHAR(30),
      prompt_hash      VARCHAR(16),
      prompt_chars     INTEGER,
      response_chars   INTEGER,
      prompt_text      TEXT,
      response_text    TEXT,
      latency_ms       INTEGER,
      status           VARCHAR(20) NOT NULL,
      error_message    TEXT,
      streamed         BOOLEAN NOT NULL DEFAULT false,
      has_schema       BOOLEAN NOT NULL DEFAULT false,
      media_part_count INTEGER NOT NULL DEFAULT 0,
      schema_version   SMALLINT NOT NULL DEFAULT 1
    )
  `);

  pgm.sql(
    `CREATE INDEX IF NOT EXISTS idx_ai_interactions_feature ON ai_interactions (feature, occurred_at)`
  );
  pgm.sql(
    `CREATE INDEX IF NOT EXISTS idx_ai_interactions_user ON ai_interactions (user_id, occurred_at)`
  );
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS ai_interactions`);
};
