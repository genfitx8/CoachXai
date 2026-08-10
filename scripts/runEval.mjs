#!/usr/bin/env node
/**
 * runEval — Run one or more JSON eval suites.
 *
 * Two modes, controlled by the `--real` flag:
 *
 * 1. Dry-run (default)
 *    Uses each case's `mockOutput` as the "runner" output. Fast, offline,
 *    verifies that the assertion harness itself is wired up. Regressions
 *    caught here are prompt-authoring bugs, not model quality changes.
 *
 * 2. Real  (--real)
 *    For every case that has `realPrompt`, calls the Gemini API directly
 *    with { prompt, systemInstruction, model }, then runs assertions
 *    against the live output. Requires GEMINI_API_KEY. Cases without
 *    `realPrompt` fall back to mockOutput.
 *
 *    Saves the raw model output to `evals/runs/<ISO>-<suite>.md` so a
 *    coach can eyeball what the model actually produced — golden numbers
 *    are only half the story, the prose has to be usable.
 *
 * Usage
 *   node scripts/runEval.mjs evals/shot_analysis.eval.json
 *   node scripts/runEval.mjs --real evals/shot_analysis.eval.json
 *   node scripts/runEval.mjs --real --model=gemini-2.5-pro evals/*.eval.json
 *
 * Exit code: 0 if every suite passes, 1 otherwise. Safe for CI.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';

// ── assertion evaluator (mirrors services/evalHarness.ts) ─────────────────

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

// ── real Gemini caller ────────────────────────────────────────────────────

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const callGemini = async ({ prompt, systemInstruction, model, temperature }) => {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set — cannot run --real');
  const modelId = (model || DEFAULT_MODEL).trim();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    ...(systemInstruction
      ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
      : {}),
    generationConfig: {
      ...(typeof temperature === 'number' ? { temperature } : {}),
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Gemini HTTP ${response.status}: ${errText.slice(0, 300)}`);
  }
  const payload = await response.json();
  const candidates = payload.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('Gemini returned no candidates');
  }
  const parts = candidates[0].content?.parts;
  if (!Array.isArray(parts)) throw new Error('Gemini candidate had no parts');
  const text = parts
    .filter((p) => typeof p.text === 'string')
    .map((p) => p.text)
    .join('\n');
  if (!text.trim()) throw new Error('Gemini returned empty text');
  return { text, model: modelId };
};

// ── runner ────────────────────────────────────────────────────────────────

const runSuite = async (suite, suiteName, opts) => {
  const results = [];
  for (const c of suite) {
    const start = Date.now();
    let output = '';
    let modelUsed;
    let error;

    // Decide runner: real API when --real and case has realPrompt, else mock.
    const useReal = opts.real && typeof c.realPrompt === 'string';
    if (useReal) {
      try {
        // realSystemInstruction may be inline OR loaded from a file so
        // we don't re-inline the whole SwingCode preamble in every case.
        let systemInstruction = c.realSystemInstruction;
        if (!systemInstruction && typeof c.realSystemInstructionFile === 'string') {
          const filePath = resolve(process.cwd(), c.realSystemInstructionFile);
          systemInstruction = readFileSync(filePath, 'utf-8');
        }
        const r = await callGemini({
          prompt: c.realPrompt,
          systemInstruction,
          model: opts.model || c.realModel,
          temperature: typeof c.realTemperature === 'number' ? c.realTemperature : undefined,
        });
        output = r.text;
        modelUsed = r.model;
      } catch (e) {
        error = e.message;
      }
    } else if (typeof c.mockOutput === 'string') {
      output = c.mockOutput;
    } else {
      error = opts.real
        ? 'case has neither realPrompt nor mockOutput'
        : 'case has no mockOutput (run with --real if realPrompt is present)';
    }

    const latencyMs = Date.now() - start;
    const assertionResults = error
      ? c.assertions.map((a) => ({ assertion: a, passed: false, reason: `runner error: ${error}` }))
      : c.assertions.map((a) => evaluateAssertion(output, a));

    results.push({
      name: c.name,
      passed: !error && assertionResults.every((r) => r.passed),
      assertionResults,
      output,
      latencyMs,
      error,
      model: modelUsed,
      mode: useReal ? 'real' : 'mock',
    });
  }

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

// ── run-log writer ────────────────────────────────────────────────────────

const RUN_DIR = resolve(process.cwd(), 'evals', 'runs');

const writeRunLog = (report, suiteName) => {
  mkdirSync(RUN_DIR, { recursive: true });
  const isoStamp = new Date(report.runAt).toISOString().replace(/[:.]/g, '-');
  const safeName = basename(suiteName).replace(/\.[^.]+$/, '');
  const file = resolve(RUN_DIR, `${isoStamp}-${safeName}.md`);

  const lines = [];
  lines.push(`# Eval run — ${suiteName}`);
  lines.push(`\n- **Run at**: ${new Date(report.runAt).toISOString()}`);
  lines.push(
    `- **Pass rate**: ${report.passedCases}/${report.totalCases} (${(report.passRate * 100).toFixed(1)}%)`
  );
  const totalLatency = report.results.reduce((s, r) => s + r.latencyMs, 0);
  lines.push(
    `- **Total latency**: ${totalLatency}ms (mean ${Math.round(totalLatency / Math.max(1, report.results.length))}ms)`
  );

  for (const r of report.results) {
    lines.push(`\n---\n## ${r.passed ? '✅' : '❌'} ${r.name}`);
    lines.push(`- **mode**: ${r.mode}${r.model ? ` · **model**: ${r.model}` : ''} · **latency**: ${r.latencyMs}ms`);
    if (r.error) lines.push(`- **error**: ${r.error}`);
    const failed = r.assertionResults.filter((a) => !a.passed);
    if (failed.length > 0) {
      lines.push(`- **failed assertions**:`);
      for (const a of failed) lines.push(`  - \`${a.assertion.kind}\`: ${a.reason}`);
    }
    if (r.output) {
      lines.push(`\n<details><summary>output (${r.output.length} chars)</summary>\n`);
      lines.push('```markdown');
      // Trim very long outputs so the log stays reviewable.
      const clipped = r.output.length > 6000 ? `${r.output.slice(0, 6000)}\n… [clipped]` : r.output;
      lines.push(clipped);
      lines.push('```');
      lines.push('\n</details>');
    }
  }

  writeFileSync(file, lines.join('\n'));
  return file;
};

// ── CLI ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const opts = { real: false, model: undefined };
const suites = [];
for (const a of argv) {
  if (a === '--real') opts.real = true;
  else if (a.startsWith('--model=')) opts.model = a.slice('--model='.length);
  else if (a === '--help' || a === '-h') {
    console.log('Usage: node scripts/runEval.mjs [--real] [--model=<id>] <suite.json> [more...]');
    process.exit(0);
  } else suites.push(a);
}

if (suites.length === 0) {
  console.error('Usage: node scripts/runEval.mjs [--real] [--model=<id>] <suite.json> [more...]');
  process.exit(2);
}

if (opts.real && !process.env.GEMINI_API_KEY) {
  console.error('❌ --real requires GEMINI_API_KEY in env');
  process.exit(2);
}

let anyFail = false;

for (const arg of suites) {
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

  const report = await runSuite(suite, arg, opts);
  const header =
    report.failedCases === 0 ? `✅ ${report.suiteName}` : `❌ ${report.suiteName}`;
  const modeLabel = opts.real ? ' [real]' : ' [dry]';
  console.log(
    `${header}${modeLabel}  ${report.passedCases}/${report.totalCases} pass  (${(report.passRate * 100).toFixed(1)}%)`
  );
  for (const r of report.results) {
    const marker = r.passed ? '  ✓' : '  ✗';
    const modelTag = r.model ? ` [${r.model}]` : '';
    console.log(`${marker} ${r.name}${modelTag}  (${r.latencyMs}ms)`);
    if (!r.passed) {
      if (r.error) console.log(`      error: ${r.error}`);
      for (const ar of r.assertionResults) {
        if (!ar.passed) console.log(`      ${ar.assertion.kind}: ${ar.reason ?? 'failed'}`);
      }
    }
  }

  if (opts.real) {
    const logFile = writeRunLog(report, arg);
    console.log(`  → run log: ${logFile}`);
  }
  if (report.failedCases > 0) anyFail = true;
}

process.exit(anyFail ? 1 : 0);
