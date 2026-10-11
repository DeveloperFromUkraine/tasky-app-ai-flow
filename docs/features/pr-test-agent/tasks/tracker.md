# Tracker — pr-test-agent

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | Implement the pre-filter and gate decision script | domain | Volodymyr Kozlov | M | — | todo |
| T2 | Implement the patch rule check and secret scan | domain | Volodymyr Kozlov | M | — | todo |
| T3 | Implement diff coverage from lcov and the git diff | domain | Volodymyr Kozlov | M | — | todo |
| T4 | Implement the sandbox wrapper and stability runner | infra | Volodymyr Kozlov | M | — | todo |
| T5 | Implement artifact schema validators | domain | Volodymyr Kozlov | S | — | todo |
| T6 | Render the agent report, outcome code and check conclusion | domain | Volodymyr Kozlov | M | T5 | todo |
| T7 | Write the test agent definition and its four skills | app | Volodymyr Kozlov | M | — | todo |
| T8 | Add the deterministic tests check workflow | wiring | Volodymyr Kozlov | S | — | todo |
| T9 | Create the agent workflow with triggers, concurrency and the gate job | wiring | Volodymyr Kozlov | M | T1 | todo |
| T10 | Add the agent job: federated model access and a locked-down Claude run | wiring | Volodymyr Kozlov | M | T9, T4, T7 | todo |
| T11 | Add the verify job: stability runs and measured coverage | wiring | Volodymyr Kozlov | M | T10, T3, T4, T5 | todo |
| T12 | Implement the publish orchestration script | app | Volodymyr Kozlov | M | T2, T5, T6 | todo |
| T13 | Add the workflow_run publish workflow with the App token | wiring | Volodymyr Kozlov | S | T11, T12 | todo |
| T14 | Add CODEOWNERS and the setup prerequisites document | docs | Volodymyr Kozlov | S | T13 | todo |

**Total:** 14 tasks, ~12.0 person-days.
