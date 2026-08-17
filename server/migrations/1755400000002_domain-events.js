/**
 * L3 event log — append-only record of every recording action coaches and
 * students take (docs/DATA_ARCHITECTURE.md §5.4). State tables answer "what is",
 * this table answers "what happened" and feeds analytics + AI training exports.
 *
 * Rows are immutable: no UPDATE/DELETE path exists in application code, and the
 * table deliberately has no updated_at.
 *
 * actor_id / entity_id are TEXT (not UUID) on purpose: legacy composite ids
 * (`name_phone`) and the literal 'admin' actor must be representable until the
 * Phase 2 identifier migration lands. student_uuid is the forward-looking UUID
 * axis and stays NULL when only a composite id is known (kept in payload).
 */

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS domain_events (
      id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      event_id       UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
      occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      received_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      actor_id       TEXT,
      actor_role     VARCHAR(20) NOT NULL,
      event_type     VARCHAR(60) NOT NULL,
      entity_type    VARCHAR(40),
      entity_id      TEXT,
      student_uuid   UUID,
      payload        JSONB NOT NULL DEFAULT '{}',
      schema_version SMALLINT NOT NULL DEFAULT 1,
      app_variant    VARCHAR(20),
      device_id      VARCHAR(64)
    )
  `);

  pgm.sql(
    `CREATE INDEX IF NOT EXISTS idx_events_entity ON domain_events (entity_type, entity_id)`
  );
  pgm.sql(
    `CREATE INDEX IF NOT EXISTS idx_events_student ON domain_events (student_uuid, occurred_at)`
  );
  pgm.sql(
    `CREATE INDEX IF NOT EXISTS idx_events_type_time ON domain_events (event_type, occurred_at)`
  );
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS domain_events`);
};
