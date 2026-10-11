---
id: T12
title: "Implement the publish orchestration script"
layer: "app"
deps: ["T2", "T5", "T6"]
blocks: ["T13"]
acs: ["AC-05", "AC-09", "AC-11", "AC-13", "AC-16"]
files_hint: [".github/scripts/publish.mjs", ".github/scripts/publish.test.mjs"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or contradicts the code in front of you, open the named file for the full text and follow that. Do not invent the missing part. -->

# T12 — Implement the publish orchestration script

## Place in the sequence

- **Blocked by:** T2 — Implement the patch rule check and secret scan, T5 — Implement artifact schema validators, T6 — Render the agent report, outcome code and check conclusion · **Blocks:** T13 — Add the workflow_run publish workflow with the App token · **Wave:** 3.
- **Lane:** own lane.

## Why (user story)

> **As a** repository maintainer
> **I want** the test agent to be unable to change anything except allowed test files, and unable to expose credentials
> **So that** a hostile or prompt-injected pull request cannot turn the agent against the repository
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

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

Applies every trust check and is the only code that writes to the repository.

## Inlined context

> | Errors | Any failure in agent or verify → publish still runs and posts a «not completed» report with the reason; publish does nothing when the triggering run was `cancelled` or when its head commit is no longer the pull request's head (report, check and commit alike) | spec AC-09, AC-11, AC-13 |
>
> — `sad.md §8, Errors, verbatim` · full text: [sad.md](../sad.md)

> 4. **Rules come from main; a pull request cannot change the rules of its own run** ([ADR-0004](adr/0004-take-agent-rules-from-main-and-skip-prs-touching-them.md)). Publish scripts, the allowlist and the publish workflow are always main's (by construction of `workflow_run`). The agent job loads the agent definition and skills from a main checkout. Pull requests touching `.github/` or `.claude/` get no agent run (the report says why), and CODEOWNERS requires the maintainer's review on those paths. Because `test-agent.yml` itself comes from the pull request, publish enforces this rule independently: it lists the pull request's changed files through the API, and if any is under `.github/` or `.claude/` it treats every artifact of the run as forged and posts only the skip notice. Without such paths the run's workflow equals main's, so its artifacts are trusted to that degree. This resolves spec §8 open question 1.
>
> — `sad.md §4, choice 4, verbatim` · full text: [sad.md](../sad.md)

> **Chosen:** option 1. Its pushes trigger the tests check normally, and its commits carry a bot identity the gate can recognise. The token lives for one job and is scoped to one repository.
>
> — `adr/0003-publish-with-github-app-installation-token.md, Decision outcome, verbatim` · full text: [0003-publish-with-github-app-installation-token.md](../adr/0003-publish-with-github-app-installation-token.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [events.md](../contracts/events.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Reads artifacts `gate`, `agent`, `verify` of the triggering run; returns one Publish outcome code; writes commit / backfill branch + PR / report comment / check run as in events.md Code-host outputs.
- Idempotency: act on (`pr_number`, `head_sha`) once; commit only if branch head still equals `head_sha`.

— `contracts/events.md, Code-host outputs + Publish outcomes + Idempotency, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-05 (US-05) — domain invariant: «the test agent changes only allowed test files»

> **Given** the agent's proposed change touches anything other than allowed test files (production code, shared test setup, shared fixtures, coverage settings, dependencies or workflow definitions) or deletes a test file
> **When** the publishing stage checks the change
> **Then** nothing from that run is committed, and the agent report says the change was rejected and names the rule it broke
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-09 (US-07) — cross-context

> **Given** the test agent cannot complete (the model is unavailable, the model workspace spend limit is reached or the time limit is reached)
> **When** the workflow finishes
> **Then** the agent check shows a neutral (advisory, not completed) result, the merge decision depends only on the tests check, and the agent report states why the run did not complete
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

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

## Checklist

- [ ] `publish({run, gh, fs})` with an injected GitHub client: cancelled → no-op; resolve PR + current head; rule-path check from API files; validate artifacts; `check-patch`; head moved → outdated — `.github/scripts/publish.mjs`
- [ ] Commit `agent.filtered.patch` via the git data API as the App (or create backfill branch + PR) — same file
- [ ] Upsert report by marker, create check run — same file
- [ ] Self-check with a fake client for every outcome code — `.github/scripts/publish.test.mjs`

## Edge cases

| Case | Behaviour |
|---|---|
| triggering run cancelled | no write at all |
| head moved | `test_agent.outdated`, nothing committed |
| PR touches `.claude/` | skip notice only, artifacts ignored |
| artifacts missing (agent job crashed) | `test_agent.not_completed` |
| report comment exists | updated in place, not duplicated |

## Definition of Done

- [ ] `node --test .github/scripts/publish.test.mjs` passes for every Publish outcome code
- [ ] every Hard Rule inlined above still holds
- [ ] `npm run typecheck` in both packages and `node --check` on changed scripts are clean
