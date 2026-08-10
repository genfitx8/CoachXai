/**
 * Tests for the evalHarness — assertion library, runner, and report formatter.
 *
 * These tests use the TS module (services/evalHarness.ts); the JS mirror in
 * scripts/runEval.mjs is a straight translation and is smoke-tested via
 * `npm run eval` (see evals/shot_analysis.eval.json).
 */
import { describe, expect, it } from 'vitest';
import {
  Assertion,
  EvalCase,
  evaluateAssertion,
  formatReportMarkdown,
  runEval,
} from '../services/evalHarness';

describe('evaluateAssertion', () => {
  it('contains: hits and misses', () => {
    expect(
      evaluateAssertion('hello world', { kind: 'contains', needle: 'world' })
        .passed
    ).toBe(true);
    expect(
      evaluateAssertion('hello world', { kind: 'contains', needle: 'nope' })
        .passed
    ).toBe(false);
  });

  it('contains: caseInsensitive', () => {
    expect(
      evaluateAssertion('Hello World', {
        kind: 'contains',
        needle: 'hello',
        caseInsensitive: true,
      }).passed
    ).toBe(true);
  });

  it('notContains: inverts', () => {
    expect(
      evaluateAssertion('safe text', { kind: 'notContains', needle: 'TODO' })
        .passed
    ).toBe(true);
    expect(
      evaluateAssertion('has TODO here', {
        kind: 'notContains',
        needle: 'TODO',
      }).passed
    ).toBe(false);
  });

  it('matches: regex hit', () => {
    expect(
      evaluateAssertion('12 mph', { kind: 'matches', pattern: '\\d+\\s*mph' })
        .passed
    ).toBe(true);
    expect(
      evaluateAssertion('no numbers', {
        kind: 'matches',
        pattern: '\\d+',
      }).passed
    ).toBe(false);
  });

  it('matches: invalid regex fails gracefully', () => {
    const r = evaluateAssertion('x', { kind: 'matches', pattern: '(' });
    expect(r.passed).toBe(false);
    expect(r.reason).toContain('invalid regex');
  });

  it('wordCountBetween respects bounds', () => {
    expect(
      evaluateAssertion('one two three', {
        kind: 'wordCountBetween',
        min: 2,
        max: 5,
      }).passed
    ).toBe(true);
    expect(
      evaluateAssertion('one two three four five six', {
        kind: 'wordCountBetween',
        min: 2,
        max: 5,
      }).passed
    ).toBe(false);
  });

  it('lengthBetween respects bounds', () => {
    expect(
      evaluateAssertion('hello', { kind: 'lengthBetween', min: 1, max: 10 })
        .passed
    ).toBe(true);
    expect(
      evaluateAssertion('h', { kind: 'lengthBetween', min: 2, max: 10 }).passed
    ).toBe(false);
  });

  it('parseJson accepts bare and fenced JSON', () => {
    expect(
      evaluateAssertion('{"a":1}', { kind: 'parseJson' }).passed
    ).toBe(true);
    expect(
      evaluateAssertion('```json\n{"a":1}\n```', { kind: 'parseJson' }).passed
    ).toBe(true);
    expect(
      evaluateAssertion('not json', { kind: 'parseJson' }).passed
    ).toBe(false);
  });

  it('hasField reads dotted paths including numeric indices', () => {
    const json = '{"items":[{"name":"iron"}, {"name":"driver"}]}';
    expect(
      evaluateAssertion(json, { kind: 'hasField', path: 'items.0.name' })
        .passed
    ).toBe(true);
    expect(
      evaluateAssertion(json, { kind: 'hasField', path: 'items.5.name' })
        .passed
    ).toBe(false);
  });

  it('hasField fails when output is not JSON', () => {
    const r = evaluateAssertion('nope', {
      kind: 'hasField',
      path: 'anything',
    });
    expect(r.passed).toBe(false);
    expect(r.reason).toContain('not JSON');
  });
});

describe('runEval', () => {
  const passingCase: EvalCase<string> = {
    name: 'basic-pass',
    input: 'in',
    assertions: [{ kind: 'contains', needle: 'output' }],
  };
  const failingCase: EvalCase<string> = {
    name: 'basic-fail',
    input: 'in',
    assertions: [{ kind: 'contains', needle: 'MISSING' }],
  };

  it('runs cases and aggregates pass rate', async () => {
    const report = await runEval(
      [passingCase, failingCase],
      async () => 'the output'
    );
    expect(report.totalCases).toBe(2);
    expect(report.passedCases).toBe(1);
    expect(report.failedCases).toBe(1);
    expect(report.passRate).toBeCloseTo(0.5);
  });

  it('captures runner errors instead of throwing', async () => {
    const report = await runEval([passingCase], async () => {
      throw new Error('backend down');
    });
    expect(report.results[0].passed).toBe(false);
    expect(report.results[0].error).toBe('backend down');
    // Every assertion result is marked failed with the runner error as reason.
    expect(report.results[0].assertionResults[0].passed).toBe(false);
    expect(report.results[0].assertionResults[0].reason).toContain('backend down');
  });

  it('honours per-case timeout', async () => {
    const slow: EvalCase<string> = {
      name: 'slow',
      input: 'x',
      assertions: [{ kind: 'contains', needle: 'x' }],
    };
    const report = await runEval(
      [slow],
      () => new Promise((res) => setTimeout(() => res('x'), 100)),
      { timeoutMs: 10 }
    );
    expect(report.results[0].passed).toBe(false);
    expect(report.results[0].error).toMatch(/timeout/);
  });

  it('exposes runner output on results', async () => {
    const report = await runEval([passingCase], async () => 'hello output');
    expect(report.results[0].output).toBe('hello output');
  });

  it('computes median latency across cases', async () => {
    let call = 0;
    const cases: EvalCase<string>[] = [
      { name: 'c1', input: '', assertions: [] },
      { name: 'c2', input: '', assertions: [] },
      { name: 'c3', input: '', assertions: [] },
    ];
    // Runner sleeps 10/50/30ms — median = 30.
    const report = await runEval(cases, async () => {
      const delays = [10, 50, 30];
      const delay = delays[call++];
      await new Promise((res) => setTimeout(res, delay));
      return '';
    });
    // Allow generous tolerance — timers in jsdom aren't precise.
    expect(report.medianLatencyMs).toBeGreaterThanOrEqual(20);
    expect(report.medianLatencyMs).toBeLessThan(80);
  });
});

describe('formatReportMarkdown', () => {
  it('produces a table with pass/fail markers and failure reasons', async () => {
    const cases: EvalCase<string>[] = [
      { name: 'ok', input: '', assertions: [{ kind: 'contains', needle: 'x' }] },
      { name: 'bad', input: '', assertions: [{ kind: 'contains', needle: 'zz' }] },
    ];
    const report = await runEval(cases, async () => 'xyz');
    const md = formatReportMarkdown(report);
    expect(md).toContain('# Eval:');
    expect(md).toContain('| ok | PASS |');
    expect(md).toContain('| bad | FAIL |');
    expect(md).toContain('missing needle "zz"');
  });
});
