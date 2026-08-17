/**
 * Phase 1 — lesson reservations promoted from device-local storage to the
 * server (docs/DATA_ARCHITECTURE.md §5.3, §9 Phase 1).
 *
 * Storage model: extracted queryable key columns + the full client document
 * in `doc` JSONB. The client's reservation state machine compares start/end
 * times as verbatim timezone-naive strings (e.g. "2026-04-01T09:00:00"), so
 * start_time/end_time round-trip untouched as TEXT; starts_at is a
 * best-effort KST parse for range queries and analytics only. Full time
 * normalization is the Phase 2 identifier/type migration's job.
 */

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS lesson_reservations (
      id             UUID PRIMARY KEY,
      coach_id       TEXT NOT NULL,
      client_id      TEXT,
      status         VARCHAR(30) NOT NULL,
      start_time     TEXT NOT NULL,
      end_time       TEXT NOT NULL,
      starts_at      TIMESTAMPTZ,
      doc            JSONB NOT NULL,
      schema_version SMALLINT NOT NULL DEFAULT 1,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  pgm.sql(
    `CREATE INDEX IF NOT EXISTS idx_lesson_reservations_coach
       ON lesson_reservations (coach_id, starts_at)`
  );
  pgm.sql(
    `CREATE INDEX IF NOT EXISTS idx_lesson_reservations_client
       ON lesson_reservations (client_id, starts_at)`
  );
  pgm.sql(
    `CREATE INDEX IF NOT EXISTS idx_lesson_reservations_status
       ON lesson_reservations (status)`
  );
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS lesson_reservations`);
};
