/**
 * Phase 1 — point ledger promotion (docs/DATA_ARCHITECTURE.md §5.3).
 *
 * point_transactions already existed for payment top-up audit rows; this
 * migration widens it into the full ledger the client-side pointService
 * used to keep in localStorage: branch-admin grant metadata columns and the
 * verbatim client document. Balances (clients/coaches.current_points) become
 * derived values maintained transactionally by the server from here on.
 */

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  const alters = [
    'ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS granted_by VARCHAR(255)',
    'ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS recipient_type VARCHAR(20)',
    'ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS memo TEXT',
    'ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS doc JSONB',
  ];
  for (const sql of alters) pgm.sql(sql);

  pgm.sql(
    `CREATE INDEX IF NOT EXISTS idx_point_transactions_client
       ON point_transactions (client_id, created_at DESC)`
  );
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS idx_point_transactions_client');
  pgm.sql('ALTER TABLE point_transactions DROP COLUMN IF EXISTS granted_by');
  pgm.sql('ALTER TABLE point_transactions DROP COLUMN IF EXISTS recipient_type');
  pgm.sql('ALTER TABLE point_transactions DROP COLUMN IF EXISTS memo');
  pgm.sql('ALTER TABLE point_transactions DROP COLUMN IF EXISTS doc');
};
