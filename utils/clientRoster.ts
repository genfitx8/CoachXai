import type { ClientProfile } from '../types';
import { normalizeName, normalizePhone } from './clientMatch';

/**
 * 회원 명단(로스터) 정리 도구.
 *
 * 코치 화면의 회원 목록은 세 갈래에서 흘러들어온다 — 서버(GET /api/clients),
 * 이 기기의 localStorage 캐시, 그리고 예전 빌드가 남긴 잔재. 셋이 겹치면
 * "같은 이름 · 같은 번호"가 몇 백 줄씩 늘어선 목록이 만들어진다(레슨 중 동반의
 * 전체 학생 433명 건). 실제로 그 명단을 쓰는 쪽 — 특히 한 명을 고르는
 * 화면 — 은 사람 단위로 한 줄이면 충분하므로, 렌더 직전에 여기서 접는다.
 */

/**
 * "같은 사람"을 판정하는 키.
 *
 * 전화번호가 있으면 숫자만 남긴 번호 + 공백 제거한 이름. 010-1234-5678 과
 * 01012345678, "김 회원"과 "김회원"은 같은 사람이다.
 *
 * 번호가 비어 있으면 서로 다른 사람을 하나로 접을 위험이 있으므로 절대
 * 합치지 않는다 — 서버 id(없으면 이름)로 각자 고유한 키를 준다.
 */
export const clientIdentityKey = (client: Pick<ClientProfile, 'id' | 'name' | 'phone'>): string => {
  const phone = normalizePhone(client.phone);
  const name = normalizeName(client.name).toLowerCase();
  if (phone) return `p:${phone}|${name}`;
  return client.id ? `i:${client.id}` : `n:${name}`;
};

/** 정보가 더 많은(= 남길 값어치가 있는) 행일수록 높은 점수. */
const completeness = (client: ClientProfile): number => {
  let score = 0;
  // 서버에서 온 행만 id를 가진다. 유령 행(로컬 잔재)보다 항상 우선.
  if (client.id) score += 8;
  if (client.email) score += 4;
  if (client.coachId) score += 2;
  if (client.memo || client.coachMemo) score += 1;
  return score;
};

const updatedAtOf = (client: ClientProfile): number => {
  const v = (client as { updatedAt?: number | string }).updatedAt;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const parsed = Date.parse(v);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

/**
 * 같은 사람은 한 줄로 접는다. 원본 순서는 유지하고(첫 등장 자리), 각 자리에는
 * 그 사람의 행 중 가장 쓸모 있는 것 — 서버 id가 있고, 정보가 많고, 더 최근에
 * 갱신된 행 — 을 남긴다.
 */
export const dedupeClients = (clients: ClientProfile[]): ClientProfile[] => {
  const order: string[] = [];
  const best = new Map<string, ClientProfile>();

  for (const client of clients) {
    const key = clientIdentityKey(client);
    const current = best.get(key);
    if (!current) {
      order.push(key);
      best.set(key, client);
      continue;
    }
    const better =
      completeness(client) > completeness(current) ||
      (completeness(client) === completeness(current) &&
        updatedAtOf(client) > updatedAtOf(current));
    if (better) best.set(key, client);
  }

  return order.map((key) => best.get(key) as ClientProfile);
};
