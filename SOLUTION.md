# Unit test agent and agentic PR workflow

A custom agent with reusable skills writes and updates unit tests for this repository, both on demand (backfill) and automatically for every pull request into `main`. It runs **Claude Code** headless in GitHub Actions; deterministic scripts around it run the tests, measure coverage, enforce the rules and publish the result to the pull request.

**Results so far**

| | Backend | Frontend |
|---|---|---|
| Line coverage before the agent | 33% | 47.7% |
| Now on `main` (agent pull requests: backend #10, #21, #22, #28 · frontend #16, #18, #20, #22, #26) | **97.6% (123/126 lines)** | **82.5% (132/160 lines)** |

Demo pull request with a new full-stack feature: **#22** (see [Example run](#example-run)).

---

## Main technical decisions

The full design is in [`docs/features/pr-test-agent/`](docs/features/pr-test-agent/) (spec, architecture document, contracts, ADRs). The decisions that shape everything:

1. **Claude Code CLI, headless, with the agent and skills kept in the repository** ([ADR-0001](docs/features/pr-test-agent/adr/0001-run-claude-code-cli-headless-with-repo-agent-and-skills.md)). Agent definition and skills are plain Markdown under `.claude/`, reviewed like code, usable locally the same way as in CI. No custom agent framework to maintain.

2. **Privilege split: the model never holds write access** ([ADR-0002](docs/features/pr-test-agent/adr/0002-split-unprivileged-agent-and-verify-from-workflow-run-publish.md)). The pull request's code and the model run in an unprivileged workflow (`test-agent.yml`: gate → agent → verify) that can write nothing. A separate privileged workflow (`test-agent-publish.yml`, started by `workflow_run`, so it always runs main's definition) uses no model, runs no pull-request code, re-checks every artifact and only then commits and comments.

3. **A GitHub App is the only write identity** ([ADR-0003](docs/features/pr-test-agent/adr/0003-publish-with-github-app-installation-token.md)). A short-lived installation token, minted only in publish, in an environment restricted to `main`. Unlike `GITHUB_TOKEN`, its commits re-run the required `tests` checks.

4. **The agent's rules always come from `main`** ([ADR-0004](docs/features/pr-test-agent/adr/0004-take-agent-rules-from-main-and-skip-prs-touching-them.md)). Agent, skills, Claude settings and scripts are checked out from main; a pull request that changes `.github/`, `.claude/`, `.test-agent/`, `CLAUDE.md` or `.mcp.json` is skipped (it gets the normal tests and code-owner review), so a PR cannot rewrite the rules it is judged by.

5. **No stored model credential.** The agent job exchanges its GitHub OIDC token for a ~10-minute Anthropic token (workload identity federation). The rule only matches this repository's pull requests into `main` and backfill runs on `main`.

6. **Untrusted code runs only in a sandbox.** Dependency install (`npm ci --ignore-scripts`), lifecycle scripts, the agent's test runs, verify and the baseline all run in `docker run --network none --read-only`, empty environment, the working copy mounted read-only (only `node_modules`, `coverage` and the Prisma output are writable). The model's own process gets an allowlisted environment and may only read the repo, edit allowed test files and run one command: the test runner.

7. **Nothing the model says is trusted as a fact.** Pass/fail counts, coverage and stability come from the verify job; the patch is checked against the diff **git** regenerates after applying it (not the patch text), so forged patches cannot smuggle other files; publish derives the PR, mode and actor from GitHub's own run data, not from artifacts.

8. **Tests are held to the repository's required checks.** A test file is kept only if it passes **3 vitest runs in a row**, `tsc --noEmit` and (frontend) `prettier --check` — the same checks the required `tests` workflow runs — so an agent commit can never turn the required check red.

9. **The agent check is advisory.** `test-agent` ends `success` or `neutral`, never `failure`; merging depends only on `tests (…)`.

---

## How to run it

### Prerequisites (one-time, by a maintainer)

Step by step in [`docs/test-agent-setup.md`](docs/test-agent-setup.md):

1. **Anthropic workload identity federation**: a service account in a dedicated workspace (with its own spend limit) and two federation rules (pull requests into main; manual runs on main). Repository variables `ANTHROPIC_ORGANIZATION_ID`, `ANTHROPIC_SERVICE_ACCOUNT_ID`, `ANTHROPIC_WORKSPACE_ID`, `ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_BACKFILL_FEDERATION_RULE_ID`.
2. **GitHub App** with Contents, Pull requests and Checks (read & write), installed on this repository; private key and App ID in the environment `test-agent-publish` (deployment branch: `main`); repository variable `TEST_AGENT_BOT_LOGIN`.
3. **Branch protection on `main`**: required checks `tests (backend)`, `tests (frontend)`, `tests (agent scripts)`; code-owner review for `.github/` and `.claude/`.

### Pull requests (automatic)

Open or update a pull request into `main` that changes `backend/src/**` or `frontend/src/**`. Within ~5–10 minutes the pull request gets:

- a commit by `taskly-test-agent[bot]` with the new or updated tests (only tests that passed every check);
- one comment, **Test agent report**, updated on every run: per-file decisions and reasons, skills used, tests passed/failed and diff coverage per package, uncovered changed lines, discarded tests and why;
- a `test-agent` check; its details show the model run (turns, estimated cost, permission denials).

The agent's own commit does not start another agent run.

### Backfill (manual)

Actions → **test-agent** → **Run workflow** on `main`, package `backend` or `frontend` (maintainers only). The App opens a pull request with tests for the whole package and the coverage before → after. A run is limited to ~9 minutes of agent time; for a large package, run it again: files covered by the previous run are skipped as `covered` and the next run continues.

### Locally

The agent is a normal Claude Code subagent: from the repository root, `claude --agent test-agent` (or ask Claude Code to use it) with the same skills.

---

## Where the agent and skills are defined

| What | Where | Used for |
|---|---|---|
| Agent | [`.claude/agents/test-agent.md`](.claude/agents/test-agent.md) | Role, inputs/outputs, the working loop, hard rules |
| Skill `analyze-changes` | [`.claude/skills/analyze-changes/SKILL.md`](.claude/skills/analyze-changes/SKILL.md) | Per file: `write`, `update` or `skip` (only `no_logic` / `covered` / `generated`); what the change intends, from evidence (author tests > doc comments > types/names); suspected defect vs unclear intent |
| Skill `backend-unit-tests` | [`.claude/skills/backend-unit-tests/SKILL.md`](.claude/skills/backend-unit-tests/SKILL.md) | Vitest conventions for Express 5 / Prisma 7 / Zod: Supertest for routes, mocked Prisma delegates, fixtures |
| Skill `frontend-unit-tests` | [`.claude/skills/frontend-unit-tests/SKILL.md`](.claude/skills/frontend-unit-tests/SKILL.md) | Vitest + Testing Library for React 19 / TanStack Query / styled-components: colocated tests, design-system mocks, query client setup, prettier style |
| Skill `test-report` | [`.claude/skills/test-report/SKILL.md`](.claude/skills/test-report/SKILL.md) | The `decisions.json` contract, rewritten after every file so a timeout still leaves a valid report |
| Claude settings | [`.github/test-agent/claude-settings.json`](.github/test-agent/claude-settings.json) | Tool allowlist: read; edit only allowed test files and the report; Bash only the test runner |
| Workflows | [`.github/workflows/test-agent.yml`](.github/workflows/test-agent.yml), [`test-agent-publish.yml`](.github/workflows/test-agent-publish.yml), [`tests.yml`](.github/workflows/tests.yml) | gate → agent → verify; publish; required tests |
| Scripts | [`.github/scripts/`](.github/scripts/) | `prefilter` (gate), `sandbox`, `baseline`, `run-tests` (the agent's only tool to execute code), `finalize-agent`, `verify` + `stability` + `diff-coverage`, `check-patch`, `artifacts` (schemas), `report`, `publish`. Self-tests: `node --test .github/scripts/*.test.mjs` (130 tests, run as the required `tests (agent scripts)`) |

**During a run:** the gate lists the testable files and stops what must not run (forks, other bases, bot commits, rule changes). The agent job copies the rules and the test runner from main, installs dependencies in the sandbox, runs the existing tests once (`baseline-failures.json`: tests the change already broke), then starts Claude Code with `--agent test-agent`. The agent loads `analyze-changes`, decides per file, loads `backend-unit-tests` / `frontend-unit-tests`, writes tests, runs each through `run-tests.mjs` (vitest + typecheck + prettier, at most 1 run + 3 fixes per file), and records everything with `test-report`. Verify re-runs every touched test 3 times, applies the static checks, measures coverage and writes `results.json`. Publish validates all artifacts, re-checks the patch through git and commits.

---

## Example run

**Pull request #22 — "Task summary: open, overdue, due soon and done counts".** A new feature in both packages, deliberately without tests: `GET /todos/stats` (backend), a `TodoStats` badge bar with its query hook, API method and cache invalidation in the three mutation hooks (frontend). The change also breaks an existing test from main: `TodosPage.test.tsx` now renders `TodoStats` without a query client.

**Run 1** on `7ef020d` (26 model turns, ~$0.16). Skills used: `analyze-changes`, `backend-unit-tests`, `frontend-unit-tests`, `test-report`. Decisions:

| File | Decision | Reason (abridged) |
|---|---|---|
| `backend/src/features/todos/stats.ts` | write | New `todoStats`; mixed and empty lists |
| `backend/src/features/todos/router.ts` | write | New `GET /stats` before `/:id`, via Supertest with a fixed date |
| `frontend/.../TodoStats.tsx` | write | Conditional rendering: no data, zero total, due-soon badge |
| `frontend/.../useTodoStatsQuery.ts`, `api/todos.ts` | write | Fetches stats with an abort signal |
| `frontend/.../useCreate/Update/DeleteTodoMutation.ts` | write | Now invalidate the stats query; asserted |
| `frontend/.../api/queryKeys.ts` | skip (`no_logic`) | Constant key |
| `frontend/.../TodosPage.tsx` | skip (`no_logic`) | Only mounts `TodoStats` |

Results: backend 90 tests passed, diff coverage **100% (3/3)**; frontend 48 passed, **1 failed** — the existing `TodosPage.test.tsx` the change broke, which the agent had not looked at. The required `tests (frontend)` stayed red. *That gap led to the baseline step*: the agent now gets the list of tests that already fail on the head before it starts.

**Run 2** on `8b25a28` (19 turns, ~$0.12, no permission denials). Log:

```
baseline: 1 failing test file(s): frontend/src/features/todos/TodosPage.test.tsx
claude: subtype=success turns=19 cost_usd=0.12 denials=0
decisions.json: valid
completed
kept 1, unstable 0
```

The agent decided **`update`** for `TodosPage.tsx`: *"TodosPage now renders TodoStats, which needs a QueryClient; the existing test failed with 'No QueryClient set'. Mocked TodoStats in the test, assertions unchanged."* (one added line), and skipped the rest as `covered` by run 1. Verify: backend 90 / frontend 49 passed, 0 failed. All checks green on the agent commit: `tests (backend)`, `tests (frontend)`, `tests (agent scripts)`, `test-agent`.

---

## Assumptions

- Unit tests mean Vitest tests that run without network or a database: Prisma is mocked in the backend, the HTTP layer in the frontend. Integration and end-to-end tests are out of scope.
- Allowed test locations follow the repository's conventions: `backend/tests/**/*.test.ts`, `frontend/src/**/*.test.ts(x)`. The agent never edits production code, shared fixtures, setup or configuration.
- Intent comes from evidence in the repository (author tests, doc comments, types, names). When the code contradicts that evidence, the agent reports a *suspected defect* instead of writing a test that blesses the bug; the PR author decides.
- Tests the PR author changed in the pull request are theirs: the agent may only add lines to them, never change or delete their assertions (enforced by the patch check).
- Same-repository pull requests into `main` only. Forks get the normal tests check.
- Diff coverage target: 80% of changed lines per package (advisory; for backfill, package line coverage).

## Limitations

- **Model judgement is not deterministic.** The deterministic checks guarantee *safety* (what may be committed) and *correctness of what is committed* (passes vitest ×3, tsc, prettier), not the *usefulness* of every test. Reasons in the report can be imprecise (e.g. calling tests the agent wrote in an earlier run "the author's").
- **Time-boxed.** The agent gets ~9 minutes per run. Large backfills take several runs; the report lists unfinished files honestly.
- **Unit level only.** No database, network or browser; behaviour that only shows up end to end is not covered.
- **Rule changes are not self-tested.** A pull request that touches `.github/`, `.claude/` or `.test-agent/` gets no agent run, by design (ADR-0004).
- **Agent commits stay reviewable, not reviewed.** The App commits to the PR branch; a human still approves the pull request. Whether an agent push should dismiss existing approvals is an open question (spec §8).
- **Cost visibility.** The per-run cost in the check is Claude Code's estimate; the Anthropic Console shows the billed cost per workspace with a delay.
- **Single runtime.** Docker on GitHub-hosted Ubuntu runners; the sandbox is a container, not a VM.

## What I would change for production

- **Stronger isolation**: run untrusted code in a microVM or gVisor instead of a container, and fetch dependencies through an allowlisted registry proxy.
- **Speed and cost**: cache `node_modules` per lockfile hash, run packages in parallel, and give large backfills a work queue instead of re-runs.
- **Test quality gate**: mutation testing (e.g. Stryker) on the agent's tests, so a test that asserts nothing useful is discarded like an unstable one.
- **Review flow**: a required reviewer for agent commits or an explicit "accept agent tests" label; a decision on dismissing stale approvals.
- **Observability**: export run metrics (turns, cost, kept/discarded tests, coverage delta, denials) to a dashboard and alert on spend and on falling acceptance.
- **Upgrades**: pin and auto-update Claude Code, the model and the sandbox image through Renovate with the agent scripts' self-tests as the gate.
- **Scope**: integration tests against a disposable database, and support for more packages without changing the agent.
