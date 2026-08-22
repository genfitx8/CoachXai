/**
 * The localStorage caches (lessons, members, packages …) are device-global and
 * serve as the offline fallback. Sharing one phone or PC between accounts must
 * not mean sharing records: when a different account signs in, the per-account
 * buckets are dropped so nobody is served lessons they never saved.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { storageService } from '../services/storage';
import type { Lesson } from '../types';

const lesson = (id: string, coachId: string): Lesson =>
  ({ id, coachId, clientName: '홍길동', clientPhone: '010-1111-2222', createdAt: 1 }) as Lesson;

describe('local cache ownership', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps the cache when the same account signs in again', () => {
    storageService.applyCacheOwner('COACH:a');
    storageService.saveLessons([lesson('l1', 'a')]);

    expect(storageService.applyCacheOwner('COACH:a')).toBe(false);
    expect(storageService.getLessons()).toHaveLength(1);
  });

  it('drops the cache when another account signs in on the device', () => {
    storageService.applyCacheOwner('COACH:a');
    storageService.saveLessons([lesson('l1', 'a')]);
    storageService.saveClients([
      { id: 'c1', name: '홍길동', phone: '010-1111-2222' } as never,
    ]);

    expect(storageService.applyCacheOwner('COACH:b')).toBe(true);
    expect(storageService.getLessons()).toEqual([]);
    expect(storageService.getClients()).toEqual([]);
    expect(storageService.getCacheOwner()).toBe('COACH:b');
  });

  it('drops an unstamped cache the caller cannot vouch for', () => {
    // Installs that predate the stamp: the cache may be this account's own
    // offline data or the last user's, and there is no way to tell.
    storageService.saveLessons([lesson('l1', 'someone')]);

    expect(storageService.applyCacheOwner('CLIENT:홍길동_01011112222')).toBe(true);
    expect(storageService.getLessons()).toEqual([]);
  });

  it('keeps an unstamped cache the caller vouches for', () => {
    // The coach profile cached at launch names this very coach, so the rest of
    // the cache is their own offline data — un-synced records survive.
    storageService.saveLessons([lesson('l1', 'a')]);

    expect(storageService.applyCacheOwner('COACH:a', true)).toBe(false);
    expect(storageService.getLessons()).toHaveLength(1);
    expect(storageService.getCacheOwner()).toBe('COACH:a');
  });

  it('leaves facility-level data alone', () => {
    storageService.applyCacheOwner('COACH:a');
    storageService.saveBranch({ id: 'b1', name: '강남점' } as never);

    storageService.applyCacheOwner('COACH:b');
    expect(storageService.getBranches()).toHaveLength(1);
  });
});
