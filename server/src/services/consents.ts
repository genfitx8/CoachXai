import pool from './db';

/**
 * 목적별 동의 (docs/DATA_ARCHITECTURE.md §8.2).
 *
 * 유효한 동의 = `revoked_at IS NULL` 인 행. 철회는 행 삭제가 아니라
 * revoked_at 기록이므로, 언제 동의했고 언제 거뒀는지의 이력이 남는다.
 *
 * `ai_interactions`의 원문 저장(§5.5)과 §6.3 데이터셋 추출이 모두 이
 * 함수를 게이트로 쓴다.
 */

export const CONSENT_PURPOSES = [
  'service',
  'ai_training',
  'media_branch_share',
  'marketing',
] as const;

export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const isConsentPurpose = (v: unknown): v is ConsentPurpose =>
  typeof v === 'string' && (CONSENT_PURPOSES as readonly string[]).includes(v);

/**
 * 동의 문구 버전. 문구를 바꾸면 여기를 올리고, 기존 동의는 그대로 둔다
 * (어느 버전에 동의했는지가 매니페스트 추적의 근거 — §6.3).
 */
export const CONSENT_POLICY_VERSION = '2026-08-01';

export interface ConsentRow {
  purpose: ConsentPurpose;
  granted: boolean;
  grantedAt: string | null;
  revokedAt: string | null;
  policyVersion: string | null;
}

/**
 * AI 게이트웨이는 호출마다 이 판정을 필요로 하므로 짧게 캐시한다.
 *
 * grant/revoke 는 **자기 프로세스의** 캐시만 즉시 비운다. 인스턴스가
 * 여럿이면 다른 인스턴스는 최대 TTL 만큼 옛 판정을 쓴다 — 철회 직후
 * 그 시간 동안 원문이 더 저장될 수 있다는 뜻이므로 짧게 잡는다.
 */
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { granted: boolean; expiresAt: number }>();

const cacheKey = (userId: string, purpose: ConsentPurpose): string =>
  `${userId}::${purpose}`;

export function invalidateConsentCache(userId: string, purpose?: ConsentPurpose): void {
  if (purpose) {
    cache.delete(cacheKey(userId, purpose));
    return;
  }
  for (const p of CONSENT_PURPOSES) cache.delete(cacheKey(userId, p));
}

/**
 * 동의 여부. 조회 실패는 "동의 없음"으로 처리한다 — DB가 흔들릴 때
 * 원문이 새는 쪽보다 안 쌓이는 쪽이 안전하다.
 */
export async function hasConsent(
  userId: string | null | undefined,
  purpose: ConsentPurpose
): Promise<boolean> {
  if (!userId) return false;
  const key = cacheKey(userId, purpose);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.granted;

  try {
    const row = await pool.query(
      `SELECT 1 FROM consents
        WHERE user_id = $1 AND purpose = $2 AND revoked_at IS NULL
        LIMIT 1`,
      [userId, purpose]
    );
    const granted = row.rows.length > 0;
    cache.set(key, { granted, expiresAt: Date.now() + CACHE_TTL_MS });
    return granted;
  } catch (err) {
    console.warn('[consents] lookup failed, treating as not granted:', err);
    return false;
  }
}

export async function listConsents(userId: string): Promise<ConsentRow[]> {
  const rows = await pool.query(
    `SELECT DISTINCT ON (purpose)
            purpose, granted_at, revoked_at, policy_version
       FROM consents
      WHERE user_id = $1
      ORDER BY purpose, granted_at DESC`,
    [userId]
  );
  return rows.rows.map((r) => ({
    purpose: r.purpose as ConsentPurpose,
    granted: r.revoked_at === null,
    grantedAt: r.granted_at ? new Date(r.granted_at).toISOString() : null,
    revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
    policyVersion: (r.policy_version as string | null) ?? null,
  }));
}

export async function grantConsent(
  userId: string,
  userRole: string,
  purpose: ConsentPurpose,
  source: string
): Promise<void> {
  // 부분 유니크 인덱스가 활성 동의를 하나로 강제하므로, 이미 있으면 no-op.
  await pool.query(
    `INSERT INTO consents (user_id, user_role, purpose, policy_version, source)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT DO NOTHING`,
    [userId, userRole, purpose, CONSENT_POLICY_VERSION, source]
  );
  invalidateConsentCache(userId, purpose);
}

export async function revokeConsent(
  userId: string,
  purpose: ConsentPurpose
): Promise<void> {
  await pool.query(
    `UPDATE consents SET revoked_at = now()
      WHERE user_id = $1 AND purpose = $2 AND revoked_at IS NULL`,
    [userId, purpose]
  );
  invalidateConsentCache(userId, purpose);
}
