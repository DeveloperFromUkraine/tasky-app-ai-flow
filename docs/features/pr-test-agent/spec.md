---
status: Draft
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-11"
feature_size: "S"
---

# Spec — pr-test-agent

> **Glossary:** [CONTEXT](./CONTEXT.md)
> **Reference module / docs / channels used:** `docs/architecture-map.md` (reflects `0c72f72`), the assignment brief (kept outside the repository), the project memory note on model-access federation. No extra channels.

## 1. Context

The taskly repository (a web frontend package and a backend service package) has uneven unit-test coverage: the backend is at about 33% of lines and the frontend at about 48% (`docs/architecture-map.md`, Baseline coverage). Nothing stops a pull request from adding untested logic, and the repository has no CI. PR authors write tests by hand, or don't. Reviewers can't see how much of a change the tests actually exercise.

Why now: the recruitment assignment asks for a custom agent with reusable skills and an automated pull-request workflow on GitHub. On every pull request, the workflow analyses the change, creates or updates unit tests when that makes sense, runs them and shows the results on the pull request. It must cover both frontend and backend. Security, reliability and correct, useful results carry the most weight in grading. The deadline is 2026-10-11 20:00.

Committed approach: an agent owned in this repository runs automatically on every same-repository pull request to main and works with **split privileges**. Untrusted pull-request code and the agent's tests run only inside an isolated sandbox that has no credentials, no secrets in its environment, no network access and no repository write rights; the model credential exists only in the agent process outside that sandbox. A separate stage that uses no model checks the agent's output: it must change only allowed test files. Only then does that stage commit to the pull-request branch and update the agent report. A generated test is kept only if it passes on repeated runs and raises diff coverage. All numbers in the report are read from the measured results; the model never writes them. The same agent and skills also run on demand, started by a repository maintainer, over one existing package to backfill missing tests; that backfill run opens an ordinary pull request from its own branch, so the same rules, report, review and tests check apply. Competitive research found no product that does all four of the following: run on every pull request, explain its decision for each file, measure diff coverage, and report a suspected defect instead of locking a bug in with a green test. That combination is the gap this feature targets. The adversarial review's sharpest risk is that code from the pull request runs next to the agent's credentials. The privilege split is the answer to that risk. The success criterion is: every test is green and diff coverage is ≥ the target (for a backfill run: package line coverage rises to the target). When the target is missed, the stable tests that raise coverage are still committed and the agent report says the target was missed.

Traceability:
- Competitive research (2026-10-11): Qodo Cover, Diffblue Cover Pipeline, CodeRabbit unit-test generation, the Claude Code GitHub Action, Meta TestGen-LLM — none combines all four properties above.
- Keep-only-if filter (builds → passes reliably → raises coverage) adopted from Meta TestGen-LLM (arXiv 2402.09171).
- Decision override: GitHub named in §1 — rationale: the assignment mandates GitHub for the repository, pull requests and workflow; it is a constraint, not a design choice.
- Decision override: size stays S after adding US-09 — rationale: backfill reuses the pull-request flow (it opens a pull request), so it adds only a manual trigger, no new module.
- Pre-filter exclusions mirror the existing coverage excludes recorded in `docs/architecture-map.md` (Coverage scope); the single list lives in the glossary under «Testable change».
- Clarify (2026-10-11): open points resolved against the assignment brief (security and reliability weigh most; «create or update tests for changed code»; «verify by running them»).

## 2. Goals

- Every testable change in a pull request leaves with green unit tests that exercise it, without the PR author writing them by hand.
- Reviewers can see, in the pull request itself, what the test agent decided for each file, why, and what the measured result was.
- Existing packages with low coverage can be backfilled with the same agent and skills, reviewed as an ordinary pull request.
- The test agent cannot become a path to repository write access, credential theft or weakened tests, even when the pull request content is hostile.

## 3. Non-goals

- **Fixing production code.** The test agent only reports suspected defects, so a human stays the owner of the product logic and the agent's write surface stays limited to tests.
- **Pull requests from forks.** Model access is granted only to same-repository pull requests to main and to on-demand backfill runs started by a repository maintainer. Fork content is untrusted, and the agent would need credentials to run on it.
- **End-to-end, visual or load tests.** The assignment scope is unit tests, and those layers need running infrastructure the workflow does not have.
- **Replacing human review.** Agent-authored tests land on the pull-request branch and still go through the reviewer before merge.

## 4. User stories

### US-01: Get tests for my change
**As a** PR author
**I want** the test agent to write or update unit tests for the testable changes in my pull request and commit them to my branch
**So that** my change is covered without my writing every test by hand

### US-02: No noise on non-code changes
**As a** PR author
**I want** the test agent to skip pull requests that contain no testable change
**So that** documentation or styling changes don't cost time or money and don't add noise

### US-03: See what the agent did
**As a** reviewer
**I want** one agent report on the pull request that lists the per-file decisions with reasons, the skills used, the test results and the measured diff coverage
**So that** I can decide whether to trust the agent-authored tests

### US-04: Learn about suspected bugs
**As a** reviewer
**I want** suspected defects reported, not locked in by a green test
**So that** a real bug is fixed rather than protected

### US-05: Keep the agent inside its boundary
**As a** repository maintainer
**I want** the test agent to be unable to change anything except allowed test files, and unable to expose credentials
**So that** a hostile or prompt-injected pull request cannot turn the agent against the repository

### US-06: Bounded runs
**As a** repository maintainer
**I want** each agent run to have hard limits on duration and attempts
**So that** cost and feedback time stay predictable

### US-07: Merge safety does not depend on the agent
**As a** PR author
**I want** the merge decision to rest on the deterministic tests check, with the agent check advisory only
**So that** an agent outage never blocks my merge and an agent-authored test never merges untested

### US-08: Updates stay consistent
**As a** PR author
**I want** the agent to re-run on my new commits without looping on its own commits
**So that** the tests and the report always match the latest version of my pull request

### US-09: Backfill existing gaps
**As a** repository maintainer
**I want** to run the same test agent and skills on demand over a chosen package of existing code
**So that** code that already lacks tests gets covered without a separate tool

## 5. Acceptance criteria

### AC-01 (US-01) — happy
**Given** a PR author opens a same-repository pull request to main with a new backend function and a new frontend component and no tests for them
**When** the agent run finishes
**Then** agent-authored tests for both are committed to the pull-request branch, every test passes, diff coverage for each package is at least the target, and the agent report confirms this

### AC-02 (US-02) — happy
**Given** a PR author's pull request contains no testable change (every changed file is excluded by the pre-filter)
**When** the workflow runs
**Then** no agent run starts, and a stage that uses no model posts a short notice in the agent report that the pull request was skipped because there is no testable change

### AC-03 (US-03) — happy
**Given** an agent run has completed
**When** the reviewer opens the pull request
**Then** the reviewer sees a single agent report naming the PR author's head commit it analysed and the agent's own commit (if any) and, for each testable change: the decision (write, update or skip) with a reason, the skills used, the passed and failed counts, and diff coverage per package taken from the measured results

### AC-04 (US-04) — domain invariant: «a failing test is never committed and a test never asserts behaviour the change plainly did not intend»
**Given** the agent's test for a testable change still fails after its fix attempts, and explicit evidence in the code (the PR author's tests, doc comments, types or names) shows the production code behaves differently from what the change intends
**When** the agent run finishes
**Then** that test is not committed in failing form or rewritten to match the wrong behaviour, and the agent report lists a suspected defect with its location and the expected versus actual behaviour

### AC-04b (US-04) — edge
**Given** the agent's test fails and no explicit evidence in the code settles what the change intends (the pull-request title and description are hints only and never override the code)
**When** the agent run finishes
**Then** that test is not committed and the agent report lists the file as «intent unclear»; in a backfill run, where there is no change to compare against, tests pin the current behaviour and the agent report lists any behaviour that looks wrong as an observation, not a suspected defect

### AC-05 (US-05) — domain invariant: «the test agent changes only allowed test files»
**Given** the agent's proposed change touches anything other than allowed test files (production code, shared test setup, shared fixtures, coverage settings, dependencies or workflow definitions) or deletes a test file
**When** the publishing stage checks the change
**Then** nothing from that run is committed, and the agent report says the change was rejected and names the rule it broke

### AC-06 (US-01) — domain invariant: «the PR author's assertions are never rewritten»
**Given** an existing test that the PR author added or changed in this pull request's diff now fails
**When** the agent run finishes
**Then** the agent leaves that test's assertions untouched (it may only add new test cases to that file) and the agent report flags it for the PR author

### AC-06b (US-01) — happy
**Given** an existing test from main, not changed in this pull request, fails because the pull request intentionally changes the tested behaviour, as shown by explicit evidence in the code
**When** the agent run finishes
**Then** the agent updates that test's assertions to the new behaviour, the updated test is committed only if it passes the stability runs, and the agent report records the decision «update» with the reason; without such evidence AC-04 or AC-04b applies instead

### AC-07 (US-05) — authorization
**Given** a pull request comes from a fork, or targets a branch other than main
**When** the workflow is triggered
**Then** the test agent does not run, receives no model access and no privileged trigger runs; the tests check still runs; and the PR author sees in the workflow result (not a pull-request comment) that the agent only serves same-repository pull requests to main (and on-demand backfill runs started by a repository maintainer)

### AC-08 (US-05) — authorization
**Given** test code in the pull request or written by the agent tries to read credentials or repository write rights
**When** that code runs during the agent run
**Then** it finds none, and no credential appears in the agent report or in the run logs

### AC-09 (US-07) — cross-context
**Given** the test agent cannot complete (the model is unavailable, the model workspace spend limit is reached or the time limit is reached)
**When** the workflow finishes
**Then** the agent check shows a neutral (advisory, not completed) result, the merge decision depends only on the tests check, and the agent report states why the run did not complete

### AC-10 (US-07) — cross-context
**Given** the agent has committed agent-authored tests to the pull-request branch
**When** the reviewer looks at the merge status
**Then** the tests check has run on the commit that contains those tests, and merge stays blocked until it passes

### AC-11 (US-08) — cross-context
**Given** an agent run is in progress and the PR author pushes a new commit
**When** the new commit arrives
**Then** the older run is cancelled without committing anything, a new run covers the newest commit, the same agent report is updated, and the agent's own commit does not start another agent run

### AC-12 (US-06) — error
**Given** an agent run reaches its time or attempt limit before every testable change is handled
**When** the run stops
**Then** only tests that already passed their stability runs are committed, and the agent report lists each unfinished file as not completed because a limit was reached

### AC-13 (US-01) — error
**Given** the PR author pushes while the agent run is finishing, so the agent's change no longer applies cleanly to the branch
**When** the publishing stage tries to commit
**Then** nothing is committed, the agent report says the result is outdated, and the next run handles the newest commit

### AC-14 (US-03) — error
**Given** an agent-authored test passes once but fails in one of the repeated stability runs
**When** the agent run finishes
**Then** that test is discarded, and the agent report lists it as unstable instead of counting it as passing

### AC-15 (US-03) — error
**Given** coverage could not be measured for a package
**When** the agent report is written
**Then** the agent report says diff coverage was not measured for that package and gives no estimated number

### AC-16 (US-09) — happy
**Given** a repository maintainer starts the test agent on demand for the backend or the frontend package
**When** the agent run finishes
**Then** agent-authored tests for previously uncovered lines of production code (including uncovered lines in partly covered files) are committed to a new backfill branch and a pull request to main is opened from it, under the same rules as for pull requests (only allowed test files, only stable passing tests); the tests check runs on that pull request but the pull-request agent run does not, and the agent report on that pull request, owned by the backfill run, shows the package coverage before and after

### AC-17 (US-09) — authorization
**Given** someone without the admin or maintain role in the repository tries to start an on-demand backfill run
**When** the start is requested
**Then** no agent run starts and no model access is granted, because only a repository maintainer may start a backfill run; the role is checked before any model access

### AC-18 (US-01) — error
**Given** an agent run handles every testable change within its limits but diff coverage for a package stays below the target
**When** the agent run finishes
**Then** the stable tests that raise coverage are committed, the agent report says the target was missed and lists the uncovered changed lines, the agent check shows a neutral result, and files the agent decided to skip (with their reason in the report) are left out of the diff-coverage denominator

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Agent run wall time (per pull request, or per package for backfill) | ≤ 15 min hard cap; p95 ≤ 10 min | workflow job duration + hard timeout |
| Tests check duration | ≤ 5 min p95 | workflow job duration |
| Fix attempts per test file | ≤ 3 | agent run log, counted per test file |
| Stability runs before keeping a test | 3 consecutive passing runs; any failure discards the test | agent run log |
| Diff coverage target | ≥ 80% of changed lines per package | measured coverage output intersected with the PR diff (backfill: package line coverage before vs after) |
| Cost per agent run (per package for backfill) | ≤ USD 2 (observed; the hard stops are the time cap, the attempt limit and the workspace spend limit) | model workspace usage per run |
| Report fidelity | 100% of numbers come from measured output | publishing stage reads the result files, not model text |
| Concurrent runs per pull request | 1 (newer cancels older) | workflow concurrency group |

## 6.1 Security / privacy

- **Data classification:** internal. Repository source code and test output; the repository is public, but the credentials and write rights involved are confidential.
- **Personal data touched:** none.
- **AuthZ/AuthN impact:** model access is granted per run through short-lived federated identity (no stored long-lived key), and only for same-repository pull requests to main or for an on-demand backfill run started by a repository maintainer (admin or maintain role). The agent's own commits and the backfill pull request start the tests check but never another agent run. Pull-request code and agent-authored tests run only in an isolated sandbox with no credentials of any kind (model, write or read tokens), no secrets in its environment and no network access; the model credential exists only in the agent process outside the sandbox. Only the publishing stage, which uses no model, holds write access, and only to the pull-request branch and its comments, or, for backfill, to a new backfill branch and the pull request it opens from it.
- **Abuse cases:**
  - Prompt injection through the diff, the PR title or body, or code comments, telling the agent to edit production code or reveal secrets → the publishing stage rejects any change outside allowed test files, and credentials are not in the environment the agent can reach.
  - Test code that dumps environment or credentials into output → nothing is there to dump, and the report carries counts and summaries, not raw logs.
  - A pull request that edits the workflow or agent configuration to widen its own privileges → open question for design (§8). The pull request must not be able to change the rules that govern its own run.
  - Weakening tests to get green (global mocks, threshold or exclusion changes, rewritten author assertions) → rejected by the allowed-files rule and the author-assertion rule.
  - Cost exhaustion through frequent pushes or huge diffs → the pre-filter, a single concurrent run per pull request, and hard time and attempt limits.
- **Security review:** Required. A new automation identity with repository write rights and model access.

## 7. Metrics / KPIs

- **Diff coverage of testable changes on agent-handled pull requests** — baseline: 0 (no agent today), target: ≥ 80% per package on the demo pull request by 2026-10-11.
- **Agent run completion rate** — baseline: 0, target: ≥ 90% of triggered runs complete within limits (measured over the demo and test pull requests).
- **Boundary violations committed** — baseline: n/a, target: 0 agent commits touching anything other than allowed test files, and 0 credentials in reports or logs.
- **Package line coverage after backfill** — baseline: backend 33.0%, frontend 47.7% (`docs/architecture-map.md`), target: ≥ 70% each by 2026-10-11 (may be reached over several backfill runs).
- **Tests check pass rate on main after agent-authored tests merge** — baseline: n/a, target: 100% (no flaky agent-authored test reaches main).

## 8. Open questions

- [ ] How do we stop a pull request from changing the workflow, agent definition or skills that govern its own run (code-owner review on those paths, pinning the federation rule to a specific workflow, running the privileged stage from the base branch)? Default now: require code-owner review on the agent and workflow paths, and do the publishing in a stage that takes its definition from main. — owner: Repository maintainer, due: before `sdd:design` closes
- [ ] Which main-branch protection settings apply (tests check required, stale approvals dismissed after an agent push)? Default now: tests check required; stale approvals not dismissed. — owner: Repository maintainer, due: before `sdd:ship`
