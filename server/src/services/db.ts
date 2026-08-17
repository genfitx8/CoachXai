import path from 'path';
import { Pool } from 'pg';
import runner from 'node-pg-migrate';
import { CURRICULUM_PART_DEFS } from '../seeds/curriculumParts';

const ssl =
  process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl,
});

// Migrations live outside src/ so tsc never compiles them; the path resolves
// identically from src/services (ts-node-dev) and dist/services (production
// build): ../../migrations === <server root>/migrations.
const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'migrations');

/**
 * Schema management now goes through node-pg-migrate
 * (docs/DATA_ARCHITECTURE.md, Phase 0). The former imperative DDL in this
 * file was snapshotted verbatim into migrations/0001_baseline.js — it is
 * idempotent, so it applies cleanly to both fresh databases and existing
 * production databases already shaped by the old initDb(). All future schema
 * changes are new numbered files under server/migrations/, never edits here.
 */
export async function initDb(): Promise<void> {
  await runner({
    databaseUrl: { connectionString: process.env.DATABASE_URL, ssl },
    dir: MIGRATIONS_DIR,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    logger: {
      info: (msg: string) => console.log(`[migrate] ${msg}`),
      warn: (msg: string) => console.warn(`[migrate] ${msg}`),
      error: (msg: string) => console.error(`[migrate] ${msg}`),
    },
  });

  // Data seeding stays here (not in a migration): ON CONFLICT DO NOTHING
  // preserves any admin edits across restarts/redeploys, and the defs are
  // TypeScript imports the plain-JS migration files can't reach.
  const now = Date.now();
  for (const def of CURRICULUM_PART_DEFS) {
    await pool.query(
      `INSERT INTO curriculum_part_templates (part_key, part_order, title, content, key_points, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (part_key) DO NOTHING`,
      [def.partKey, def.partOrder, def.title, def.content, JSON.stringify(def.keyPoints), now]
    );
  }
}

export default pool;
