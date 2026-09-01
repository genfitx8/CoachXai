/**
 * Deleting a lesson used to drop only its database row: the swing video and
 * every clip under `lessons/{id}/` stayed in the R2 bucket with nothing left
 * to reference them, so uploads accumulated forever. `DELETE /api/lessons/:id`
 * now sweeps that prefix.
 *
 * The sweep is the one call in the codebase that destroys member media, so its
 * blast radius is worth pinning down: the prefix must stay scoped to a single
 * lesson id, the helper must refuse an empty prefix (which matches every
 * object in the bucket), and the media must never go before the row that owns
 * it. `r2.ts` pulls in `@aws-sdk/client-s3`, a `server/` dependency the root
 * test suite cannot resolve, so — as in lessonQueryColumns.test.ts — this
 * reads the source rather than executing it.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (relative: string): string =>
  fs.readFileSync(path.join(ROOT, relative), 'utf-8');

const r2Source = read('server/src/services/r2.ts');
const lessonsSource = read('server/src/routes/lessons.ts');

/** The DELETE /api/lessons/:id handler body, comments stripped. */
const deleteHandler = (): string => {
  const start = lessonsSource.indexOf("router.delete('/:id'");
  expect(start).toBeGreaterThan(-1);
  return lessonsSource
    .slice(start)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
};

describe('deleteObjectsByPrefix', () => {
  it('refuses an empty prefix, which would match the whole bucket', () => {
    const guard = r2Source.match(
      /export async function deleteObjectsByPrefix[\s\S]*?\n\n/
    );
    expect(guard?.[0]).toMatch(/if \(!prefix\)[\s\S]*?throw new Error/);
  });

  it('pages through the whole listing instead of stopping at the first 1000', () => {
    expect(r2Source).toMatch(/ContinuationToken: continuationToken/);
    expect(r2Source).toMatch(/IsTruncated \? listed\.NextContinuationToken/);
  });
});

describe('DELETE /api/lessons/:id media cleanup', () => {
  const handler = deleteHandler();

  it("sweeps only the deleted lesson's own prefix", () => {
    expect(handler).toContain('deleteObjectsByPrefix(`lessons/${id}/`)');
    // A bare `lessons/` would take out every lesson in the bucket.
    expect(handler).not.toMatch(/deleteObjectsByPrefix\(\s*['"`]lessons\/['"`]/);
  });

  it('validates the id before building a prefix out of it', () => {
    const call = handler.indexOf('deleteObjectsByPrefix');
    const guard = handler.indexOf('UUID_PATTERN.test(id)');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(call);
  });

  it('deletes the media only after the row that owns it is gone', () => {
    const rowDelete = handler.indexOf("DELETE FROM lessons WHERE id = $1");
    const mediaDelete = handler.indexOf('deleteObjectsByPrefix');
    expect(rowDelete).toBeGreaterThan(-1);
    expect(rowDelete).toBeLessThan(mediaDelete);
  });

  it('does not fail the request when storage cleanup fails', () => {
    const cleanup = handler.slice(
      handler.indexOf('UUID_PATTERN.test(id)'),
      handler.indexOf('recordEventSafe')
    );
    expect(cleanup).toMatch(/try \{[\s\S]*deleteObjectsByPrefix[\s\S]*\} catch/);
    expect(cleanup).not.toMatch(/res\.status\(/);
  });
});
