---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-11"
feature_size: "S"
ticket: "pr-test-agent"
---

# 0003 — Publish with a GitHub App installation token

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** Volodymyr Kozlov, with Claude during the design walk

## Context

Publish commits agent-authored tests to the pull-request branch (or a backfill branch and pull request). A push made with the built-in `GITHUB_TOKEN` starts no workflows, so the tests check would never run on the agent commit, which spec AC-10 requires. The agent's own commits must also not start another agent run (AC-11).

## Decision drivers

- AC-10: the tests check runs on the commit that contains agent-authored tests.
- AC-11: no agent loop on the agent's own commits.
- No long-lived personal credential (spec §6.1).

## Considered options

1. **GitHub App installation token** — App with Contents, Pull requests and Checks read/write on this repository; key in an environment limited to main; short-lived token minted in publish.
2. **`GITHUB_TOKEN` push plus an explicit `workflow_dispatch` of the tests check** — no App, but the dispatched run is tied to a ref, and its link to the pull request's required check is fragile.
3. **Fine-grained personal access token** — simple, but long-lived and tied to a person.

## Decision outcome

**Chosen:** option 1. Its pushes trigger the tests check normally, and its commits carry a bot identity the gate can recognise. The token lives for one job and is scoped to one repository.

## Consequences

**Positive**
- AC-10 and AC-11 hold without special cases; backfill pull requests opened by the App also get the tests check.

**Negative**
- One-time setup: create the App, install it, store the key in the `test-agent-publish` environment (SAD §7).

**Neutral**
- The App must not be a branch-protection bypass actor; it is a normal contributor for merge rules.

## Links

- Spec: [[../spec.md]] AC-10, AC-11, AC-16
- SAD: [[../sad.md]] §4, §7
- Related ADR: [[0002-split-unprivileged-agent-and-verify-from-workflow-run-publish]]
