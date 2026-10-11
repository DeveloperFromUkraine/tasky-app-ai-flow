---
id: T8
title: "Add the deterministic tests check workflow"
layer: "wiring"
deps: []
blocks: []
acs: ["AC-10", "AC-07"]
files_hint: [".github/workflows/tests.yml"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or contradicts the code in front of you, open the named file for the full text and follow that. Do not invent the missing part. -->

# T8 — Add the deterministic tests check workflow

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** 1.
- **Lane:** own lane.

## Why (user story)

> **As a** PR author
> **I want** the merge decision to rest on the deterministic tests check, with the agent check advisory only
> **So that** an agent outage never blocks my merge and an agent-authored test never merges untested
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

Provides the merge-blocking check the merge decision rests on.

## Inlined context

> - Tests check — the deterministic, merge-blocking run of the full backend and frontend test suites on a pull request, with no model involved. NOT the test agent's own advisory check.
>
> — `CONTEXT.md §Glossary, Tests check, verbatim` · full text: [CONTEXT.md](../CONTEXT.md)

> | Tests check duration | ≤ 5 min p95 | workflow job duration |
>
> — `spec.md §6, NFR Tests check duration, verbatim` · full text: [spec.md](../spec.md)

> `tests.yml` (on `pull_request` incl. forks, and `push` to main)
>
> — `sad.md §7, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [events.md](../contracts/events.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-10 (US-07) — cross-context

> **Given** the agent has committed agent-authored tests to the pull-request branch
> **When** the reviewer looks at the merge status
> **Then** the tests check has run on the commit that contains those tests, and merge stays blocked until it passes
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-07 (US-05) — authorization

> **Given** a pull request comes from a fork, or targets a branch other than main
> **When** the workflow is triggered
> **Then** the test agent does not run, receives no model access and no privileged trigger runs; the tests check still runs; and the PR author sees in the workflow result (not a pull-request comment) that the agent only serves same-repository pull requests to main (and on-demand backfill runs started by a repository maintainer)
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Workflow on `pull_request` (all branches) and `push` to main, `permissions: contents: read`, Node 22, matrix `[backend, frontend]`, `npm ci`, `npm test`, frontend also `npm run typecheck` — `.github/workflows/tests.yml`
- [ ] Stable job name `tests (<package>)` for branch protection — same file

## Edge cases

| Case | Behaviour |
|---|---|
| fork PR | runs with read-only token |
| agent commit pushed by the App | runs (AC-10) |

## Definition of Done

- [ ] Workflow passes on a PR in GitHub; job names are stable for branch protection
- [ ] every Hard Rule inlined above still holds
- [ ] `npm run typecheck` in both packages and `node --check` on changed scripts are clean
