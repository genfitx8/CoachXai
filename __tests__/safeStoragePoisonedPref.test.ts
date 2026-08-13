import { beforeEach, describe, expect, it } from 'vitest';
import { readBooleanPref } from '../utils/safeStorage';

/**
 * Regression: a boolean preference read at render time used to call
 * `JSON.parse(localStorage.getItem(key))` with no guard. When the entry was
 * corrupt (literal "undefined" left by a prior `JSON.stringify(undefined)`
 * write, a hand-edited value, another script's write), the exception was
 * thrown *inside* a `useState` initializer and unmounted the React tree
 * with no chance to recover — the user saw the app "튕김" the moment the
 * component owning the pref tried to mount.
 *
 * `readBooleanPref` self-heals every poisoned shape so the caller can rely
 * on the fallback and next boot has a clean slot.
 */
describe('readBooleanPref — poisoned pref self-heal', () => {
  const KEY = 'client_showMedia';

  beforeEach(() => {
    localStorage.clear();
  });

  it('returns the default when the slot is empty', () => {
    expect(readBooleanPref(KEY, false)).toBe(false);
    expect(readBooleanPref(KEY, true)).toBe(true);
  });

  it('parses a well-formed true / false', () => {
    localStorage.setItem(KEY, JSON.stringify(true));
    expect(readBooleanPref(KEY, false)).toBe(true);

    localStorage.setItem(KEY, JSON.stringify(false));
    expect(readBooleanPref(KEY, true)).toBe(false);
  });

  it('does not throw on the literal "undefined" string and clears it', () => {
    localStorage.setItem(KEY, 'undefined');
    expect(() => readBooleanPref(KEY, false)).not.toThrow();
    expect(readBooleanPref(KEY, false)).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('does not throw on the literal "null" string and clears it', () => {
    localStorage.setItem(KEY, 'null');
    expect(() => readBooleanPref(KEY, true)).not.toThrow();
    expect(readBooleanPref(KEY, true)).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('does not throw on an empty string slot', () => {
    localStorage.setItem(KEY, '');
    expect(() => readBooleanPref(KEY, false)).not.toThrow();
    expect(readBooleanPref(KEY, false)).toBe(false);
  });

  it('clears malformed JSON instead of crashing the caller', () => {
    localStorage.setItem(KEY, '{not-json');
    expect(() => readBooleanPref(KEY, false)).not.toThrow();
    expect(readBooleanPref(KEY, false)).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('discards a valid JSON value that decoded to a non-boolean', () => {
    // e.g. an earlier build stored a number or the string "true".
    localStorage.setItem(KEY, JSON.stringify(1));
    expect(readBooleanPref(KEY, false)).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();

    localStorage.setItem(KEY, JSON.stringify('true'));
    expect(readBooleanPref(KEY, false)).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
