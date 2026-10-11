---
id: T9
title: "Create the agent workflow with triggers, concurrency and the gate job"
layer: "wiring"
deps: ["T1"]
blocks: ["T10"]
acs: ["AC-02", "AC-07", "AC-11", "AC-17"]
files_hint: [".github/workflows/test-agent.yml"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or contradicts the code in front of you, open the named file for the full text and follow that. Do not invent the missing part. -->

# T9 — Create the agent workflow with triggers, concurrency and the gate job

## Place in the sequence

- **Blocked by:** T1 — Implement the pre-filter and gate decision script · **Blocks:** T10 — Add the agent job: federated model access and a locked-down Claude run · **Wave:** 2.
- **Lane:** shares `.github/workflows/test-agent.yml` with T10, T11 — serialized.

## Why (user story)

> **As a** PR author
> **I want** the test agent to skip pull requests that contain no testable change
> **So that** documentation or styling changes don't cost time or money and don't add noise
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

> **As a** repository maintainer
> **I want** the test agent to be unable to change anything except allowed test files, and unable to expose credentials
> **So that** a hostile or prompt-injected pull request cannot turn the agent against the repository
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

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

Starts every agent run and stops the ones that must not run, before any model access.

## Inlined context

> `test-agent.yml` (on `pull_request` to any branch and `workflow_dispatch`; the gate stops fork and non-main pull requests and writes the reason to the workflow job summary; concurrency group `test-agent-<pr number or package>`, `cancel-in-progress: true`)
>
> — `sad.md §7, abridged` · full text: [sad.md](../sad.md)

> - Repository maintainer — the person, holding the admin or maintain role in the GitHub repository, who sets up the workflow prerequisites (model trust, repository variables, main-branch protection) and owns the agent's rules. NOT the PR author.
>
> — `CONTEXT.md §Glossary, Repository maintainer, verbatim` · full text: [CONTEXT.md](../CONTEXT.md)

> **Chosen:** option 1. The parts that write and that enforce the rules cannot be changed by the pull request they judge. Option 2 only protects main after the fact.
>
> — `adr/0004-take-agent-rules-from-main-and-skip-prs-touching-them.md, Decision outcome, verbatim` · full text: [0004-take-agent-rules-from-main-and-skip-prs-touching-them.md](../adr/0004-take-agent-rules-from-main-and-skip-prs-touching-them.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [events.md](../contracts/events.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Consumes `pull_request` (opened/synchronize/reopened/ready_for_review) and `workflow_dispatch` input `package` ∈ {backend, frontend}.
- Uploads `testable.json` (T1) as artifact `gate`.

— `contracts/events.md, Channel code-host events, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-02 (US-02) — happy

> **Given** a PR author's pull request contains no testable change (every changed file is excluded by the pre-filter)
> **When** the workflow runs
> **Then** no agent run starts, and a stage that uses no model posts a short notice in the agent report that the pull request was skipped because there is no testable change
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-07 (US-05) — authorization

> **Given** a pull request comes from a fork, or targets a branch other than main
> **When** the workflow is triggered
> **Then** the test agent does not run, receives no model access and no privileged trigger runs; the tests check still runs; and the PR author sees in the workflow result (not a pull-request comment) that the agent only serves same-repository pull requests to main (and on-demand backfill runs started by a repository maintainer)
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-11 (US-08) — cross-context

> **Given** an agent run is in progress and the PR author pushes a new commit
> **When** the new commit arrives
> **Then** the older run is cancelled without committing anything, a new run covers the newest commit, the same agent report is updated, and the agent's own commit does not start another agent run
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

### AC-17 (US-09) — authorization

> **Given** someone without the admin or maintain role in the repository tries to start an on-demand backfill run
> **When** the start is requested
> **Then** no agent run starts and no model access is granted, because only a repository maintainer may start a backfill run; the role is checked before any model access
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Triggers + top-level `permissions: {}` + concurrency — `.github/workflows/test-agent.yml`
- [ ] gate job: `contents: read`, `pull-requests: read`; checkout main scripts (`persist-credentials: false`), list PR files via API, read requester role via API for dispatch, run `prefilter.mjs`, upload artifact, expose `decision` output — same file

## Edge cases

| Case | Behaviour |
|---|---|
| two pushes in a row | older run cancelled by concurrency |
| workflow_dispatch by role write | refused in job summary, no later job runs |

## Definition of Done

- [ ] On a test PR the gate outputs `run` for a source change and `skip` for a docs-only change; a fork-style event stops with a summary line
- [ ] every Hard Rule inlined above still holds
- [ ] `npm run typecheck` in both packages and `node --check` on changed scripts are clean
