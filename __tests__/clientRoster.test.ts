import { describe, it, expect } from 'vitest';
import type { ClientProfile } from '../types';
import { clientIdentityKey, dedupeClients } from '../utils/clientRoster';

/**
 * 코치 회원 명단은 서버·기기 캐시·예전 빌드의 잔재가 겹쳐 도착할 수 있고,
 * 겹치면 "같은 이름 · 같은 번호"가 수백 줄 늘어선다(레슨 중 동반 전체 학생
 * 433명). 사람 단위로 접는 규칙을 여기에 못 박는다.
 */

const client = (over: Partial<ClientProfile> & { name: string }): ClientProfile => ({
  phone: '',
  ...over,
});

describe('clientIdentityKey', () => {
  it('treats punctuation and spacing differences as the same person', () => {
    expect(clientIdentityKey({ name: '김 회원', phone: '010-1234-5678' })).toBe(
      clientIdentityKey({ name: '김회원', phone: '01012345678' })
    );
  });

  it('keeps different numbers apart even under the same name', () => {
    expect(clientIdentityKey({ name: '김회원', phone: '010-1111-1111' })).not.toBe(
      clientIdentityKey({ name: '김회원', phone: '010-2222-2222' })
    );
  });

  it('never merges phone-less rows that carry their own id', () => {
    expect(clientIdentityKey({ id: 'a', name: '동명이인', phone: '' })).not.toBe(
      clientIdentityKey({ id: 'b', name: '동명이인', phone: '' })
    );
  });
});

describe('dedupeClients', () => {
  it('collapses repeats while keeping first-seen order', () => {
    const roster = dedupeClients([
      client({ name: '강민수', phone: '010-1000-0001' }),
      client({ name: '김지훈', phone: '010-2000-0002' }),
      client({ name: '강민수', phone: '01010000001' }),
      client({ name: '김지훈', phone: '010-2000-0002' }),
    ]);

    expect(roster.map((c) => c.name)).toEqual(['강민수', '김지훈']);
  });

  it('keeps the server row over a local leftover of the same person', () => {
    const roster = dedupeClients([
      client({ name: '박서연', phone: '010-3000-0003' }),
      client({
        id: 'server-row',
        name: '박서연',
        phone: '010-3000-0003',
        email: 'seoyeon@test.com',
        coachId: 'coach1',
      }),
    ]);

    expect(roster).toHaveLength(1);
    expect(roster[0].id).toBe('server-row');
  });

  it('prefers the more recently updated row when both are equally complete', () => {
    const older = { ...client({ id: 'a', name: '이코치', phone: '010-4000-0004' }), updatedAt: 100 };
    const newer = { ...client({ id: 'b', name: '이코치', phone: '010-4000-0004' }), updatedAt: 200 };

    expect(dedupeClients([older, newer] as ClientProfile[])[0].id).toBe('b');
    expect(dedupeClients([newer, older] as ClientProfile[])[0].id).toBe('b');
  });

  it('leaves a clean roster untouched', () => {
    const roster = [
      client({ name: '강민수', phone: '010-1000-0001' }),
      client({ name: '김지훈', phone: '010-2000-0002' }),
    ];
    expect(dedupeClients(roster)).toEqual(roster);
  });
});
