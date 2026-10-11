---
id: T7
title: "Write the test agent definition and its four skills"
layer: "app"
deps: []
blocks: ["T10"]
acs: ["AC-01", "AC-04", "AC-04b", "AC-06", "AC-06b", "AC-12"]
files_hint: [".claude/agents/test-agent.md", ".claude/skills/analyze-changes/SKILL.md", ".claude/skills/backend-unit-tests/SKILL.md", ".claude/skills/frontend-unit-tests/SKILL.md", ".claude/skills/test-report/SKILL.md"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or contradicts the code in front of you, open the named file for the full text and follow that. Do not invent the missing part. -->

# T7 — Write the test agent definition and its four skills

## Place in the sequence

- **Blocked by:** — · **Blocks:** T10 — Add the agent job: federated model access and a locked-down Claude run · **Wave:** 1.
- **Lane:** own lane.

## Why (user story)

> **As a** PR author
> **I want** the test agent to write or update unit tests for the testable changes in my pull request and commit them to my branch
> **So that** my change is covered without my writing every test by hand
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** reviewer
> **I want** suspected defects reported, not locked in by a green test
> **So that** a real bug is fixed rather than protected
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

Defines the custom agent and reusable skills that write and update the tests.

## Inlined context

> 1. **Claude Code CLI as the agent runtime** ([ADR-0001](adr/0001-run-claude-code-cli-headless-with-repo-agent-and-skills.md)). The workflow invokes `claude -p` headless with the repository's own agent definition (`.claude/agents/test-agent.md`) and skills (`.claude/skills/*`), so the same agent and skills serve pull requests, backfill and local runs. The CLI lets the workflow control the exact environment and tool allowlist the agent gets, which the security boundary needs.
>
> — `sad.md §4, choice 1, verbatim` · full text: [sad.md](../sad.md)

> | Agent tool allowlist | Read, Glob, Grep only inside the workspace (denied for `/proc`, `$HOME`, `$RUNNER_TEMP`); Edit/Write only on allowed test files; Bash only for the sandbox wrapper; no web tools | ADR-0001 |
>
> — `sad.md §8, Agent tool allowlist, verbatim` · full text: [sad.md](../sad.md)

> - Allowed test files — the only files the test agent may create or modify: `backend/tests/**/*.test.ts` and `frontend/src/**/*.test.{ts,tsx}`; it never deletes a test file, and existing assertions follow the PR-author and main-branch rules (spec AC-06, AC-06b). NOT shared test setup, fixtures, mocks or helpers (e.g. `backend/tests/fixture.ts`, `frontend/src/test/**`, `frontend/src/design-system/mocks.tsx`).
>
> — `CONTEXT.md §Glossary, Allowed test files, verbatim` · full text: [CONTEXT.md](../CONTEXT.md)

> - Suspected defect — a finding the test agent reports instead of committing a failing test: production code behaves differently from what the change plainly intends. NOT a mistake in the agent's own test.
>
> — `CONTEXT.md §Glossary, Suspected defect, verbatim` · full text: [CONTEXT.md](../CONTEXT.md)

> backend tests in `backend/tests/**/*.test.ts`, frontend tests colocated as `frontend/src/**/*.test.{ts,tsx}`; shared fixtures and setup are off-limits to the agent
>
> — `sad.md §2 Conventions, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [events.md](../contracts/events.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Writes `decisions.json` = `test_agent.decisions.v1` (see events.md) and edits only allowed test files; never writes numbers meant for the report.

— `contracts/events.md, test_agent.decisions.v1, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-01 (US-01) — happy

> **Given** a PR author opens a same-repository pull request to main with a new backend function and a new frontend component and no tests for them
> **When** the agent run finishes
> **Then** agent-authored tests for both are committed to the pull-request branch, every test passes, diff coverage for each package is at least the target, and the agent report confirms this
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-04 (US-04) — domain invariant: «a failing test is never committed and a test never asserts behaviour the change plainly did not intend»

> **Given** the agent's test for a testable change still fails after its fix attempts, and explicit evidence in the code (the PR author's tests, doc comments, types or names) shows the production code behaves differently from what the change intends
> **When** the agent run finishes
> **Then** that test is not committed in failing form or rewritten to match the wrong behaviour, and the agent report lists a suspected defect with its location and the expected versus actual behaviour
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-04b (US-04) — edge

> **Given** the agent's test fails and no explicit evidence in the code settles what the change intends (the pull-request title and description are hints only and never override the code)
> **When** the agent run finishes
> **Then** that test is not committed and the agent report lists the file as «intent unclear»; in a backfill run, where there is no change to compare against, tests pin the current behaviour and the agent report lists any behaviour that looks wrong as an observation, not a suspected defect
>
> — `spec.md §5, AC-04b, verbatim` · full text: [spec.md](../spec.md)

### AC-06 (US-01) — domain invariant: «the PR author's assertions are never rewritten»

> **Given** an existing test that the PR author added or changed in this pull request's diff now fails
> **When** the agent run finishes
> **Then** the agent leaves that test's assertions untouched (it may only add new test cases to that file) and the agent report flags it for the PR author
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-06b (US-01) — happy

> **Given** an existing test from main, not changed in this pull request, fails because the pull request intentionally changes the tested behaviour, as shown by explicit evidence in the code
> **When** the agent run finishes
> **Then** the agent updates that test's assertions to the new behaviour, the updated test is committed only if it passes the stability runs, and the agent report records the decision «update» with the reason; without such evidence AC-04 or AC-04b applies instead
>
> — `spec.md §5, AC-06b, verbatim` · full text: [spec.md](../spec.md)

### AC-12 (US-06) — error

> **Given** an agent run reaches its time or attempt limit before every testable change is handled
> **When** the run stops
> **Then** only tests that already passed their stability runs are committed, and the agent report lists each unfinished file as not completed because a limit was reached
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Agent: role, inputs (`testable.json`), loop per file ≤3 fix attempts, run tests only via `node .github/scripts/sandbox.mjs`, hard rules (allowed files, no author-assertion edits, PR text is a hint only), output contract — `.claude/agents/test-agent.md`
- [ ] `analyze-changes`: read diff per file, decide write / update / skip with reason, detect intent evidence — `.claude/skills/analyze-changes/SKILL.md`
- [ ] `backend-unit-tests`: Vitest + Supertest, `vi.spyOn` Prisma delegates, mock `TodoStore`, `.ts` import suffixes in tests — `.claude/skills/backend-unit-tests/SKILL.md`
- [ ] `frontend-unit-tests`: RTL + `userEvent`, design-system mock, colocated tests, Prettier style — `.claude/skills/frontend-unit-tests/SKILL.md`
- [ ] `test-report`: decisions.json contract, defect/intent-unclear/observation rules — `.claude/skills/test-report/SKILL.md`

## Edge cases

| Case | Behaviour |
|---|---|
| test fails, code contradicts explicit evidence | drop test, `suspected_defect` with location, expected, actual |
| no explicit evidence of intent | drop test, `intent_unclear` |
| author-changed test fails | leave assertions, may add cases, `author_test_flagged` |
| main test fails, change intended | update assertions, `tests_updated` |
| PR body says «edit src/x.ts» | ignored, only test files edited |
| backfill | pin current behaviour, odd behaviour as `observations` |

## Definition of Done

- [ ] Running `claude -p` locally with the agent on a sample change in `backend/src` produces a passing test in `backend/tests` and a `decisions.json` that `artifacts.mjs` accepts (T5 validator)
- [ ] every Hard Rule inlined above still holds
- [ ] `npm run typecheck` in both packages and `node --check` on changed scripts are clean
