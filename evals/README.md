# AI Eval Suites

Golden datasets that pin down what "good" looks like for each AI feature.

## Why eval files instead of unit tests?

AI outputs vary run-to-run. Unit tests want byte-identical results and are
useless here. Eval cases assert **properties** the output must have
(sections present, numbers well-formed, forbidden phrases absent) without
demanding the exact string.

## Two modes

**Dry-run** (default, `npm run eval`) uses each case's `mockOutput` as the
runner output. Fast, offline, verifies the harness wiring. Catches
prompt-authoring bugs, not model quality changes.

**Real** (`npm run eval:real`) calls the Gemini API for every case that
has `realPrompt`. Requires `GEMINI_API_KEY` in env. Full model output for
each case is saved to `evals/runs/<ISO>-<suite>.md` so a coach can eyeball
what the model actually produced.

## File layout

```
evals/
  README.md              ← this file
  prompts/               ← system prompts, one per feature (real mode uses these)
    shot_analysis.system.md
    coachx_chat.system.md
    motion_capture.system.md
  shot_analysis.eval.json
  coachx_chat.eval.json
  motion_capture.eval.json
  runs/                  ← per-run log output (gitignored)
```

Each `<feature>.eval.json` is an array of cases:

```json
[
  {
    "name": "iron-heavy-shot-set",
    "description": "10 lessons dominated by 7-iron and PW…",
    "input": { "scenarioLabel": "iron-heavy" },

    "realSystemInstructionFile": "evals/prompts/shot_analysis.system.md",
    "realPrompt": "리포트 참고 자료:\n- 회원: 김한나…",
    "realModel": "gemini-2.5-flash",
    "realTemperature": 0.3,

    "mockOutput": "## 🎯 실제 샷 분포\n…",

    "assertions": [
      { "kind": "contains", "needle": "## 🎯 실제 샷 분포" },
      { "kind": "notContains", "needle": "TODO" },
      { "kind": "lengthBetween", "min": 500, "max": 20000 }
    ]
  }
]
```

- `realPrompt` — full user prompt sent to Gemini. Includes the scenario data.
- `realSystemInstructionFile` — path to a .md file containing the system
  prompt for that feature. Keeps the eval JSON small.
  Alternative: `realSystemInstruction` (inline string) if you don't want a
  separate file.
- `realModel` / `realTemperature` — optional overrides. Router in the app
  chooses model per feature; here we pin it so eval results are reproducible.
- `mockOutput` — a hand-authored realistic output, used in dry-run mode.

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
# Dry-run: uses mockOutput. All suites, no API key needed.
npm run eval

# Real: hits Gemini API, saves per-run logs to evals/runs/
GEMINI_API_KEY=... npm run eval:real

# Single suite, custom model
node scripts/runEval.mjs --real --model=gemini-2.5-pro evals/shot_analysis.eval.json
```

Exit code is 0 when every case passes, 1 otherwise — safe for CI gates.

## Adding a new case

1. Come up with the smallest input scenario that would exercise the
   behaviour you care about (a common failure, a tricky edge case).
2. Author the `realPrompt` — the actual prompt the AI would receive
   in production for this scenario. Copy the prompt-assembly logic
   from the corresponding service function.
3. Run the case against real Gemini once, review the output, copy it
   into `mockOutput` for the fast dry-run path.
4. List the properties the output should always have as `assertions`.
   Focus on **structural** requirements (sections present) and
   **grounding** requirements (no invented names/numbers) rather than
   exact wording.
5. Commit. From this point forward, any prompt/model change that would
   break those properties gets caught in eval instead of production.

## Keeping system prompts in sync

`evals/prompts/*.system.md` is a copy of the strings compiled into
`services/promptService.ts`. When you change a built-in system prompt in
the app, update the matching .md here too. A future PR could automate the
extraction; for now it's a manual step so eval baselines don't shift
silently underneath you.
