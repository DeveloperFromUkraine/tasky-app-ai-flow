---
id: T3
title: "Implement diff coverage from lcov and the git diff"
layer: "domain"
deps: []
blocks: ["T11"]
acs: ["AC-15", "AC-18", "AC-16"]
files_hint: [".github/scripts/diff-coverage.mjs", ".github/scripts/diff-coverage.test.mjs"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or contradicts the code in front of you, open the named file for the full text and follow that. Do not invent the missing part. -->

# T3 — Implement diff coverage from lcov and the git diff

## Place in the sequence

- **Blocked by:** — · **Blocks:** T11 — Add the verify job: stability runs and measured coverage · **Wave:** 1.
- **Lane:** own lane.

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

Produces the measured coverage numbers the report shows, so no number comes from model text.

## Inlined context

> - Diff coverage — the share of added or changed lines in testable changes that the test suite executes. NOT overall package coverage.
>
> — `CONTEXT.md §Glossary, Diff coverage, verbatim` · full text: [CONTEXT.md](../CONTEXT.md)

> | Diff coverage target | ≥ 80% of changed lines per package | measured coverage output intersected with the PR diff (backfill: package line coverage before vs after) |
>
> — `spec.md §6, NFR Diff coverage target, verbatim` · full text: [spec.md](../spec.md)

> | Report fidelity | 100% of numbers come from measured output | publishing stage reads the result files, not model text |
>
> — `spec.md §6, NFR Report fidelity, verbatim` · full text: [spec.md](../spec.md)

> | Backend coverage config has per-file thresholds, so a coverage run can exit non-zero while still writing lcov | Low | Pass `--coverage.reporter=lcov` on the command line; judge «measured» by the lcov file, not the exit code | Repository maintainer |
>
> — `sad.md §11, coverage risk row, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [events.md](../contracts/events.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Fills `results.coverage.<package>`: `measured`, `diff {covered,total,pct}`, `target_pct` 80, `target_met`, `uncovered_lines[{file,lines}]`, `package_before_pct`, `package_after_pct` (backfill).
- `measured` is true only when the lcov file for the package exists; skipped files are not in the denominator.

— `contracts/events.md, test_agent.results.v1, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

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

### AC-16 (US-09) — happy

> **Given** a repository maintainer starts the test agent on demand for the backend or the frontend package
> **When** the agent run finishes
> **Then** agent-authored tests for previously uncovered lines of production code (including uncovered lines in partly covered files) are committed to a new backfill branch and a pull request to main is opened from it, under the same rules as for pull requests (only allowed test files, only stable passing tests); the tests check runs on that pull request but the pull-request agent run does not, and the agent report on that pull request, owned by the backfill run, shows the package coverage before and after
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Parse `lcov.info` (SF/DA records) into per-file line hits — `.github/scripts/diff-coverage.mjs`
- [ ] Parse `git diff -U0 base..head` into added/changed line numbers per file, limited to testable files minus skipped — same file
- [ ] Intersect, compute per package covered/total/pct, uncovered lines, target_met; package line pct for backfill — same file
- [ ] Missing lcov → `measured:false, diff:null` — same file
- [ ] Self-check with fixture lcov + diff — `.github/scripts/diff-coverage.test.mjs`

## Edge cases

| Case | Behaviour |
|---|---|
| lcov missing (coverage crashed) | `measured: false`, no number |
| changed lines not instrumented (types only) | not in denominator |
| total changed lines = 0 | `measured: true`, pct reported as n/a, target_met true |
| coverage command exits non-zero due to thresholds but lcov exists | measured from lcov |

## Definition of Done

- [ ] `node --test .github/scripts/diff-coverage.test.mjs` passes; a fixture with 4/5 lines covered yields 80% and `target_met: true`
- [ ] every Hard Rule inlined above still holds
- [ ] `npm run typecheck` in both packages and `node --check` on changed scripts are clean
