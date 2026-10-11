---
id: T14
title: "Add CODEOWNERS and the setup prerequisites document"
layer: "docs"
deps: ["T13"]
blocks: []
acs: ["AC-05", "AC-17"]
files_hint: [".github/CODEOWNERS", "docs/test-agent-setup.md"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or contradicts the code in front of you, open the named file for the full text and follow that. Do not invent the missing part. -->

# T14 — Add CODEOWNERS and the setup prerequisites document

## Place in the sequence

- **Blocked by:** T13 — Add the workflow_run publish workflow with the App token · **Blocks:** — · **Wave:** 6.
- **Lane:** own lane.

## Why (user story)

> **As a** repository maintainer
> **I want** the test agent to be unable to change anything except allowed test files, and unable to expose credentials
> **So that** a hostile or prompt-injected pull request cannot turn the agent against the repository
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

Makes rule changes reviewable and documents the one-time setup the workflow needs.

## Inlined context

> - GitHub App «taskly-test-agent» with Contents and Pull requests read/write, Checks read/write, installed on this repository only; `TEST_AGENT_APP_ID` variable and `TEST_AGENT_APP_PRIVATE_KEY` secret in the `test-agent-publish` environment.
>
> — `sad.md §7, Prerequisites, verbatim` · full text: [sad.md](../sad.md)

> - Second Anthropic federation rule for `workflow_dispatch` on main (backfill), its ID as `ANTHROPIC_BACKFILL_FEDERATION_RULE_ID`.
>
> — `sad.md §7, Prerequisites, verbatim` · full text: [sad.md](../sad.md)

> - Branch protection on main: tests check required; CODEOWNERS review required (spec §8 open question 2 tracks the rest).
>
> — `sad.md §7, Prerequisites, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [events.md](../contracts/events.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-05 (US-05) — domain invariant: «the test agent changes only allowed test files»

> **Given** the agent's proposed change touches anything other than allowed test files (production code, shared test setup, shared fixtures, coverage settings, dependencies or workflow definitions) or deletes a test file
> **When** the publishing stage checks the change
> **Then** nothing from that run is committed, and the agent report says the change was rejected and names the rule it broke
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-17 (US-09) — authorization

> **Given** someone without the admin or maintain role in the repository tries to start an on-demand backfill run
> **When** the start is requested
> **Then** no agent run starts and no model access is granted, because only a repository maintainer may start a backfill run; the role is checked before any model access
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `/.github/ @DeveloperFromUkraine` and `/.claude/ @DeveloperFromUkraine` — `.github/CODEOWNERS`
- [ ] Setup guide: create/install App, environment + secret, second federation rule, branch protection (required checks, CODEOWNERS) — `docs/test-agent-setup.md`

## Edge cases

| Case | Behaviour |
|---|---|
| PR edits `.claude/` | needs code-owner review before merge |

## Definition of Done

- [ ] A PR touching `.github/` requests the code owner; the setup guide is followed once end to end and the first agent run succeeds
- [ ] every Hard Rule inlined above still holds
- [ ] `npm run typecheck` in both packages and `node --check` on changed scripts are clean
