---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-11"
feature_size: "S"
ticket: "pr-test-agent"
---

# 0002 — Split unprivileged agent and verify jobs from a workflow_run publish

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** Volodymyr Kozlov, with Claude during the design walk

## Context

The agent must run pull-request code and its own tests repeatedly while talking to the model, and its result must be committed to the pull-request branch. Spec §1 and §6.1 require split privileges: the stage that executes untrusted code has no write rights and no reachable credentials, and a stage without a model checks the output and commits. Spec §6 requires report numbers to come from measured output.

## Decision drivers

- Security boundary (spec §6.1, AC-08): no credentials reachable by pull-request or agent-authored code.
- Report fidelity: 100% of numbers come from measured output (spec §6).
- Only allowed test files committed (spec AC-05); stable tests only (spec AC-14).

## Considered options

1. **gate → agent → verify in the pull-request workflow (read-only), publish in a separate `workflow_run` workflow** — untrusted code always in a Docker sandbox; verify re-measures with no model; publish is defined on main and alone writes.
2. **Publish job in the same pull-request workflow, behind an environment restricted to main** — the same gate, agent and verify jobs, with publish as a fourth job.
3. **`pull_request_target` publish** — a separate workflow that runs in the base-branch context with write rights.

## Decision outcome

**Chosen:** option 1. Numbers come from a job the model never controls, and the only job with write rights is defined on main by construction of `workflow_run`, so a pull request cannot change it. Option 2 does not work: a job running for a pull-request ref is refused by an environment restricted to main, and loosening that restriction would expose the App key to a file the pull request can edit. Option 3 runs from main too, but it is the trigger that most often ends up checking out pull-request code with write rights; `workflow_run` keeps the writer free of pull-request code by design and only receives artifacts, which publish validates (ADR-0004).

## Consequences

**Positive**
- The write path (App key, commit, comment) is unreachable from pull-request content.
- Verify's measurements are reproducible and independent of the agent.

**Negative**
- Tests run twice (agent iterations, then verify's 3 stability runs and coverage), which costs wall time within the 15 min cap.
- Artifact hand-off and `workflow_run` add moving parts; publish must re-derive the pull request and head commit from the triggering run.

**Neutral**
- The sandbox needs Docker on the runner; GitHub-hosted Ubuntu runners have it.

## Links

- Spec: [[../spec.md]] §1, §6, §6.1, AC-05, AC-08, AC-14
- SAD: [[../sad.md]] §4, §5, §8
- Related ADR: [[0003-publish-with-github-app-installation-token]], [[0004-take-agent-rules-from-main-and-skip-prs-touching-them]]
