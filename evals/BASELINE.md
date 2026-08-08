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

## Current baseline — 2026-08-08 (v2)

**Overall pass rate: 12/12 (100%)** after F1/F4 fixes.

### v2 changes from v1
- **F1 fixed** (unit hallucination): `shot_analysis` system prompt now explicitly forbids unit conversion. Real-run confirms "74 mph" is preserved as "74 mph" (previously became "74 km/h"). All 5 shot_analysis cases now carry `contains "<X> mph"` + `notContains "<X> km/h"` guards to catch any regression.
- **F4 fixed** (assertion case-sensitivity): `hook-tendency-3-clubs` uses `caseInsensitive: true` for club path terms and `matches` for both English + Korean spellings.
- **iron-heavy assertion tuned**: "데이터 부족" → matches `데이터(가)?\s*(부족|없)` (accepts natural variants like "데이터가 없어").

## Current baseline — 2026-08-08 (v2)

**Run**: 12 cases across 3 features against `gemini-2.5-flash` (temperature 0.3 for shot/motion, 0.7 for chat).

### shot_analysis

| Metric | Value (v2) | v1 | Notes |
| --- | --- | --- | --- |
| Pass rate | **5/5 (100%)** | 4/5 (80%) | v1 failure was assertion bug, fixed |
| Mean latency | **27.0s** | 30.8s | 23s (sparse) → 31s (hook). Still slow for UX. |
| P50 latency | ~27s | ~33s | |
| Model | gemini-2.5-flash | same | pinned in eval files |
| Prompt version | services/promptService.ts@HEAD | @20662b9 | v2 adds unit-preserve rule |
| Coach quality read | **4.0 / 5** | 3.5 / 5 | Unit-hallucination fixed. F2 (optimal launch ranges) still to address. |

### coachx_chat

| Metric | Value | Notes |
| --- | --- | --- |
| Pass rate | 4/4 (100%) | |
| Mean latency | **4.3s** | 1.4s (refusal) → 7.2s (SwingCode vocab). Great for chat. |
| Model | gemini-2.5-flash | |
| Prompt version | services/promptService.ts@20662b9 | |
| Coach quality read | **4.5 / 5** | Grounded, uses member names correctly, refuses out-of-scope politely, SwingCode language natural. |

### motion_capture

| Metric | Value | Notes |
| --- | --- | --- |
| Pass rate | 3/3 (100%) | |
| Mean latency | **16.4s** | 13s → 20s. Medium — probably fine (motion analysis is a one-off click). |
| Model | gemini-2.5-flash | |
| Prompt version | services/promptService.ts@20662b9 | |
| Coach quality read | **4.5 / 5** | Deep SwingCode analysis, cites specific measurements, physics-grounded (GRF, 키네마틱), practical drills. |

## Findings that need action

### ✅ F1 — Unit hallucination — FIXED in v2

v1 finding: `iron-heavy-lesson-set` model rewrote **74 mph → 74 km/h**. v2 fix:
- System prompt (`services/promptService.ts` + `evals/prompts/shot_analysis.system.md`) now carries an explicit "입력된 단위를 절대 변환하지 말 것" rule.
- Every shot_analysis case gained a `contains "<X> mph"` + `notContains "<X> km/h"` guard.
- v2 real run confirms all 5 cases preserve mph exactly. Guards remain in place to catch any future regression.

### 🟡 F2 — Optimal launch/spin values may be invented golf knowledge

Model claims "7번 아이언 최적 런치 18~20°" and "PW 최적 25~28°". These numbers aren't in the input and I'm not certain they match Trackman research (tour data suggests 15-17° for 7I). Model is confidently asserting domain-specific numeric claims without a source.

- **Action**: add a physics/reference tool the model can call for optimal-range lookups (Phase C in the roadmap).
- **Action for now**: instruct the model to phrase optimal-range claims as "일반적으로 알려진 범위" instead of definitive numbers, OR pull the ranges into the system prompt from a trusted reference.

### 🟠 F3 — shot_analysis latency ~31s is user-visible

The full report typically takes half a minute. That's noticeable when a coach clicks "generate report" and waits with a spinner.

- **Action**: enable streaming for shot_analysis. Same pattern as coachx_chat streaming — user sees the first section within 300-500ms.
- **Action (later)**: consider model routing (this is a long-form reasoning task where `gemini-2.5-pro` might be worth the cost).

### ✅ F4 — Assertion case-sensitivity — FIXED in v2

`hook-tendency-3-clubs` now uses `caseInsensitive: true` on the English needle and adds a `matches` regex covering both `club path` (English) and `클럽 패스` (Korean).

### 🟢 Positive baseline facts (things we should NOT regress)

- **Member-name grounding is solid**: `coachx_chat.member-progress-question` correctly used 김한나 only, did NOT invent other members from the client list. `notContains 최민석 / 박준호` passed.
- **Out-of-scope refusal is polite and redirects**: 1.4s response.
- **Data-insufficiency honesty**: model refuses to fabricate a roadmap for a member with 2 sessions of setup only.
- **SwingCode vocabulary usage**: 매달림, 던지는, 이중 진자, 채찍, 3분리 all appear naturally in appropriate contexts.
- **Motion capture depth**: model connects measurement to Wall Drill, Head Cover Drill, Medicine Ball Throw — genuinely useful coaching.

## What "regression" means here

- **Pass rate drops** on the same set of cases: a hard signal — a real
  property the AI used to satisfy no longer holds.
- **Latency spikes >30%**: worth investigating (model change, prompt bloat).
- **Coach quality read gets worse**: subjective but critical. Golden numbers
  cover shape, not usefulness — human read still matters.

Any of those should block a merge until you understand the cause.

## Adding cases over time

Target coverage:
- `shot_analysis`: aim for 15+ cases (current: 5). Cover more clubs,
  more mixed data scenarios, more hallucination-bait inputs
  (especially unit-preservation traps).
- `coachx_chat`: aim for 15+ cases (current: 4). Cover more member
  question types, more edge cases (empty data, contradictory data,
  multiple members mentioned).
- `motion_capture`: aim for 10+ cases (current: 3). Cover more
  measurement patterns.

Every real-world quality complaint is a candidate new case: capture the
input that produced the bad output, add it to the golden set, then work
until the model handles it.
