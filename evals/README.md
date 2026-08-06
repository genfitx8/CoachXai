# AI Eval Suites

Golden datasets that pin down what "good" looks like for each AI feature.

## Why eval files instead of unit tests?

AI outputs vary run-to-run. Unit tests want byte-identical results and are
useless here. Eval cases assert **properties** the output must have
(sections present, numbers well-formed, forbidden phrases absent) without
demanding the exact string.

## File layout

```
evals/
  README.md             ← this file
  shot_analysis.eval.json
  <feature>.eval.json   ← one file per AI feature
```

Each `<feature>.eval.json` is an array of cases:

```json
[
  {
    "name": "iron-heavy-shot-set",
    "description": "5 lessons, mostly 7-iron and PW, no motion capture",
    "input": { "scenarioLabel": "iron-heavy" },
    "mockOutput": "## 🎯 실제 샷 분포\n...",
    "assertions": [
      { "kind": "contains", "needle": "## 🎯 실제 샷 분포" },
      { "kind": "contains", "needle": "## 📍 핀 위치별 공략법" },
      { "kind": "notContains", "needle": "TODO" },
      { "kind": "lengthBetween", "min": 500, "max": 20000 }
    ]
  }
]
```

## Assertion kinds

| kind | meaning |
| --- | --- |
| `contains` | Output must include the needle (add `caseInsensitive: true` to loosen) |
| `notContains` | Output must NOT include the needle |
| `matches` | Regex `pattern` (with optional `flags`) must match somewhere |
| `wordCountBetween` | Whitespace-split token count inside `[min, max]` |
| `lengthBetween` | Character count inside `[min, max]` |
| `parseJson` | Output must parse as JSON (bare or `\`\`\`json` fenced) |
| `hasField` | `path` (dotted, supports numeric indices) resolves on the parsed JSON |

## Running an eval

```bash
# Dry-run: use the `mockOutput` baked into each case.
npx tsx scripts/runEval.ts evals/shot_analysis.eval.json

# The exit code is 0 if all cases pass, 1 otherwise — safe to use in CI.
```

Real-Gemini runs are wired feature-by-feature; each feature that has an
`evals/*.eval.json` will get a matching runner function that translates the
case's `input` into the actual service call.

## Adding a new case

1. Come up with the smallest input scenario that would exercise the
   behaviour you care about (a common failure, a tricky edge case).
2. Run the feature manually against that input, copy the output into
   `mockOutput`.
3. List the properties the output should always have as assertions.
4. Commit. From this point forward, any prompt/model change that would
   break those properties gets caught in eval instead of production.
