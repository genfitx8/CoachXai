/**
 * Guards GET /api/lessons against the failure that put another account's
 * records into a coach's 전체 레슨기록: the coach branch filtered on
 * `lessons.previous_coach_ids`, a column no migration ever creates (the
 * handover trail lives on `clients`). Postgres rejected the query, the route
 * answered 500, and the app fell back to its device-local lesson cache — which
 * on a shared phone/PC still held the previous account's lessons.
 *
 * A 500 from a column typo is invisible in review, so this test reads the SQL
 * in the route and checks every `snake_case` identifier it names against the
 * columns the migrations actually declare for `lessons`.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const ROUTE_FILE = path.join(ROOT, 'server/src/routes/lessons.ts');
const MIGRATIONS_DIR = path.join(ROOT, 'server/migrations');

/** Columns the migrations declare on `lessons`. */
const declaredLessonColumns = (): Set<string> => {
  const columns = new Set<string>();
  for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.js'))) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');

    const create = sql.match(/CREATE TABLE IF NOT EXISTS lessons\s*\(([\s\S]*?)\n\s*\)/);
    if (create) {
      for (const line of create[1].split('\n')) {
        const col = line.trim().match(/^([a-z][a-z0-9_]*)\s+[A-Za-z]/);
        if (col) columns.add(col[1]);
      }
    }

    for (const alter of sql.matchAll(
      /ALTER TABLE lessons ADD COLUMN(?: IF NOT EXISTS)? ([a-z][a-z0-9_]*)/g
    )) {
      columns.add(alter[1]);
    }
  }
  return columns;
};

/** Lower-case SQL builtins that read like columns but aren't. */
const SQL_FUNCTIONS = new Set(['gen_random_uuid', 'regexp_replace', 'array_append']);

/** Comments quote SQL and use apostrophes; neither should be parsed as code. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/**
 * Identifiers the route's SQL names. Only `snake_case` words are considered:
 * SQL keywords are written upper-case in this file, and single words (`id`,
 * `lessons`, `combined`) are too ambiguous to judge.
 */
const referencedIdentifiers = (source: string): Set<string> => {
  const found = new Set<string>();
  // Every string literal that talks about the table, plus the shared
  // visibility filter, which is spliced into those queries.
  const literals = [...stripComments(source).matchAll(/`([^`]*)`|'([^'\n]*)'/g)]
    .map((m) => m[1] ?? m[2] ?? '')
    .filter((text) => /\blessons\b/.test(text) || /approval_status/.test(text));

  for (const literal of literals) {
    for (const word of literal.matchAll(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g)) {
      if (!SQL_FUNCTIONS.has(word[0])) found.add(word[0]);
    }
  }
  return found;
};

describe('GET /api/lessons SQL', () => {
  const columns = declaredLessonColumns();
  const source = fs.readFileSync(ROUTE_FILE, 'utf-8');

  it('reads the lessons table it was migrated with', () => {
    // Sanity check on the parser itself before it is used as an oracle.
    expect(columns.has('coach_id')).toBe(true);
    expect(columns.has('original_coach_id')).toBe(true);
    expect(columns.has('review_sections_draft')).toBe(true);
    expect(columns.has('previous_coach_ids')).toBe(false);
  });

  it('only names columns that exist on lessons', () => {
    const unknown = [...referencedIdentifiers(source)].filter((id) => !columns.has(id));
    expect(unknown).toEqual([]);
  });
});
