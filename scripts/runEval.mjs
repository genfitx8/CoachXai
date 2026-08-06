#!/usr/bin/env node
/**
 * runEval — Run a JSON eval suite against the shared harness.
 *
 * Usage:
 *   node scripts/runEval.mjs evals/shot_analysis.eval.json
 *   node scripts/runEval.mjs evals/*.eval.json
 *
 * By default each case's `mockOutput` is used as the runner output — a
 * dry-run smoke test that verifies the harness + assertions are wired
 * up without hitting the AI backend. A later PR will add a --real flag
 * that translates each case's `input.scenarioLabel` into an actual
 * service call.
 *
 * Exit code: 0 if every suite passes; 1 otherwise. Safe for CI.
 *
 * This script is standalone JS (mjs) so it can be run with plain
 * `node` and needs no TS compilation. It duplicates a minimal subset
 * of services/evalHarness.ts on purpose — the TS version is what the
 * app uses, this JS mirror is what the CLI uses. Both are covered by
 * __tests__/evalHarness.test.ts.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── minimal JS mirror of services/evalHarness.ts ──────────────────────────

const getFieldByPath = (obj, path) => {
  const parts = path.split('.').filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
};

const tryParseJson = (text) => {
  const trimmed = text.trim();
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = match ? match[1] : trimmed;
  try {
    return { ok: true, value: JSON.parse(jsonText) };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
};

const countWords = (text) =>
  text.trim().split(/\s+/).filter(Boolean).length;

const evaluateAssertion = (output, assertion) => {
  switch (assertion.kind) {
    case 'contains': {
      const hay = assertion.caseInsensitive ? output.toLowerCase() : output;
      const needle = assertion.caseInsensitive
        ? assertion.needle.toLowerCase()
        : assertion.needle;
      const passed = hay.includes(needle);
      return { assertion, passed, reason: passed ? undefined : `missing "${assertion.needle}"` };
    }
    case 'notContains': {
      const hay = assertion.caseInsensitive ? output.toLowerCase() : output;
      const needle = assertion.caseInsensitive
        ? assertion.needle.toLowerCase()
        : assertion.needle;
      const passed = !hay.includes(needle);
      return { assertion, passed, reason: passed ? undefined : `unexpected "${assertion.needle}" present` };
    }
    case 'matches': {
      try {
        const re = new RegExp(assertion.pattern, assertion.flags ?? '');
        const passed = re.test(output);
        return { assertion, passed, reason: passed ? undefined : `no match for /${assertion.pattern}/` };
      } catch (e) {
        return { assertion, passed: false, reason: `invalid regex: ${e.message}` };
      }
    }
    case 'wordCountBetween': {
      const n = countWords(output);
      const passed = n >= assertion.min && n <= assertion.max;
      return { assertion, passed, reason: passed ? undefined : `word count ${n} outside [${assertion.min},${assertion.max}]` };
    }
    case 'lengthBetween': {
      const n = output.length;
      const passed = n >= assertion.min && n <= assertion.max;
      return { assertion, passed, reason: passed ? undefined : `length ${n} outside [${assertion.min},${assertion.max}]` };
    }
    case 'parseJson': {
      const r = tryParseJson(output);
      return { assertion, passed: r.ok, reason: r.ok ? undefined : `not JSON: ${r.reason}` };
    }
    case 'hasField': {
      const r = tryParseJson(output);
      if (!r.ok) return { assertion, passed: false, reason: `output not JSON: ${r.reason}` };
      const value = getFieldByPath(r.value, assertion.path);
      const passed = value !== undefined;
      return { assertion, passed, reason: passed ? undefined : `field "${assertion.path}" missing` };
    }
    default:
      return { assertion, passed: false, reason: 'unknown assertion kind' };
  }
};

const runSuite = (suite, suiteName) => {
  const results = suite.map((c) => {
    if (typeof c.mockOutput !== 'string') {
      return {
        name: c.name,
        passed: false,
        assertionResults: [],
        output: '',
        latencyMs: 0,
        error: 'case has no mockOutput (real-Gemini mode not yet wired)',
      };
    }
    const start = Date.now();
    const assertionResults = c.assertions.map((a) => evaluateAssertion(c.mockOutput, a));
    return {
      name: c.name,
      passed: assertionResults.every((r) => r.passed),
      assertionResults,
      output: c.mockOutput,
      latencyMs: Date.now() - start,
    };
  });
  const passedCases = results.filter((r) => r.passed).length;
  return {
    suiteName,
    runAt: Date.now(),
    totalCases: results.length,
    passedCases,
    failedCases: results.length - passedCases,
    passRate: results.length ? passedCases / results.length : 0,
    results,
  };
};

// ── CLI ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error('Usage: node scripts/runEval.mjs <suite.json> [<suite2.json> ...]');
  process.exit(2);
}

let anyFail = false;
for (const arg of argv) {
  const path = resolve(process.cwd(), arg);
  let suite;
  try {
    suite = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (e) {
    console.error(`❌  ${arg}: failed to read (${e.message})`);
    anyFail = true;
    continue;
  }
  if (!Array.isArray(suite)) {
    console.error(`❌  ${arg}: top-level JSON must be an array of cases`);
    anyFail = true;
    continue;
  }
  const report = runSuite(suite, arg);
  const header =
    report.failedCases === 0
      ? `✅ ${report.suiteName}`
      : `❌ ${report.suiteName}`;
  console.log(
    `${header}  ${report.passedCases}/${report.totalCases} pass  (${(report.passRate * 100).toFixed(1)}%)`
  );
  for (const r of report.results) {
    const marker = r.passed ? '  ✓' : '  ✗';
    console.log(`${marker} ${r.name}  (${r.latencyMs}ms)`);
    if (!r.passed) {
      if (r.error) console.log(`      error: ${r.error}`);
      for (const ar of r.assertionResults) {
        if (!ar.passed) console.log(`      ${ar.assertion.kind}: ${ar.reason ?? 'failed'}`);
      }
    }
  }
  if (report.failedCases > 0) anyFail = true;
}

process.exit(anyFail ? 1 : 0);
