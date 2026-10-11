---
id: T2
title: "Implement the patch rule check and secret scan"
layer: "domain"
deps: []
blocks: ["T12"]
acs: ["AC-05", "AC-06", "AC-08"]
files_hint: [".github/scripts/check-patch.mjs", ".github/scripts/check-patch.test.mjs"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or contradicts the code in front of you, open the named file for the full text and follow that. Do not invent the missing part. -->

# T2 — Implement the patch rule check and secret scan

## Place in the sequence

- **Blocked by:** — · **Blocks:** T12 — Implement the publish orchestration script · **Wave:** 1.
- **Lane:** own lane.

## Why (user story)

> **As a** repository maintainer
> **I want** the test agent to be unable to change anything except allowed test files, and unable to expose credentials
> **So that** a hostile or prompt-injected pull request cannot turn the agent against the repository
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

Gives the publish stage a deterministic verdict that the agent changed only allowed test files and leaked nothing.

## Inlined context

> - Allowed test files — the only files the test agent may create or modify: `backend/tests/**/*.test.ts` and `frontend/src/**/*.test.{ts,tsx}`; it never deletes a test file, and existing assertions follow the PR-author and main-branch rules (spec AC-06, AC-06b). NOT shared test setup, fixtures, mocks or helpers (e.g. `backend/tests/fixture.ts`, `frontend/src/test/**`, `frontend/src/design-system/mocks.tsx`).
>
> — `CONTEXT.md §Glossary, Allowed test files, verbatim` · full text: [CONTEXT.md](../CONTEXT.md)

> | Credentials | OIDC → Anthropic token minted in the agent job only; Claude process gets an allowlisted env (no `GITHUB_TOKEN`; `ACTIONS_*` only if the federated auth must refresh, settled at `implement` per §11); `persist-credentials: false` on every checkout; App token only in publish; publish scans the patch and all model text for secret patterns and rejects the run on any hit | ADR-0002, ADR-0003 |
>
> — `sad.md §8, Credentials, verbatim` · full text: [sad.md](../sad.md)

> patch or model text matches a secret pattern
>
> — `sad.md §6 flow 4, alt branch, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [events.md](../contracts/events.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Input: `agent.patch` (unified diff vs `head_sha`), `author_test_files` from `test_agent.gate.v1`, all model text from `test_agent.decisions.v1`.
- Verdict codes: `test_agent.path_not_allowed`, `test_agent.test_file_deleted`, `test_agent.author_assertion_changed`, `test_agent.secret_detected`, or ok.

— `contracts/events.md, test_agent.patch.v1 + Publish outcomes, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-05 (US-05) — domain invariant: «the test agent changes only allowed test files»

> **Given** the agent's proposed change touches anything other than allowed test files (production code, shared test setup, shared fixtures, coverage settings, dependencies or workflow definitions) or deletes a test file
> **When** the publishing stage checks the change
> **Then** nothing from that run is committed, and the agent report says the change was rejected and names the rule it broke
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-06 (US-01) — domain invariant: «the PR author's assertions are never rewritten»

> **Given** an existing test that the PR author added or changed in this pull request's diff now fails
> **When** the agent run finishes
> **Then** the agent leaves that test's assertions untouched (it may only add new test cases to that file) and the agent report flags it for the PR author
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-08 (US-05) — authorization

> **Given** test code in the pull request or written by the agent tries to read credentials or repository write rights
> **When** that code runs during the agent run
> **Then** it finds none, and no credential appears in the agent report or in the run logs
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Parse unified diff into files + hunks (added/removed lines, rename/delete/binary markers) — `.github/scripts/check-patch.mjs`
- [ ] Rules: path matches allowed globs; no deletion or rename-away; files in `author_test_files` have no removed lines — same file
- [ ] Secret scan over patch added lines and given strings (token prefixes like `sk-ant-`, `ghs_`, `ghp_`, `github_pat_`, JWT shape, PEM header, `ACTIONS_ID_TOKEN`) — same file
- [ ] Return first violation `{code, path, rule}`; CLI exits non-zero with JSON — same file
- [ ] Self-check `node --test` — `.github/scripts/check-patch.test.mjs`

## Edge cases

| Case | Behaviour |
|---|---|
| patch edits `backend/src/x.ts` | `test_agent.path_not_allowed` |
| patch edits `backend/tests/fixture.ts` | `test_agent.path_not_allowed` (shared fixture) |
| patch deletes a test file | `test_agent.test_file_deleted` |
| author test file gets a changed line | `test_agent.author_assertion_changed` |
| author test file gets only added lines | ok |
| main test file assertion changed | ok (AC-06b) |
| binary diff | rejected as `test_agent.path_not_allowed` |
| decision reason contains a token-shaped string | `test_agent.secret_detected` |

## Definition of Done

- [ ] `node --test .github/scripts/check-patch.test.mjs` passes for every edge case
- [ ] every Hard Rule inlined above still holds
- [ ] `npm run typecheck` in both packages and `node --check` on changed scripts are clean
