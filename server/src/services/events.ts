import { Pool, PoolClient } from 'pg';
import pool from './db';

/**
 * Append-only domain event log (docs/DATA_ARCHITECTURE.md §5.4).
 *
 * Every recording action a coach or student takes should leave one immutable
 * row in domain_events, alongside (never instead of) the state-table write.
 * This is the raw material for analytics, AI-training exports, audit, and
 * derived-layer rebuilds.
 */

export type ActorRole = 'coach' | 'client' | 'admin' | 'branch_admin' | 'system' | 'ai';

export interface DomainEventInput {
  /** Client-generated UUID for idempotent re-sends; omitted → server generates. */
  eventId?: string;
  /** When the action happened on the device; omitted → now(). */
  occurredAt?: Date;
  actorId?: string | null;
  actorRole: ActorRole;
  /** Dot-namespaced, e.g. 'lesson.created', 'lesson.approved'. */
  eventType: string;
  entityType?: string;
  entityId?: string | null;
  /** Canonical student UUID when known. Composite legacy ids go in payload. */
  studentUuid?: string | null;
  payload?: Record<string, unknown>;
  schemaVersion?: number;
  appVariant?: string | null;
  deviceId?: string | null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Insert one event. Pass the transaction's PoolClient to make the event
 * atomic with the state change it describes; defaults to the shared pool.
 * ON CONFLICT (event_id) DO NOTHING absorbs idempotent client re-sends.
 */
export async function recordEvent(
  input: DomainEventInput,
  db: Pool | PoolClient = pool
): Promise<void> {
  const studentUuid =
    input.studentUuid && UUID_PATTERN.test(input.studentUuid)
      ? input.studentUuid
      : null;

  await db.query(
    `INSERT INTO domain_events (
       event_id, occurred_at,
       actor_id, actor_role, event_type,
       entity_type, entity_id, student_uuid,
       payload, schema_version, app_variant, device_id
     ) VALUES (
       COALESCE($1::uuid, gen_random_uuid()), COALESCE($2, now()),
       $3, $4, $5,
       $6, $7, $8,
       $9, $10, $11, $12
     )
     ON CONFLICT (event_id) DO NOTHING`,
    [
      input.eventId ?? null,
      input.occurredAt ?? null,
      input.actorId ?? null,
      input.actorRole,
      input.eventType,
      input.entityType ?? null,
      input.entityId ?? null,
      studentUuid,
      JSON.stringify(input.payload ?? {}),
      input.schemaVersion ?? 1,
      input.appVariant ?? null,
      input.deviceId ?? null,
    ]
  );
}

/**
 * Fire-and-forget variant for request paths where the event is valuable but
 * must never fail or slow the user-facing write. Telemetry loss is logged,
 * not thrown.
 */
export function recordEventSafe(input: DomainEventInput, db?: Pool | PoolClient): void {
  void recordEvent(input, db).catch((err) => {
    console.warn(`[events] failed to record ${input.eventType}:`, err);
  });
}
