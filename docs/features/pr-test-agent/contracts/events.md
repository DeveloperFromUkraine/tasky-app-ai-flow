---
status: Draft
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-11"
feature_size: S
---

# Events — pr-test-agent

The contract between the jobs of the test agent automation (`sad.md` §5, surface `worker`). There is no request/response API: jobs hand facts to each other as **workflow artifacts**, consume **code-host events**, and produce **code-host outputs** (commit, report, check). Every artifact maps to a hand-off in a `sad.md` §6 flow. Field origins and the drift check are in [`api-sync-report.md`](api-sync-report.md).

**Trust rule.** Every artifact is untrusted input for the job that reads it. Publish validates each artifact against the schema below (unknown fields rejected, enums and lengths enforced) before using it. If the pull request touches `.github/` or `.claude/`, publish treats all artifacts of the run as forged (ADR-0004).

## Channel: code-host events (consumed)

| Event | Consumer | Filter |
|---|---|---|
| `pull_request` opened / synchronize / reopened / ready_for_review, any base branch | tests check, gate | gate stops forks, non-main bases, bot commits (flow 2) |
| `workflow_dispatch` with input `package` ∈ {`backend`, `frontend`} | gate | requester role must be `admin` or `maintain` (flow 7) |
| `workflow_run` completed for the agent workflow | publish | same repository, conclusion ≠ `cancelled`, and either event `pull_request` with a pull request into `main` or event `workflow_dispatch` on `main` (flows 4, 6, 7). Publish then takes the run's identity (event, pull requests, head branch, head commit, triggering actor) from `workflow_run`, never from the artifacts, and re-checks: the gate's pull request is one of the run's and targets `main`; a backfill was started by an `admin`/`maintain` user on a commit of `main` |

## Channel: run artifacts (job → job)

- **Producer → consumers:** gate → agent, verify, publish · agent → verify, publish · verify → publish.
- **Delivery:** within one workflow run; publish downloads them from the triggering run by run id.
- **Ordering:** by job dependency; publish acts only on the newest head commit of the pull request.
- **Common head:** every JSON artifact starts with `schema`, `run_id`, `mode`, `head_sha`. Publish rejects an artifact whose `head_sha` differs from the triggering run's head commit.

## Event: `test_agent.gate.v1` — file `testable.json`

```json
{
  "schema": "test_agent.gate.v1",
  "run_id": "<number>",
  "mode": "pull_request | backfill",
  "head_sha": "<40 hex>",
  "base_sha": "<40 hex>",
  "pr_number": "<number | null — null for backfill>",
  "decision": "run | skip",
  "skip_reason": "null | no_testable_change | rule_paths_changed",
  "packages": {
    "backend": { "files": ["backend/src/<path>.ts"] },
    "frontend": { "files": ["frontend/src/<path>.ts(x)"] }
  },
  "author_test_files": ["<test file paths added or changed in this pull request's diff>"]
}
```

- **Required fields:** all above.
- **Origin:** sad.md §6 flow 1 «testable files per package», flow 2 skip branches, flow 7 «all production source files of the package».
- **Notes:** `files` passed the glossary pre-filter («Testable change»). For backfill, `files` holds every production source file of the chosen package and the other package is empty. Stops that must not reach publish (fork, non-main base, bot commit, non-maintainer) produce **no** artifact; their reason goes to the job summary only.

## Event: `test_agent.patch.v1` — file `agent.patch`

- A unified diff (`git diff --binary` is not allowed; text only) of the agent's changes relative to `head_sha`.
- **Producer:** agent job. Uploaded with `if: always()`, so a partial patch survives a timeout (flow 5).
- **Origin:** sad.md §6 flow 1 and flow 3 «patch and decisions».
- **Validated by** publish (`check-patch`): every path matches «Allowed test files»; no file deletion; for paths in `author_test_files`, hunks are add-only.

## Event: `test_agent.decisions.v1` — file `decisions.json` (model-authored)

```json
{
  "schema": "test_agent.decisions.v1",
  "run_id": "<number>",
  "mode": "pull_request | backfill",
  "head_sha": "<40 hex>",
  "completed": true,
  "not_completed_reason": "null | model_unavailable | spend_limit | time_limit | attempt_limit",
  "skills_used": ["analyze-changes | backend-unit-tests | frontend-unit-tests | test-report"],
  "files": [
    {
      "path": "<production source path from testable.json>",
      "package": "backend | frontend",
      "decision": "write | update | skip",
      "reason": "<text, max 500 chars>",
      "test_files": ["<allowed test file paths>"],
      "outcome": "tests_written | tests_updated | suspected_defect | intent_unclear | author_test_flagged | limit_reached | skipped",
      "defect": { "location": "<path:line>", "expected": "<text, max 300>", "actual": "<text, max 300>" }
    }
  ],
  "observations": ["<backfill only: behaviour that looks wrong, text, max 300 each>"]
}
```

- **Required fields:** `schema`, `run_id`, `mode`, `head_sha`, `completed`, `not_completed_reason`, `skills_used`, `files`. `defect` only when `outcome = suspected_defect`. `observations` only in backfill.
- **Origin:** sad.md §6 flow 3 alt-branches, flow 5; spec AC-03, AC-04, AC-04b, AC-06, AC-06b, AC-12.
- **Notes:** contains **no numbers** that reach the report — counts and coverage come only from `results.json`. All text is escaped and length-capped by publish, and scanned for secret patterns (flow 4).

## Event: `test_agent.results.v1` — file `results.json` (measured, no model)

```json
{
  "schema": "test_agent.results.v1",
  "run_id": "<number>",
  "mode": "pull_request | backfill",
  "head_sha": "<40 hex>",
  "patch_sha256": "<hex of agent.patch>",
  "kept_test_files": ["<paths in the filtered patch>"],
  "unstable_test_files": [{ "path": "<path>", "failed_run": "1 | 2 | 3" }],
  "tests": {
    "backend": { "passed": 0, "failed": 0 },
    "frontend": { "passed": 0, "failed": 0 }
  },
  "coverage": {
    "backend": {
      "measured": true,
      "diff": { "covered": 0, "total": 0, "pct": "<number | null — null when no changed line is instrumented>" },
      "target_pct": 80,
      "target_met": true,
      "uncovered_lines": [{ "file": "<path>", "lines": [0] }],
      "package_before_pct": "<number | null — backfill only>",
      "package_after_pct": "<number | null — backfill only>"
    },
    "frontend": "<same shape>"
  }
}
```

- **Required fields:** all above; a package with no testable change has `measured: false` and `diff: null`.
- **Companion file:** `agent.filtered.patch` — `agent.patch` minus unstable test files; the only patch publish may commit.
- **How publish reads patches:** never by trusting the text. It applies `agent.patch` and `agent.filtered.patch` each to a clean checkout of `head_sha`, re-runs the patch rules on the diff **git** regenerates from the result, requires every file of the filtered diff to be byte-identical to a file of the full one, and commits exactly the regular files git reports as changed.
- **Origin:** sad.md §6 flow 3 (verify branches), flow 5 (partial), flow 7 (before/after); spec AC-03, AC-14, AC-15, AC-18; NFR «Report fidelity», «Diff coverage target», «Stability runs».
- **Notes:** `measured` is true only when the lcov file for the package exists. Skipped files are not in the diff-coverage denominator (AC-18). A `null` `pct` (no instrumented changed line) counts as `target_met: true`: there is nothing left to cover.

## Channel: code-host outputs (publish → code host)

| Output | Shape |
|---|---|
| Commit | Author = the App's bot identity; message `test-agent: tests for <head_sha 7>`; only `agent.filtered.patch` (flow 4) |
| Backfill branch + pull request | Branch `test-agent/backfill-<package>-<run_id>` from main; pull request to main titled `test-agent: backfill <package>` (flow 7) |
| Agent report | One PR comment containing the marker `<!-- test-agent-report -->`, upserted; names the analysed head commit and the agent commit (AC-03) |
| Check run `test-agent` | Conclusion `success` when every testable change was handled and every measured target met; `neutral` otherwise; never `failure` (AC-09) |

## Publish outcomes (the error responses)

Neutral `module.error_name` codes, shown in the report and in the check summary:

| Code | When (sad.md §6 branch) | Commits? | Check |
|---|---|---|---|
| `test_agent.committed` | all checks pass (flow 4 else) | yes | success, or neutral if a target was missed |
| `test_agent.skipped_no_testable_change` | flow 2 | no | neutral |
| `test_agent.skipped_rule_paths_changed` | flows 2, 4 | no | neutral |
| `test_agent.path_not_allowed` | flow 4 | no | neutral |
| `test_agent.test_file_deleted` | flow 4 | no | neutral |
| `test_agent.author_assertion_changed` | flow 4 | no | neutral |
| `test_agent.secret_detected` | flow 4 | no | neutral |
| `test_agent.artifact_invalid` | schema validation fails, or `head_sha` mismatch between artifacts | no | neutral |
| `test_agent.outdated` | head commit moved (flow 4, AC-13) | no | neutral |
| `test_agent.not_completed` | flow 5 model unavailable or spend limit; agent or verify job failed | no | neutral |
| `test_agent.limit_reached` | flow 5 time or attempt limit | stable tests only | neutral |
| — (no output) | triggering run `cancelled` (flow 6) | no | unchanged |
| — (no output) | the run's identity does not match the gate (mode vs event, pull request not the run's or not into `main`, backfill off `main`, by a non-maintainer or on a commit not on `main`) | no | unchanged |
| — (no output) | re-run of a published pull-request run: the head is the agent's own commit on top of `head_sha` | no | unchanged |
| — (no output) | the backfill branch already exists and is not the App's own open pull request on `head_sha` | no | unchanged |

## Idempotency & retry

- **Idempotency:** publish acts on (`pr_number`, `head_sha`) once: the report is upserted by marker, the commit is applied only if the branch head still equals `head_sha`, and a second publish for the same pair finds the agent's own commit on top of `head_sha` and does nothing, so the earlier result stands. When the head moved for any other reason (the author pushed), publish commits nothing and reports `test_agent.outdated` (AC-13).
- **Backfill re-run:** finds the pull request of `test-agent/backfill-<package>-<run_id>` and, only when it is open, opened by the App and its head is the App's commit on `head_sha`, commits nothing and upserts the report there. Any other pull request on that branch, or the branch without one, ends with no output: the branch name is guessable from the run id, so publish never reports on or commits to a branch it did not make.
- **Retry:** none automatic; a maintainer can re-run the workflow, which repeats the same idempotent steps.
- **Dead-letter:** N/A — there is no queue; a failed run ends in `test_agent.not_completed` in the report.

## Schema registry

- Registry: this file. Publish validates each artifact with a small hand-written validator in `.github/scripts/` (no schema library; repo convention is dependency-free scripts).
