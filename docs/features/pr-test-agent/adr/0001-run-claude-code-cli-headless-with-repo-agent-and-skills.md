---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-11"
feature_size: "S"
ticket: "pr-test-agent"
---

# 0001 — Run Claude Code CLI headless with the repository's agent and skills

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** Volodymyr Kozlov, with Claude during the design walk

## Context

The assignment asks for a custom agent with reusable skills that runs in an automated pull-request workflow (spec §1). Model access is already provided through workload identity federation (SAD §2). Something must run the agent loop inside the job: read the change, write tests, run them in the sandbox, fix, and emit the patch and decisions.

## Decision drivers

- Security boundary (SAD §1 QG-1): the workflow must control exactly which environment variables and tools the agent gets.
- Reuse (spec §2): the same agent and skills must serve pull requests, backfill and local runs.
- Write surface limited to allowed test files (spec AC-05).

## Considered options

1. **Claude Code CLI headless (`claude -p`)** — loads `.claude/agents/test-agent.md` and `.claude/skills/*` directly; tool allowlist and env set by the workflow.
2. **claude-code-action** — packaged GitHub Action; expects to hold a GitHub token and post to the pull request itself.
3. **Own script on the Claude Agent SDK** — full control of the loop, but more own code, and the `.claude/` agent and skills are not reused as-is.

## Decision outcome

**Chosen:** option 1. It reuses the repository's agent and skills unchanged and keeps write rights out of the model-using job, which option 2 works against. It needs less code than option 3.

## Consequences

**Positive**
- One agent definition and one skill set for CI, backfill and local use.
- Tool allowlist (Read, Glob, Grep, Edit/Write on test paths, Bash only for the sandbox wrapper) is declared in the workflow.

**Negative**
- The CLI and its auth path must be pinned and verified (SAD §11).
- Agent output must be parsed from files (`decisions.json`), not from a structured SDK return.

**Neutral**
- Moving to the Agent SDK later keeps the skills; only the invocation step changes.

## Links

- Spec: [[../spec.md]] §1, AC-05
- SAD: [[../sad.md]] §4
- Related ADR: [[0002-split-unprivileged-agent-and-verify-from-workflow-run-publish]]
