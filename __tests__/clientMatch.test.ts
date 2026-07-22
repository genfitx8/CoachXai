import { describe, it, expect } from 'vitest';
import { lessonBelongsToClient, normalizeName, normalizePhone } from '../utils/clientMatch';

describe('utils/clientMatch', () => {
  const 김지환 = { name: '김지환', phone: '010-1234-5678' };

  it('matches when name and phone are exactly the same', () => {
    expect(
      lessonBelongsToClient({ clientName: '김지환', clientPhone: '010-1234-5678' }, 김지환)
    ).toBe(true);
  });

  it('matches when phone format differs but digits match', () => {
    expect(
      lessonBelongsToClient({ clientName: '', clientPhone: '01012345678' }, 김지환)
    ).toBe(true);
  });

  it('matches when stored name has trailing/leading whitespace', () => {
    expect(
      lessonBelongsToClient(
        { clientName: '  김지환 ', clientPhone: '' },
        { name: '김지환', phone: '' }
      )
    ).toBe(true);
  });

  it('matches when stored name contains a non-breaking space', () => {
    expect(
      lessonBelongsToClient(
        { clientName: '김지환 ', clientPhone: '' },
        { name: '김지환', phone: '' }
      )
    ).toBe(true);
  });

  it('matches by phone even when name drifted (e.g. display name edited)', () => {
    expect(
      lessonBelongsToClient(
        { clientName: '김지환 (구)', clientPhone: '010-1234-5678' },
        김지환
      )
    ).toBe(true);
  });

  it('does not match a different client', () => {
    expect(
      lessonBelongsToClient(
        { clientName: '이영수', clientPhone: '010-9999-0000' },
        김지환
      )
    ).toBe(false);
  });

  it('normalizePhone strips non-digit characters', () => {
    expect(normalizePhone('+82 (10) 1234-5678')).toBe('821012345678');
    expect(normalizePhone(null)).toBe('');
    expect(normalizePhone(undefined)).toBe('');
  });

  it('normalizeName strips all whitespace including non-breaking', () => {
    expect(normalizeName('김 지환')).toBe('김지환');
    expect(normalizeName('김지환 ')).toBe('김지환');
    expect(normalizeName(null)).toBe('');
  });
});
