---
id: T4
title: "Implement the sandbox wrapper and stability runner"
layer: "infra"
deps: []
blocks: ["T10", "T11"]
acs: ["AC-08", "AC-14"]
files_hint: [".github/scripts/sandbox.mjs", ".github/scripts/stability.mjs", ".github/scripts/stability.test.mjs"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or contradicts the code in front of you, open the named file for the full text and follow that. Do not invent the missing part. -->

# T4 — Implement the sandbox wrapper and stability runner

## Place in the sequence

- **Blocked by:** — · **Blocks:** T10 — Add the agent job: federated model access and a locked-down Claude run, T11 — Add the verify job: stability runs and measured coverage · **Wave:** 1.
- **Lane:** own lane.

## Why (user story)

> **As a** repository maintainer
> **I want** the test agent to be unable to change anything except allowed test files, and unable to expose credentials
> **So that** a hostile or prompt-injected pull request cannot turn the agent against the repository
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

> **As a** reviewer
> **I want** one agent report on the pull request that lists the per-file decisions with reasons, the skills used, the test results and the measured diff coverage
> **So that** I can decide whether to trust the agent-authored tests
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

Runs every piece of untrusted code with no network, environment or credentials, and keeps only tests that pass 3 runs in a row.

## Inlined context

> - Sandbox — the isolated container in which all untrusted code runs (pull-request code, agent-authored tests, package lifecycle scripts), with no network, no environment variables and no credentials. NOT the agent job as a whole (the agent process itself runs outside the sandbox and holds the model credential).
>
> — `CONTEXT.md §Glossary, Sandbox, verbatim` · full text: [CONTEXT.md](../CONTEXT.md)

> | Sandboxing | Dependencies fetched with `npm ci --ignore-scripts` (network, no pull-request code runs); lifecycle steps (`npm rebuild`, `prisma generate`) and all tests through `sandbox.mjs`: `docker run --rm --network none`, empty environment, only the working copy mounted | ADR-0002 |
>
> — `sad.md §8, Sandboxing, verbatim` · full text: [sad.md](../sad.md)

> | Stability runs before keeping a test | 3 consecutive passing runs; any failure discards the test | agent run log |
>
> — `spec.md §6, NFR Stability runs, verbatim` · full text: [spec.md](../spec.md)

> **Chosen:** option 1. Numbers come from a job the model never controls, and the only job with write rights is defined on main by construction of `workflow_run`, so a pull request cannot change it. Option 2 does not work: a job running for a pull-request ref is refused by an environment restricted to main, and loosening that restriction would expose the App key to a file the pull request can edit. Option 3 runs from main too, but it is the trigger that most often ends up checking out pull-request code with write rights; `workflow_run` keeps the writer free of pull-request code by design and only receives artifacts, which publish validates (ADR-0004).
>
> — `adr/0002-split-unprivileged-agent-and-verify-from-workflow-run-publish.md, Decision outcome, verbatim` · full text: [0002-split-unprivileged-agent-and-verify-from-workflow-run-publish.md](../adr/0002-split-unprivileged-agent-and-verify-from-workflow-run-publish.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [events.md](../contracts/events.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- `stability.mjs` writes `results.kept_test_files`, `results.unstable_test_files[{path, failed_run}]` and `agent.filtered.patch` (`agent.patch` minus unstable files).

— `contracts/events.md, test_agent.results.v1, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-08 (US-05) — authorization

> **Given** test code in the pull request or written by the agent tries to read credentials or repository write rights
> **When** that code runs during the agent run
> **Then** it finds none, and no credential appears in the agent report or in the run logs
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-14 (US-03) — error

> **Given** an agent-authored test passes once but fails in one of the repeated stability runs
> **When** the agent run finishes
> **Then** that test is discarded, and the agent report lists it as unstable instead of counting it as passing
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `sandbox.mjs <workdir> -- <cmd...>`: `docker run --rm --network none --env-file /dev/null -v <workdir>:/w -w /w node:22` (pinned digest), returns exit code + output; `--network bridge` only for an explicit `--fetch` mode never used for PR code — `.github/scripts/sandbox.mjs`
- [ ] Self-check: sandboxed `env` prints no runner variables and `node -e fetch(...)` fails — `.github/scripts/stability.test.mjs`
- [ ] `stability.mjs`: for each agent-touched test file run vitest for that file 3 times via sandbox, record first failing run, write filtered patch — `.github/scripts/stability.mjs`

## Edge cases

| Case | Behaviour |
|---|---|
| test passes runs 1 and 2, fails 3 | unstable, `failed_run: 3`, removed from filtered patch |
| test reads `process.env` | sees only image defaults, no runner or credential variables |
| test opens a network socket | fails, no network |
| docker missing | script exits non-zero with a clear message, run reported not completed |

## Definition of Done

- [ ] `node --test .github/scripts/stability.test.mjs` passes on a machine with Docker, including the no-env and no-network checks
- [ ] every Hard Rule inlined above still holds
- [ ] `npm run typecheck` in both packages and `node --check` on changed scripts are clean
