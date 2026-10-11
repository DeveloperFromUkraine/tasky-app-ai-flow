---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-11"
feature_size: "S"
ticket: "pr-test-agent"
---

# 0004 — Take agent rules from main and skip pull requests that touch them

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** Volodymyr Kozlov, with Claude during the design walk

## Context

Spec §8 open question 1: a pull request must not be able to change the workflow, agent definition, skills or scripts that govern its own run. For `pull_request` events GitHub runs the workflow file from the pull request's merge commit.

## Decision drivers

- Spec §6.1 abuse case: a pull request edits the workflow or agent configuration to widen its own privileges.
- Security boundary (SAD §1 QG-1).

## Considered options

1. **Rules from main plus a gate skip** — publish is `workflow_run` (always main's definition) and checks out its scripts and allowlist from main; the agent job loads the agent and skills from a main checkout; pull requests touching `.github/` or `.claude/` get no agent run, with the reason in the report, and publish enforces the same rule itself from the API file list, treating every artifact of such a run as forged; CODEOWNERS on those paths.
2. **CODEOWNERS only** — rules come from the pull request; review before merge protects main but not the run itself.

## Decision outcome

**Chosen:** option 1. The parts that write and that enforce the rules cannot be changed by the pull request they judge. Option 2 only protects main after the fact.

## Consequences

**Positive**
- Rule changes reach the agent only after review and merge to main.

**Negative**
- Pull requests that change the agent itself get no agent run; they rely on the tests check and review.
- The unprivileged workflow file can still be edited by a same-repository collaborator; publish discards that run's artifacts, and the model access stays spend-capped (SAD §11).

**Neutral**
- Spec §8 open question 1 is closed by this ADR.

## Links

- Spec: [[../spec.md]] §6.1, §8
- SAD: [[../sad.md]] §4, §11
- Related ADR: [[0002-split-unprivileged-agent-and-verify-from-workflow-run-publish]]
