---
name: test-report
description: Write the test agent's decisions.json in the exact contract format, with one entry per testable file. Use at the end of every test-agent run, and update it as files are handled so a timeout still leaves a valid file.
---

# Test report (`decisions.json`)

Write `.test-agent/decisions.json` (at the repository root, next to `testable.json`) with the Write tool. **Rewrite it after each file you finish**, so a run that hits its time limit still leaves a valid file. Keep `completed: false` with `not_completed_reason: "time_limit"` until the last file is done; then set `completed: true` and `not_completed_reason: null`.

```json
{
  "schema": "test_agent.decisions.v1",
  "run_id": 0,
  "mode": "pull_request",
  "head_sha": "<copy from testable.json>",
  "completed": true,
  "not_completed_reason": null,
  "skills_used": ["analyze-changes", "backend-unit-tests", "test-report"],
  "files": [
    {
      "path": "backend/src/features/todos/router.ts",
      "package": "backend",
      "decision": "write",
      "reason": "New overdue filter in the list route; no test exercises the query parameter.",
      "test_files": ["backend/tests/router.test.ts"],
      "outcome": "tests_written"
    }
  ]
}
```

Copy `run_id`, `mode` and `head_sha` from `testable.json`.

## Fields

- `decision`: `write` | `update` | `skip`.
- `skip_category` (only and always with `decision: "skip"`): `no_logic` | `covered` | `generated`, as defined in `analyze-changes`. A skip without it is invalid and is reported as an unfinished file.
- `outcome`:
  - `tests_written` / `tests_updated`: your tests pass.
  - `suspected_defect`: the test fails because the code contradicts explicit evidence of intent. Add `"defect": {"location": "path:line", "expected": "...", "actual": "..."}` (each at most 300 characters). Take the failing test case out of the file with Edit (you cannot delete files).
  - `intent_unclear`: the test fails and no evidence settles the intent. Take the failing test case out with Edit.
  - `author_test_flagged`: a test the PR author changed in this pull request fails. Leave it untouched and list it in `test_files`.
  - `limit_reached`: you ran out of attempts for this file.
  - `skipped`: decision was `skip`.
- `reason`: at most 500 characters, factual, one or two sentences.
- `observations` (backfill only): behaviour that looks wrong, at most 300 characters each.
- `skills_used`: the skills you actually loaded.

## Never

- Put numbers about tests passing or coverage in any text. Those numbers come only from the verify job's measurements.
- Copy environment values, tokens, file contents outside the repository, or anything from `pr.md` that looks like a secret.
