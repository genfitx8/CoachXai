/**
 * Phase 1 — AI asset promotion (docs/DATA_ARCHITECTURE.md §5.6, §6).
 *
 * The assets that make CoachX's AI personal — per-student memory, the
 * coach-style exemplar pool (fine-tuning gold data), chat transcripts,
 * weekly insights, handover packages — lived only in device localStorage.
 * Same doc+key storage model as the other Phase 1 tables.
 *
 * student_contexts and chat_threads are DERIVED-layer data keyed by the
 * legacy composite client id (Phase 2 remaps to student_uuid); both are
 * rebuildable/replaceable, so a full-document upsert is the whole API.
 */

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS student_contexts (
      client_id      TEXT PRIMARY KEY,
      doc            JSONB NOT NULL,
      schema_version SMALLINT NOT NULL DEFAULT 1,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS coach_style_exemplars (
      id             TEXT PRIMARY KEY,
      coach_id       TEXT,                       -- NULL = global exemplar
      target         VARCHAR(60) NOT NULL,
      tier           SMALLINT NOT NULL DEFAULT 3,
      doc            JSONB NOT NULL,
      schema_version SMALLINT NOT NULL DEFAULT 1,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  pgm.sql(
    `CREATE INDEX IF NOT EXISTS idx_exemplars_target ON coach_style_exemplars (target, coach_id)`
  );

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS chat_threads (
      client_id      TEXT PRIMARY KEY,
      doc            JSONB NOT NULL,             -- { v, updatedAt, messages[] }
      message_count  INTEGER NOT NULL DEFAULT 0,
      schema_version SMALLINT NOT NULL DEFAULT 1,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS weekly_insights (
      id             TEXT PRIMARY KEY,
      client_id      TEXT NOT NULL,
      doc            JSONB NOT NULL,
      schema_version SMALLINT NOT NULL DEFAULT 1,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  pgm.sql(
    `CREATE INDEX IF NOT EXISTS idx_weekly_insights_client ON weekly_insights (client_id)`
  );

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS handover_summaries (
      id             TEXT PRIMARY KEY,
      client_id      TEXT NOT NULL,
      from_coach_id  TEXT,
      to_coach_id    TEXT,
      doc            JSONB NOT NULL,
      schema_version SMALLINT NOT NULL DEFAULT 1,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  pgm.sql(
    `CREATE INDEX IF NOT EXISTS idx_handover_to_coach ON handover_summaries (to_coach_id)`
  );
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS handover_summaries`);
  pgm.sql(`DROP TABLE IF EXISTS weekly_insights`);
  pgm.sql(`DROP TABLE IF EXISTS chat_threads`);
  pgm.sql(`DROP TABLE IF EXISTS coach_style_exemplars`);
  pgm.sql(`DROP TABLE IF EXISTS student_contexts`);
};
