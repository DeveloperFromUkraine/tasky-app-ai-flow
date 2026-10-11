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
| T17 | Report hardening: single-line defect location, upsert only the App's comment | domain | Volodymyr Kozlov | S | T16 | done |
| T18 | Re-run idempotency and contract drift (outdated, diff.pct null) | app | Volodymyr Kozlov | S | T17 | done |
| T19 | Limits: unfinished files, limit banner, budget/turns, per-file run cap, neutral exchange failure | app | Volodymyr Kozlov | M | T18 | done |
| T20 | Sandbox mounts the working copy read-only except declared writable dirs | infra | Volodymyr Kozlov | M | T19 | done |
| T21 | Patch parser: lines inside a hunk are always content | domain | Volodymyr Kozlov | S | T20 | done |
| T22 | Sandbox: backend rebuild can write src/generated; run counter outside the working copy | infra | Volodymyr Kozlov | S | T21 | done |
| T23 | finalize: keep the agent's own result on exit 0; one file cap for gate and decisions | app | Volodymyr Kozlov | S | T22 | done |
| T24 | Publish: required bot login, any PR into main, secret scan of new content only, idempotent backfill re-run | app | Volodymyr Kozlov | S | T23 | done |
| T25 | Contract: publish trigger filter and no-output outcomes | docs | Volodymyr Kozlov | S | T24 | done |
| T26 | Patch parser counts hunk lines as git apply does | domain | Volodymyr Kozlov | S | T25 | done |
| T27 | Backfill re-run accepts only the App's own open pull request | app | Volodymyr Kozlov | S | T26 | done |
| T28 | Run counter: required location, counted before the run | app | Volodymyr Kozlov | S | T27 | done |
| T29 | finalize: any clean exit without a finished run is an attempt limit | app | Volodymyr Kozlov | S | T28 | done |
| T30 | Publish checks the diff git regenerates; App commits proven by GitHub's signature | app | Volodymyr Kozlov | S | T29 | done |
| T31 | finalize: error text wins over the clean-exit default | app | Volodymyr Kozlov | S | T30 | done |
| T32 | Publish downloads each artifact by name into the folder it reads | wiring | Volodymyr Kozlov | S | T31 | done |

**Total:** 32 tasks (T15–T20: follow-ups from `_review/review-2026-10-11.md`; T21–T25: from `_review/review-2026-10-11-2.md`; T26–T29: from `_review/review-2026-10-11-3.md`; T30–T31: from `_review/review-2026-10-11-4.md`).
