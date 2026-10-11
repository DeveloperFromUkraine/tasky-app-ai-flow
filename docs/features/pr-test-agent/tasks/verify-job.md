---
id: T11
title: "Add the verify job: stability runs and measured coverage"
layer: "wiring"
deps: ["T10", "T3", "T4", "T5"]
blocks: ["T13"]
acs: ["AC-14", "AC-15", "AC-16", "AC-18"]
files_hint: [".github/workflows/test-agent.yml", ".github/scripts/verify.mjs"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or contradicts the code in front of you, open the named file for the full text and follow that. Do not invent the missing part. -->

# T11 — Add the verify job: stability runs and measured coverage

## Place in the sequence

- **Blocked by:** T10 — Add the agent job: federated model access and a locked-down Claude run, T3 — Implement diff coverage from lcov and the git diff, T4 — Implement the sandbox wrapper and stability runner, T5 — Implement artifact schema validators · **Blocks:** T13 — Add the workflow_run publish workflow with the App token · **Wave:** 4.
- **Lane:** shares `.github/workflows/test-agent.yml` with T9, T10 — serialized.

## Why (user story)

> **As a** reviewer
> **I want** one agent report on the pull request that lists the per-file decisions with reasons, the skills used, the test results and the measured diff coverage
> **So that** I can decide whether to trust the agent-authored tests
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As a** repository maintainer
> **I want** to run the same test agent and skills on demand over a chosen package of existing code
> **So that** code that already lacks tests gets covered without a separate tool
>
> — `spec.md §4, US-09, verbatim` · full text: [spec.md](../spec.md)

Measures, with no model, which agent tests are stable and how much of the change they cover.

## Inlined context

> | Run duties | gate: trigger checks, maintainer role, pre-filter, skip reason. verify: baseline coverage (backfill: package before), patched coverage, stability. publish: trust checks, the no-model skip notice (AC-02, rule paths), patch rules, commit to the pull-request branch or create the backfill branch and open its pull request (AC-16), report, check | here |
>
> — `sad.md §8, Run duties, verbatim` · full text: [sad.md](../sad.md)

> | Diff coverage target | ≥ 80% of changed lines per package | measured coverage output intersected with the PR diff (backfill: package line coverage before vs after) |
>
> — `spec.md §6, NFR Diff coverage target, verbatim` · full text: [spec.md](../spec.md)

> **Chosen:** option 1. Numbers come from a job the model never controls, and the only job with write rights is defined on main by construction of `workflow_run`, so a pull request cannot change it. Option 2 does not work: a job running for a pull-request ref is refused by an environment restricted to main, and loosening that restriction would expose the App key to a file the pull request can edit. Option 3 runs from main too, but it is the trigger that most often ends up checking out pull-request code with write rights; `workflow_run` keeps the writer free of pull-request code by design and only receives artifacts, which publish validates (ADR-0004).
>
> — `adr/0002-split-unprivileged-agent-and-verify-from-workflow-run-publish.md, Decision outcome, verbatim` · full text: [0002-split-unprivileged-agent-and-verify-from-workflow-run-publish.md](../adr/0002-split-unprivileged-agent-and-verify-from-workflow-run-publish.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [events.md](../contracts/events.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Downloads `gate` + `agent`; uploads `results.json` + `agent.filtered.patch` as artifact `verify`.

— `contracts/events.md, test_agent.results.v1, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-14 (US-03) — error

> **Given** an agent-authored test passes once but fails in one of the repeated stability runs
> **When** the agent run finishes
> **Then** that test is discarded, and the agent report lists it as unstable instead of counting it as passing
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-15 (US-03) — error

> **Given** coverage could not be measured for a package
> **When** the agent report is written
> **Then** the agent report says diff coverage was not measured for that package and gives no estimated number
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

### AC-16 (US-09) — happy

> **Given** a repository maintainer starts the test agent on demand for the backend or the frontend package
> **When** the agent run finishes
> **Then** agent-authored tests for previously uncovered lines of production code (including uncovered lines in partly covered files) are committed to a new backfill branch and a pull request to main is opened from it, under the same rules as for pull requests (only allowed test files, only stable passing tests); the tests check runs on that pull request but the pull-request agent run does not, and the agent report on that pull request, owned by the backfill run, shows the package coverage before and after
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

### AC-18 (US-01) — error

> **Given** an agent run handles every testable change within its limits but diff coverage for a package stays below the target
> **When** the agent run finishes
> **Then** the stable tests that raise coverage are committed, the agent report says the target was missed and lists the uncovered changed lines, the agent check shows a neutral result, and files the agent decided to skip (with their reason in the report) are left out of the diff-coverage denominator
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Job `permissions: contents: read`, no id-token, `timeout-minutes: 4`, `if: always() && needs.gate.outputs.decision == 'run'` — `.github/workflows/test-agent.yml`
- [ ] `verify.mjs`: baseline coverage (backfill: package before), apply patch, `stability.mjs`, coverage run with `--coverage.reporter=lcov` via sandbox, `diff-coverage.mjs`, write `results.json` — `.github/scripts/verify.mjs`

## Edge cases

| Case | Behaviour |
|---|---|
| agent artifact missing | `results.json` marks not completed, publish reports `test_agent.not_completed` |
| patch does not apply | results mark not completed |

## Definition of Done

- [ ] On a test PR `results.json` validates with `artifacts.mjs` and its numbers match a manual `vitest --coverage` run
- [ ] every Hard Rule inlined above still holds
- [ ] `npm run typecheck` in both packages and `node --check` on changed scripts are clean
