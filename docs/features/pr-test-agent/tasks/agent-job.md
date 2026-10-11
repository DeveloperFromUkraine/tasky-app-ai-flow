---
id: T10
title: "Add the agent job: federated model access and a locked-down Claude run"
layer: "wiring"
deps: ["T9", "T4", "T7"]
blocks: ["T11"]
acs: ["AC-01", "AC-08", "AC-09", "AC-12"]
files_hint: [".github/workflows/test-agent.yml", ".github/scripts/agent-env.mjs"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or contradicts the code in front of you, open the named file for the full text and follow that. Do not invent the missing part. -->

# T10 — Add the agent job: federated model access and a locked-down Claude run

## Place in the sequence

- **Blocked by:** T9 — Create the agent workflow with triggers, concurrency and the gate job, T4 — Implement the sandbox wrapper and stability runner, T7 — Write the test agent definition and its four skills · **Blocks:** T11 — Add the verify job: stability runs and measured coverage · **Wave:** 3.
- **Lane:** shares `.github/workflows/test-agent.yml` with T9, T11 — serialized.

## Why (user story)

> **As a** PR author
> **I want** the test agent to write or update unit tests for the testable changes in my pull request and commit them to my branch
> **So that** my change is covered without my writing every test by hand
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** repository maintainer
> **I want** the test agent to be unable to change anything except allowed test files, and unable to expose credentials
> **So that** a hostile or prompt-injected pull request cannot turn the agent against the repository
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

> **As a** repository maintainer
> **I want** each agent run to have hard limits on duration and attempts
> **So that** cost and feedback time stay predictable
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

Runs the agent with model access while keeping every credential away from untrusted code.

## Inlined context

> | Credentials | OIDC → Anthropic token minted in the agent job only; Claude process gets an allowlisted env (no `GITHUB_TOKEN`; `ACTIONS_*` only if the federated auth must refresh, settled at `implement` per §11); `persist-credentials: false` on every checkout; App token only in publish; publish scans the patch and all model text for secret patterns and rejects the run on any hit | ADR-0002, ADR-0003 |
>
> — `sad.md §8, Credentials, verbatim` · full text: [sad.md](../sad.md)

> | Agent tool allowlist | Read, Glob, Grep only inside the workspace (denied for `/proc`, `$HOME`, `$RUNNER_TEMP`); Edit/Write only on allowed test files; Bash only for the sandbox wrapper; no web tools | ADR-0001 |
>
> — `sad.md §8, Agent tool allowlist, verbatim` · full text: [sad.md](../sad.md)

> | Limits | Whole agent run ≤ 15 min split per §7 time budget; `claude` step timeout 9 min with partial results always uploaded; ≤ 3 fix attempts per test file (agent instructions + Claude `--max-turns`); stability = 3 consecutive passing runs | spec §6 |
>
> — `sad.md §8, Limits, verbatim` · full text: [sad.md](../sad.md)

> | Claude Code headless auth through Anthropic workload identity federation may need a specific token-exchange step, and may need the job's OIDC request variables to refresh | Medium | Verify the exchange mechanism first at `implement`; prefer a one-shot exchange before the `claude` step so `ACTIONS_*` can be dropped from its env | Repository maintainer |
>
> — `sad.md §11, auth risk row, verbatim` · full text: [sad.md](../sad.md)

> **Chosen:** option 1. It reuses the repository's agent and skills unchanged and keeps write rights out of the model-using job, which option 2 works against. It needs less code than option 3.
>
> — `adr/0001-run-claude-code-cli-headless-with-repo-agent-and-skills.md, Decision outcome, verbatim` · full text: [0001-run-claude-code-cli-headless-with-repo-agent-and-skills.md](../adr/0001-run-claude-code-cli-headless-with-repo-agent-and-skills.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [events.md](../contracts/events.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Downloads `gate`; uploads `agent.patch` + `decisions.json` as artifact `agent` with `if: always()`.

— `contracts/events.md, test_agent.patch.v1 + decisions.v1, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-01 (US-01) — happy

> **Given** a PR author opens a same-repository pull request to main with a new backend function and a new frontend component and no tests for them
> **When** the agent run finishes
> **Then** agent-authored tests for both are committed to the pull-request branch, every test passes, diff coverage for each package is at least the target, and the agent report confirms this
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-08 (US-05) — authorization

> **Given** test code in the pull request or written by the agent tries to read credentials or repository write rights
> **When** that code runs during the agent run
> **Then** it finds none, and no credential appears in the agent report or in the run logs
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

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

## Checklist

- [ ] Spike first: confirm how Claude Code CLI authenticates with Anthropic workload identity federation (repo variables `ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_ORGANIZATION_ID`, `ANTHROPIC_SERVICE_ACCOUNT_ID`, `ANTHROPIC_WORKSPACE_ID`); record the finding in sad §11
- [ ] Job `permissions: contents: read, id-token: write`, `timeout-minutes` per §7 budget; checkout PR head without credentials; checkout main `.claude/` + scripts into a separate dir — `.github/workflows/test-agent.yml`
- [ ] `npm ci --ignore-scripts` per package, then `npm rebuild` + `prisma generate` via `sandbox.mjs` — same file
- [ ] Exchange OIDC for the model credential in one step; `agent-env.mjs` builds the allowlisted env for the `claude` step (drops `GITHUB_TOKEN`, runner tokens) — `.github/scripts/agent-env.mjs`
- [ ] `claude -p` with the agent, `--allowedTools` / deny rules per §8, `--max-turns`, step `timeout-minutes: 9`; always upload patch + decisions — workflow

## Edge cases

| Case | Behaviour |
|---|---|
| model unavailable / spend limit | `decisions.completed=false`, reason set, artifact still uploaded |
| step timeout | partial patch uploaded with `if: always()` |
| test code prints env inside sandbox | no credentials present |

## Definition of Done

- [ ] On a test PR the job uploads a patch and a valid decisions.json; `env` printed from a sandboxed test shows no `ACTIONS_*`, `GITHUB_TOKEN` or model credential
- [ ] every Hard Rule inlined above still holds
- [ ] `npm run typecheck` in both packages and `node --check` on changed scripts are clean
