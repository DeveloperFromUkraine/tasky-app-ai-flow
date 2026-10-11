---
id: T5
title: "Implement artifact schema validators"
layer: "domain"
deps: []
blocks: ["T6", "T11", "T12"]
acs: ["AC-03"]
files_hint: [".github/scripts/artifacts.mjs", ".github/scripts/artifacts.test.mjs"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or contradicts the code in front of you, open the named file for the full text and follow that. Do not invent the missing part. -->

# T5 — Implement artifact schema validators

## Place in the sequence

- **Blocked by:** — · **Blocks:** T6 — Render the agent report, outcome code and check conclusion, T11 — Add the verify job: stability runs and measured coverage, T12 — Implement the publish orchestration script · **Wave:** 1.
- **Lane:** own lane.

## Why (user story)

> **As a** reviewer
> **I want** one agent report on the pull request that lists the per-file decisions with reasons, the skills used, the test results and the measured diff coverage
> **So that** I can decide whether to trust the agent-authored tests
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As a** repository maintainer
> **I want** the test agent to be unable to change anything except allowed test files, and unable to expose credentials
> **So that** a hostile or prompt-injected pull request cannot turn the agent against the repository
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

Lets publish reject any artifact that does not match the contract before using it.

## Inlined context

> **Trust rule.** Every artifact is untrusted input for the job that reads it. Publish validates each artifact against the schema below (unknown fields rejected, enums and lengths enforced) before using it. If the pull request touches `.github/` or `.claude/`, publish treats all artifacts of the run as forged (ADR-0004).
>
> — `contracts/events.md, Trust rule, verbatim` · full text: [sad.md](../sad.md)

> **Common head:** every JSON artifact starts with `schema`, `run_id`, `mode`, `head_sha`. Publish rejects an artifact whose `head_sha` differs from the triggering run's head commit.
>
> — `contracts/events.md, Channel run artifacts, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [events.md](../contracts/events.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Validators for `test_agent.gate.v1`, `test_agent.decisions.v1`, `test_agent.results.v1` exactly as in events.md; failure → `test_agent.artifact_invalid`.
- Text caps: `reason` 500, `defect.*` 300, `observations[]` 300.

— `contracts/events.md, Events gate/decisions/results, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-03 (US-03) — happy

> **Given** an agent run has completed
> **When** the reviewer opens the pull request
> **Then** the reviewer sees a single agent report naming the PR author's head commit it analysed and the agent's own commit (if any) and, for each testable change: the decision (write, update or skip) with a reason, the skills used, the passed and failed counts, and diff coverage per package taken from the measured results
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Small hand-written validator helpers (type, enum, maxLength, required, no unknown keys, path regex) — `.github/scripts/artifacts.mjs`
- [ ] One `validate<Name>(obj)` per artifact + `sameHead(artifacts, sha)` — same file
- [ ] Self-check with valid and broken samples — `.github/scripts/artifacts.test.mjs`

## Edge cases

| Case | Behaviour |
|---|---|
| unknown field | invalid |
| `reason` 501 chars | invalid |
| `head_sha` differs between artifacts | invalid |
| `outcome = suspected_defect` without `defect` | invalid |

## Definition of Done

- [ ] `node --test .github/scripts/artifacts.test.mjs` passes
- [ ] every Hard Rule inlined above still holds
- [ ] `npm run typecheck` in both packages and `node --check` on changed scripts are clean
