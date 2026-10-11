# Tracker — pr-test-agent

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | Implement the pre-filter and gate decision script | domain | Volodymyr Kozlov | M | — | done |
| T2 | Implement the patch rule check and secret scan | domain | Volodymyr Kozlov | M | — | done |
| T3 | Implement diff coverage from lcov and the git diff | domain | Volodymyr Kozlov | M | — | done |
| T4 | Implement the sandbox wrapper and stability runner | infra | Volodymyr Kozlov | M | — | done |
| T5 | Implement artifact schema validators | domain | Volodymyr Kozlov | S | — | done |
| T6 | Render the agent report, outcome code and check conclusion | domain | Volodymyr Kozlov | M | T5 | done |
| T7 | Write the test agent definition and its four skills | app | Volodymyr Kozlov | M | — | done |
| T8 | Add the deterministic tests check workflow | wiring | Volodymyr Kozlov | S | — | done |
| T9 | Create the agent workflow with triggers, concurrency and the gate job | wiring | Volodymyr Kozlov | M | T1 | done |
| T10 | Add the agent job: federated model access and a locked-down Claude run | wiring | Volodymyr Kozlov | M | T9, T4, T7 | done |
| T11 | Add the verify job: stability runs and measured coverage | wiring | Volodymyr Kozlov | M | T10, T3, T4, T5 | done |
| T12 | Implement the publish orchestration script | app | Volodymyr Kozlov | M | T2, T5, T6 | done |
| T13 | Add the workflow_run publish workflow with the App token | wiring | Volodymyr Kozlov | S | T11, T12 | done |
| T14 | Add CODEOWNERS and the setup prerequisites document | docs | Volodymyr Kozlov | S | T13 | done |
| T15 | Harden patch rules: modes, copies, quoted paths, dot segments, filtered-patch identity, content secret scan | domain | Volodymyr Kozlov | S | — | done |
| T16 | Publish derives mode, pull request and actor from the triggering run | app | Volodymyr Kozlov | M | T15 | done |
| T17 | Report hardening: single-line defect location, upsert only the App's comment | domain | Volodymyr Kozlov | S | T16 | todo |
| T18 | Re-run idempotency and contract drift (outdated, diff.pct null) | app | Volodymyr Kozlov | S | T17 | todo |
| T19 | Limits: unfinished files, limit banner, budget/turns, per-file run cap, neutral exchange failure | app | Volodymyr Kozlov | M | T18 | todo |
| T20 | Sandbox mounts the working copy read-only except declared writable dirs | infra | Volodymyr Kozlov | M | T19 | todo |

**Total:** 20 tasks (T15–T20: follow-ups from `_review/review-2026-10-11.md`).
