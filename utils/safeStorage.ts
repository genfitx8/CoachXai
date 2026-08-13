/**
 * Safe localStorage helpers used at render time.
 *
 * A useState initializer that calls `JSON.parse(localStorage.getItem(key))`
 * blows up the whole React tree the moment the stored value is corrupt —
 * the literal string "undefined" left by an earlier
 * `JSON.stringify(undefined)` write, an entry hand-edited in devtools, a
 * value overwritten by another script — because the exception is raised
 * *during* render and never reaches an event handler's try/catch.
 *
 * This is the same class of bug that landed as commit `cc0ca89`
 * (`fix(auth): 로그인 후 앱이 튕기던 문제 해결 — 손상된 localStorage 자가치유`)
 * for the coach profile / auth token slots. These helpers extend that
 * self-healing policy to every preference bit read from localStorage at
 * mount time so a single poisoned entry never bricks the app boot.
 */
import { createLogger } from './logger';

const log = createLogger('safeStorage');

const POISONED_STRING_LITERALS = new Set(['', 'undefined', 'null']);

const inBrowser = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

/**
 * Read a boolean preference. Falls back to `defaultValue` (and self-heals the
 * offending entry) when the slot is missing, empty, the literal "undefined"
 * / "null" string, malformed JSON, or JSON that decoded to a non-boolean.
 */
export function readBooleanPref(key: string, defaultValue: boolean): boolean {
  if (!inBrowser()) return defaultValue;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return defaultValue;
  }
  if (raw === null) return defaultValue;
  if (POISONED_STRING_LITERALS.has(raw)) {
    tryRemove(key);
    return defaultValue;
  }
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'boolean') return parsed;
    tryRemove(key);
    return defaultValue;
  } catch (err) {
    log.warn(`Removing corrupt boolean preference "${key}":`, err);
    tryRemove(key);
    return defaultValue;
  }
}

function tryRemove(key: string): void {
  if (!inBrowser()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable — non-fatal.
  }
}
