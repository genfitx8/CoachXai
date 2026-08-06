# Eval Baseline — CoachX AI

This is where you record the numbers that everything after gets compared to.
Update the tables after each `npm run eval:real` run against a stable
prompt/model configuration.

## How to establish a baseline

1. Make sure `GEMINI_API_KEY` is set in your shell.
2. Run `npm run eval:real` — this hits Gemini for every case with a
   `realPrompt` and saves a per-suite log to `evals/runs/`.
3. Read the run logs (they include the full model output for every case).
4. Fill in the tables below with pass rate, mean latency, and one-line
   quality note per suite.
5. Commit BASELINE.md changes. Future PRs that regress these numbers
   need to explain why.

## Current baselines

_Fill in after your first `npm run eval:real`._

### shot_analysis

| Metric | Value | Notes |
| --- | --- | --- |
| Pass rate | _e.g. 5/5 (100%)_ | |
| Mean latency (ms) | | |
| Model | gemini-2.5-flash | pinned in eval files |
| Prompt version | services/promptService.ts@HEAD | |
| Coach quality read | | 1-5 across cases; anything jarring? |

### coachx_chat

| Metric | Value | Notes |
| --- | --- | --- |
| Pass rate | | |
| Mean latency (ms) | | |
| Model | gemini-2.5-flash | |
| Prompt version | services/promptService.ts@HEAD | |
| Coach quality read | | |

### motion_capture

| Metric | Value | Notes |
| --- | --- | --- |
| Pass rate | | |
| Mean latency (ms) | | |
| Model | gemini-2.5-flash | |
| Prompt version | services/promptService.ts@HEAD | |
| Coach quality read | | |

## What "regression" means here

- **Pass rate drops** on the same set of cases: a hard signal — a real
  property the AI used to satisfy no longer holds.
- **Latency spikes >30%**: worth investigating (model change, prompt bloat).
- **Quality note gets worse**: subjective but critical. Golden numbers
  cover shape, not usefulness — human read still matters.

Any of those should block a merge until you understand the cause.

## Adding cases over time

Target coverage:
- `shot_analysis`: aim for 15+ cases (current: 5). Cover more clubs,
  more mixed data scenarios, more hallucination-bait inputs.
- `coachx_chat`: aim for 15+ cases (current: 4). Cover more member
  question types, more edge cases (empty data, contradictory data,
  multiple members mentioned).
- `motion_capture`: aim for 10+ cases (current: 3). Cover more
  measurement patterns.

Every real-world quality complaint is a candidate new case: capture the
input that produced the bad output, add it to the golden set, then work
until the model handles it.
