import { Pool, PoolClient } from 'pg';
import pool from './db';

/**
 * Identity resolution helpers shared by the Phase 1 routes.
 *
 * Until the Phase 2 identifier migration, a client can appear in data under
 * two ids: their auth UUID and the legacy `${name}_${phone}` composite.
 */

/** Ids the client may appear under, or null when the client row is missing. */
export async function getClientIds(
  userId: string,
  db: Pool | PoolClient = pool
): Promise<string[] | null> {
  const row = await db.query('SELECT name, phone FROM clients WHERE id = $1', [userId]);
  if (row.rows.length === 0) return null;
  const { name, phone } = row.rows[0];
  const ids = [userId];
  if (name && phone) ids.push(`${name}_${phone}`);
  return ids;
}

/** All identities of a coach's current students. */
export async function getRosterClientIds(
  coachId: string,
  db: Pool | PoolClient = pool
): Promise<string[]> {
  const rows = await db.query(
    'SELECT id, name, phone FROM clients WHERE coach_id = $1',
    [coachId]
  );
  const ids: string[] = [];
  for (const r of rows.rows) {
    ids.push(r.id);
    if (r.name && r.phone) ids.push(`${r.name}_${r.phone}`);
  }
  return ids;
}
