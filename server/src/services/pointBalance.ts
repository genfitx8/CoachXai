import { Pool, PoolClient } from 'pg';
import pool from './db';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Apply a point delta to whoever the ledger identity refers to and return
 * the new balance, or null when no profile row matches.
 *
 * Ledger identities (legacy shapes kept until Phase 2):
 *   `coach_<uuid>`      — a coach (pointService.buildCoachId)
 *   `<uuid>`            — a client by auth id
 *   `<name>_<phone>`    — a client by the legacy composite key
 */
export async function applyPointDelta(
  identity: string,
  amount: number,
  db: Pool | PoolClient = pool
): Promise<number | null> {
  const now = Date.now();

  if (identity.startsWith('coach_')) {
    const coachId = identity.slice('coach_'.length);
    if (!UUID_PATTERN.test(coachId)) return null;
    const res = await db.query(
      `UPDATE coaches
          SET current_points = COALESCE(current_points, 0) + $1, updated_at = $2
        WHERE id = $3
        RETURNING current_points`,
      [amount, now, coachId]
    );
    return res.rows[0]?.current_points ?? null;
  }

  if (UUID_PATTERN.test(identity)) {
    const res = await db.query(
      `UPDATE clients
          SET current_points = COALESCE(current_points, 0) + $1, updated_at = $2
        WHERE id = $3
        RETURNING current_points`,
      [amount, now, identity]
    );
    if (res.rows.length > 0) return res.rows[0].current_points;
  }

  const res = await db.query(
    `UPDATE clients
        SET current_points = COALESCE(current_points, 0) + $1, updated_at = $2
      WHERE name || '_' || phone = $3
      RETURNING current_points`,
    [amount, now, identity]
  );
  return res.rows[0]?.current_points ?? null;
}
