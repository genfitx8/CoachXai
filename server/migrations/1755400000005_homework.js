/**
 * Phase 1 — homework promoted from device-local storage to the server
 * (docs/DATA_ARCHITECTURE.md §5.3, §9 Phase 1).
 *
 * Same storage model as lesson_reservations: extracted key columns for
 * scoping/queries + the verbatim client document in `doc` JSONB.
 * client_id keeps the legacy `${name}_${phone}` composite until Phase 2;
 * coach_id is filled server-side from the assigning coach's token (client
 * documents don't carry it today).
 */

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS homework (
      id             TEXT PRIMARY KEY,
      client_id      TEXT NOT NULL,
      coach_id       TEXT,
      title          TEXT NOT NULL,
      due_date       TEXT,
      is_completed   BOOLEAN NOT NULL DEFAULT false,
      doc            JSONB NOT NULL,
      schema_version SMALLINT NOT NULL DEFAULT 1,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  pgm.sql(
    `CREATE INDEX IF NOT EXISTS idx_homework_client ON homework (client_id, due_date)`
  );
  pgm.sql(
    `CREATE INDEX IF NOT EXISTS idx_homework_coach ON homework (coach_id)`
  );
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS homework`);
};
