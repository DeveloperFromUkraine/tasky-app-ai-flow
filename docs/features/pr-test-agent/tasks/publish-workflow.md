---
id: T13
title: "Add the workflow_run publish workflow with the App token"
layer: "wiring"
deps: ["T11", "T12"]
blocks: ["T14"]
acs: ["AC-10", "AC-11", "AC-13", "AC-16", "AC-07"]
files_hint: [".github/workflows/test-agent-publish.yml"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or contradicts the code in front of you, open the named file for the full text and follow that. Do not invent the missing part. -->

# T13 — Add the workflow_run publish workflow with the App token

## Place in the sequence

- **Blocked by:** T11 — Add the verify job: stability runs and measured coverage, T12 — Implement the publish orchestration script · **Blocks:** T14 — Add CODEOWNERS and the setup prerequisites document · **Wave:** 5.
- **Lane:** own lane.

## Why (user story)

> **As a** PR author
> **I want** the merge decision to rest on the deterministic tests check, with the agent check advisory only
> **So that** an agent outage never blocks my merge and an agent-authored test never merges untested
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

> **As a** PR author
> **I want** the agent to re-run on my new commits without looping on its own commits
> **So that** the tests and the report always match the latest version of my pull request
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

> **As a** repository maintainer
> **I want** to run the same test agent and skills on demand over a chosen package of existing code
> **So that** code that already lacks tests gets covered without a separate tool
>
> — `spec.md §4, US-09, verbatim` · full text: [spec.md](../spec.md)

Runs publish from main with the only write credential, so agent commits trigger the tests check.

## Inlined context

> `test-agent-publish.yml` (on `workflow_run` of `test-agent.yml` completed; its job runs only if `workflow_run.head_repository` is this repository and the event is `pull_request` or `workflow_dispatch`, evaluated before it enters environment `test-agent-publish`, which holds the App private key and is restricted to the main branch; concurrency group per pull request)
>
> — `sad.md §7, abridged` · full text: [sad.md](../sad.md)

> **Chosen:** option 1. Its pushes trigger the tests check normally, and its commits carry a bot identity the gate can recognise. The token lives for one job and is scoped to one repository.
>
> — `adr/0003-publish-with-github-app-installation-token.md, Decision outcome, verbatim` · full text: [0003-publish-with-github-app-installation-token.md](../adr/0003-publish-with-github-app-installation-token.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [events.md](../contracts/events.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Consumes `workflow_run` completed for the agent workflow (same repository, event `pull_request` or `workflow_dispatch`, conclusion ≠ `cancelled`).

— `contracts/events.md, Channel code-host events, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-10 (US-07) — cross-context

> **Given** the agent has committed agent-authored tests to the pull-request branch
> **When** the reviewer looks at the merge status
> **Then** the tests check has run on the commit that contains those tests, and merge stays blocked until it passes
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-11 (US-08) — cross-context

> **Given** an agent run is in progress and the PR author pushes a new commit
> **When** the new commit arrives
> **Then** the older run is cancelled without committing anything, a new run covers the newest commit, the same agent report is updated, and the agent's own commit does not start another agent run
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

### AC-13 (US-01) — error

> **Given** the PR author pushes while the agent run is finishing, so the agent's change no longer applies cleanly to the branch
> **When** the publishing stage tries to commit
> **Then** nothing is committed, the agent report says the result is outdated, and the next run handles the newest commit
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-16 (US-09) — happy

> **Given** a repository maintainer starts the test agent on demand for the backend or the frontend package
> **When** the agent run finishes
> **Then** agent-authored tests for previously uncovered lines of production code (including uncovered lines in partly covered files) are committed to a new backfill branch and a pull request to main is opened from it, under the same rules as for pull requests (only allowed test files, only stable passing tests); the tests check runs on that pull request but the pull-request agent run does not, and the agent report on that pull request, owned by the backfill run, shows the package coverage before and after
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

### AC-07 (US-05) — authorization

> **Given** a pull request comes from a fork, or targets a branch other than main
> **When** the workflow is triggered
> **Then** the test agent does not run, receives no model access and no privileged trigger runs; the tests check still runs; and the PR author sees in the workflow result (not a pull-request comment) that the agent only serves same-repository pull requests to main (and on-demand backfill runs started by a repository maintainer)
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Trigger, job-level `if` on head repository + event, environment `test-agent-publish`, concurrency per PR, `permissions: contents: read, checks: write, pull-requests: write, actions: read` — `.github/workflows/test-agent-publish.yml`
- [ ] Mint App installation token (`actions/create-github-app-token`, pinned SHA) scoped to this repo; checkout main scripts only; run `publish.mjs` — same file

## Edge cases

| Case | Behaviour |
|---|---|
| fork-triggered run | job skipped before the environment |
| agent commit pushed | tests check starts on it |

## Definition of Done

- [ ] On a test PR the App commits the tests, the report comment appears, the check run is set, and `tests` runs on the agent commit
- [ ] every Hard Rule inlined above still holds
- [ ] `npm run typecheck` in both packages and `node --check` on changed scripts are clean
