/**
 * evalHarness — A tiny, pluggable eval framework for AI outputs.
 *
 * Why this exists
 * ---------------
 * Once observability is in place, the next question is: "was the AI's
 * response good?" Unit tests can't answer that — outputs are generative
 * and vary across runs. Eval cases pin down properties the output MUST
 * have (contains this keyword, parses as JSON, length between N and M)
 * without pretending the output will be byte-identical.
 *
 * Design
 * ------
 * - Framework-agnostic: `runEval` takes any async runner `(input) => string`.
 *   The same suite runs against the real Gemini backend OR against a
 *   captured/mocked output — the harness doesn't care.
 * - Assertions are pure functions, easy to unit-test and easy to author.
 * - Golden datasets live in `evals/<feature>.eval.json` — JSON so
 *   non-engineers (coaches, product) can author cases without touching TS.
 * - CI-friendly: a suite returns structured results; the caller decides
 *   whether "50% pass" is a failure (release gate) or just a signal.
 */

// ── Assertion types ─────────────────────────────────────────────────────────

/** Assertion authored in a JSON eval file. Serialisable form. */
export type Assertion =
  | { kind: 'contains'; needle: string; caseInsensitive?: boolean }
  | { kind: 'notContains'; needle: string; caseInsensitive?: boolean }
  | { kind: 'matches'; pattern: string; flags?: string }
  | { kind: 'wordCountBetween'; min: number; max: number }
  | { kind: 'lengthBetween'; min: number; max: number }
  | { kind: 'parseJson' }
  | { kind: 'hasField'; path: string };

export interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  reason?: string;
}

// ── Case + Result types ─────────────────────────────────────────────────────

export interface EvalCase<TInput = unknown> {
  /** Human-readable id, unique per suite. Used in reports. */
  name: string;
  description?: string;
  /** Arbitrary input handed to the runner. */
  input: TInput;
  assertions: Assertion[];
}

export interface EvalResult {
  name: string;
  passed: boolean;
  /** Per-assertion breakdown for granular reporting. */
  assertionResults: AssertionResult[];
  /** The runner's raw output text. Kept so failures are debuggable. */
  output: string;
  latencyMs: number;
  /** Present only if the runner threw. `passed` will be false in that case. */
  error?: string;
}

export interface EvalReport {
  suiteName: string;
  runAt: number;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  passRate: number;
  medianLatencyMs: number;
  results: EvalResult[];
}

// ── Assertion evaluator ─────────────────────────────────────────────────────

/**
 * Read a dotted path out of a parsed object. Supports numeric indices too
 * (`items.0.name`). Returns `undefined` if any segment is missing.
 */
const getFieldByPath = (obj: unknown, path: string): unknown => {
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
};

type ParseJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: string };

const tryParseJson = (text: string): ParseJsonResult => {
  const trimmed = text.trim();
  // Accept both raw JSON and JSON wrapped in a ```json code fence.
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = match ? match[1] : trimmed;
  try {
    const success: ParseJsonResult = { ok: true, value: JSON.parse(jsonText) };
    return success;
  } catch (e) {
    const failure: ParseJsonResult = {
      ok: false,
      reason: e instanceof Error ? e.message : 'invalid JSON',
    };
    return failure;
  }
};

const countWords = (text: string): number =>
  text.trim().split(/\s+/).filter(Boolean).length;

export const evaluateAssertion = (
  output: string,
  assertion: Assertion
): AssertionResult => {
  switch (assertion.kind) {
    case 'contains': {
      const hay = assertion.caseInsensitive ? output.toLowerCase() : output;
      const needle = assertion.caseInsensitive
        ? assertion.needle.toLowerCase()
        : assertion.needle;
      const passed = hay.includes(needle);
      return {
        assertion,
        passed,
        reason: passed ? undefined : `missing needle "${assertion.needle}"`,
      };
    }
    case 'notContains': {
      const hay = assertion.caseInsensitive ? output.toLowerCase() : output;
      const needle = assertion.caseInsensitive
        ? assertion.needle.toLowerCase()
        : assertion.needle;
      const passed = !hay.includes(needle);
      return {
        assertion,
        passed,
        reason: passed ? undefined : `unexpected needle "${assertion.needle}" present`,
      };
    }
    case 'matches': {
      try {
        const re = new RegExp(assertion.pattern, assertion.flags ?? '');
        const passed = re.test(output);
        return {
          assertion,
          passed,
          reason: passed ? undefined : `no match for /${assertion.pattern}/`,
        };
      } catch (e) {
        return {
          assertion,
          passed: false,
          reason: `invalid regex: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }
    case 'wordCountBetween': {
      const n = countWords(output);
      const passed = n >= assertion.min && n <= assertion.max;
      return {
        assertion,
        passed,
        reason: passed ? undefined : `word count ${n} outside [${assertion.min},${assertion.max}]`,
      };
    }
    case 'lengthBetween': {
      const n = output.length;
      const passed = n >= assertion.min && n <= assertion.max;
      return {
        assertion,
        passed,
        reason: passed ? undefined : `length ${n} outside [${assertion.min},${assertion.max}]`,
      };
    }
    case 'parseJson': {
      const r = tryParseJson(output) as { ok: boolean; reason?: string };
      if (r.ok) return { assertion, passed: true };
      return { assertion, passed: false, reason: `not JSON: ${r.reason ?? ''}` };
    }
    case 'hasField': {
      const r = tryParseJson(output) as { ok: boolean; value?: unknown; reason?: string };
      if (!r.ok) {
        return {
          assertion,
          passed: false,
          reason: `output not JSON: ${r.reason ?? ''}`,
        };
      }
      const value = getFieldByPath(r.value, assertion.path);
      const passed = value !== undefined;
      return {
        assertion,
        passed,
        reason: passed ? undefined : `field "${assertion.path}" missing`,
      };
    }
    default: {
      // Exhaustiveness guard — a new assertion kind should force a compile error here.
      const _exhaust: never = assertion;
      void _exhaust;
      return {
        assertion,
        passed: false,
        reason: 'unknown assertion kind',
      };
    }
  }
};

// ── Runner ──────────────────────────────────────────────────────────────────

export type Runner<TInput> = (input: TInput) => Promise<string>;

export interface RunEvalOptions {
  /** Suite name for the report. Defaults to "eval". */
  suiteName?: string;
  /** Optional per-case timeout in ms. Runner is not cancelled — this only
   *  marks the case as failed if the promise doesn't settle in time. */
  timeoutMs?: number;
}

const median = (nums: number[]): number => {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

const withTimeout = async <T>(p: Promise<T>, ms: number): Promise<T> => {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)
    ),
  ]);
};

/**
 * Run a suite of eval cases against the supplied runner. Never throws —
 * runner exceptions are captured as EvalResult.error so a single broken
 * case doesn't abort the whole suite.
 */
export const runEval = async <TInput>(
  suite: EvalCase<TInput>[],
  runner: Runner<TInput>,
  options: RunEvalOptions = {}
): Promise<EvalReport> => {
  const runAt = Date.now();
  const results: EvalResult[] = [];

  for (const testCase of suite) {
    const start = Date.now();
    let output = '';
    let error: string | undefined;
    try {
      output = options.timeoutMs
        ? await withTimeout(runner(testCase.input), options.timeoutMs)
        : await runner(testCase.input);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const latencyMs = Date.now() - start;

    const assertionResults = error
      ? testCase.assertions.map((a) => ({
          assertion: a,
          passed: false,
          reason: `runner error: ${error}`,
        }))
      : testCase.assertions.map((a) => evaluateAssertion(output, a));

    const passed = !error && assertionResults.every((r) => r.passed);
    results.push({
      name: testCase.name,
      passed,
      assertionResults,
      output,
      latencyMs,
      error,
    });
  }

  const passedCases = results.filter((r) => r.passed).length;
  return {
    suiteName: options.suiteName ?? 'eval',
    runAt,
    totalCases: results.length,
    passedCases,
    failedCases: results.length - passedCases,
    passRate: results.length > 0 ? passedCases / results.length : 0,
    medianLatencyMs: median(results.map((r) => r.latencyMs)),
    results,
  };
};

// ── Report formatting ───────────────────────────────────────────────────────

/**
 * Render an EvalReport as a markdown table. Good for CLI output, PR
 * comments, and dropping into a scratchpad.
 */
export const formatReportMarkdown = (report: EvalReport): string => {
  const lines: string[] = [];
  lines.push(`# Eval: ${report.suiteName}`);
  lines.push('');
  lines.push(
    `**Pass rate**: ${report.passedCases}/${report.totalCases} (${(report.passRate * 100).toFixed(1)}%) · ` +
      `**median latency**: ${report.medianLatencyMs}ms · ` +
      `**run at**: ${new Date(report.runAt).toISOString()}`
  );
  lines.push('');
  lines.push('| case | pass | latency | failures |');
  lines.push('| --- | --- | ---: | --- |');
  for (const r of report.results) {
    const marker = r.passed ? 'PASS' : 'FAIL';
    const failReasons = r.assertionResults
      .filter((a) => !a.passed)
      .map((a) => `${a.assertion.kind}: ${a.reason ?? ''}`)
      .join('; ');
    lines.push(
      `| ${r.name} | ${marker} | ${r.latencyMs}ms | ${failReasons || '-'} |`
    );
  }
  return lines.join('\n');
};
