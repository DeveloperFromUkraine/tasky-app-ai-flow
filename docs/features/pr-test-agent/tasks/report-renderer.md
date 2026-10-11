---
id: T6
title: "Render the agent report, outcome code and check conclusion"
layer: "domain"
deps: ["T5"]
blocks: ["T12"]
acs: ["AC-02", "AC-03", "AC-04", "AC-09", "AC-12", "AC-15", "AC-18"]
files_hint: [".github/scripts/report.mjs", ".github/scripts/report.test.mjs"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or contradicts the code in front of you, open the named file for the full text and follow that. Do not invent the missing part. -->

# T6 — Render the agent report, outcome code and check conclusion

## Place in the sequence

- **Blocked by:** T5 — Implement artifact schema validators · **Blocks:** T12 — Implement the publish orchestration script · **Wave:** 2.
- **Lane:** own lane.

## Why (user story)

> **As a** reviewer
> **I want** one agent report on the pull request that lists the per-file decisions with reasons, the skills used, the test results and the measured diff coverage
> **So that** I can decide whether to trust the agent-authored tests
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As a** reviewer
> **I want** suspected defects reported, not locked in by a green test
> **So that** a real bug is fixed rather than protected
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

Turns measured results and the agent's decisions into the single report a reviewer reads.

## Inlined context

> - Agent report — the single pull-request comment (for backfill: on the pull request the backfill opens), updated on every agent run, that lists per-file decisions, skills used, test results and diff coverage; on a backfill pull request it is owned by the backfill run, because the pull-request agent run does not run there. NOT the check status (the pass/fail mark next to the PR).
>
> — `CONTEXT.md §Glossary, Agent report, verbatim` · full text: [CONTEXT.md](../CONTEXT.md)

> | Report | One PR comment found by a hidden marker `<!-- test-agent-report -->`, upserted; numbers rendered only from `results.json`; model text escaped and length-capped | spec AC-03, AC-15 |
>
> — `sad.md §8, Report, verbatim` · full text: [sad.md](../sad.md)

> | Check result | Check run «test-agent»: `success` when all handled and target met; `neutral` on target missed, not completed, rejected or outdated; never blocks merge | spec AC-09, AC-18 |
>
> — `sad.md §8, Check result, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [events.md](../contracts/events.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Inputs: validated `decisions.json`, `results.json`, outcome code. Output: markdown starting with `<!-- test-agent-report -->`, check `{conclusion: success|neutral, title, summary}`.
- Outcome codes rendered: every `test_agent.*` code from the Publish outcomes table.

— `contracts/events.md, Code-host outputs + Publish outcomes, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-02 (US-02) — happy

> **Given** a PR author's pull request contains no testable change (every changed file is excluded by the pre-filter)
> **When** the workflow runs
> **Then** no agent run starts, and a stage that uses no model posts a short notice in the agent report that the pull request was skipped because there is no testable change
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-03 (US-03) — happy

> **Given** an agent run has completed
> **When** the reviewer opens the pull request
> **Then** the reviewer sees a single agent report naming the PR author's head commit it analysed and the agent's own commit (if any) and, for each testable change: the decision (write, update or skip) with a reason, the skills used, the passed and failed counts, and diff coverage per package taken from the measured results
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

### AC-04 (US-04) — domain invariant: «a failing test is never committed and a test never asserts behaviour the change plainly did not intend»

> **Given** the agent's test for a testable change still fails after its fix attempts, and explicit evidence in the code (the PR author's tests, doc comments, types or names) shows the production code behaves differently from what the change intends
> **When** the agent run finishes
> **Then** that test is not committed in failing form or rewritten to match the wrong behaviour, and the agent report lists a suspected defect with its location and the expected versus actual behaviour
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-09 (US-07) — cross-context

> **Given** the test agent cannot complete (the model is unavailable, the model workspace spend limit is reached or the time limit is reached)
> **When** the workflow finishes
> **Then** the agent check shows a neutral (advisory, not completed) result, the merge decision depends only on the tests check, and the agent report states why the run did not complete
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-12 (US-06) — error

> **Given** an agent run reaches its time or attempt limit before every testable change is handled
> **When** the run stops
> **Then** only tests that already passed their stability runs are committed, and the agent report lists each unfinished file as not completed because a limit was reached
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

### AC-15 (US-03) — error

> **Given** coverage could not be measured for a package
> **When** the agent report is written
> **Then** the agent report says diff coverage was not measured for that package and gives no estimated number
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

### AC-18 (US-01) — error

> **Given** an agent run handles every testable change within its limits but diff coverage for a package stays below the target
> **When** the agent run finishes
> **Then** the stable tests that raise coverage are committed, the agent report says the target was missed and lists the uncovered changed lines, the agent check shows a neutral result, and files the agent decided to skip (with their reason in the report) are left out of the diff-coverage denominator
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `renderReport({outcome, gate, decisions, results, headSha, agentSha})` → markdown; per-file table decision / reason / outcome; skills used; passed/failed per package; diff coverage or «not measured»; suspected defects; unstable; unfinished; author flags — `.github/scripts/report.mjs`
- [ ] Escape model text (markdown, HTML, mentions `@`), cap lengths — same file
- [ ] `checkConclusion(...)` — same file
- [ ] Self-check snapshot-free assertions — `.github/scripts/report.test.mjs`

## Edge cases

| Case | Behaviour |
|---|---|
| coverage not measured for frontend | report says not measured, no number |
| reason contains `@org/team` or `<img>` | rendered inert |
| target missed | says target missed + uncovered lines, check neutral |
| skip notice | short notice naming the reason, no table |

## Definition of Done

- [ ] `node --test .github/scripts/report.test.mjs` passes; every number in the output is read from `results`
- [ ] every Hard Rule inlined above still holds
- [ ] `npm run typecheck` in both packages and `node --check` on changed scripts are clean
