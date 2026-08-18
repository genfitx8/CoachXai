/**
 * Phase 1 — branch/bay domain promotion + branch-admin server auth
 * (docs/DATA_ARCHITECTURE.md §5.1, §5.3, §8.3).
 *
 * Same doc+key storage model as lesson_reservations/homework. All ids are
 * TEXT because the client generates them (bay_reservations uses the
 * deterministic `${branchId}_${bayId}_${YYYYMMDD}_${HH}` id — its PRIMARY
 * KEY is what finally makes double-booking impossible at the DB level).
 *
 * branch_admins deliberately has NO doc column: the legacy client document
 * carries a plaintext password, which must never reach this table. Only the
 * bcrypt hash is stored.
 */

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS branches (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      is_active      BOOLEAN NOT NULL DEFAULT true,
      doc            JSONB NOT NULL,
      schema_version SMALLINT NOT NULL DEFAULT 1,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS branch_admins (
      id            TEXT PRIMARY KEY,          -- "<branchId>:<username>"
      branch_id     TEXT NOT NULL,
      username      TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      is_active     BOOLEAN NOT NULL DEFAULT true,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (branch_id, username)
    )
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS bays (
      id             TEXT PRIMARY KEY,
      branch_id      TEXT NOT NULL,
      is_active      BOOLEAN NOT NULL DEFAULT true,
      doc            JSONB NOT NULL,
      schema_version SMALLINT NOT NULL DEFAULT 1,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_bays_branch ON bays (branch_id)`);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS bay_price_rules (
      id             TEXT PRIMARY KEY,
      branch_id      TEXT NOT NULL,
      is_active      BOOLEAN NOT NULL DEFAULT true,
      doc            JSONB NOT NULL,
      schema_version SMALLINT NOT NULL DEFAULT 1,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  pgm.sql(
    `CREATE INDEX IF NOT EXISTS idx_bay_price_rules_branch ON bay_price_rules (branch_id)`
  );

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS bay_reservations (
      id             TEXT PRIMARY KEY,          -- deterministic slot id = DB double-booking guard
      branch_id      TEXT NOT NULL,
      bay_id         TEXT NOT NULL,
      client_id      TEXT NOT NULL,
      status         VARCHAR(30) NOT NULL,
      start_time     TEXT NOT NULL,             -- verbatim naive-local string (Phase 2 normalizes)
      end_time       TEXT NOT NULL,
      slot_date      TEXT NOT NULL,             -- "YYYY-MM-DD" extracted for range queries
      doc            JSONB NOT NULL,
      schema_version SMALLINT NOT NULL DEFAULT 1,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  pgm.sql(
    `CREATE INDEX IF NOT EXISTS idx_bay_reservations_branch_date
       ON bay_reservations (branch_id, slot_date)`
  );
  pgm.sql(
    `CREATE INDEX IF NOT EXISTS idx_bay_reservations_client
       ON bay_reservations (client_id)`
  );
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS bay_reservations`);
  pgm.sql(`DROP TABLE IF EXISTS bay_price_rules`);
  pgm.sql(`DROP TABLE IF EXISTS bays`);
  pgm.sql(`DROP TABLE IF EXISTS branch_admins`);
  pgm.sql(`DROP TABLE IF EXISTS branches`);
};
