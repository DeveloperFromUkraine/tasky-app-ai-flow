# Changelog — pr-test-agent

## pr-test-agent — security hardening after review (follow-up to PR #1)

**What:** the test agent shipped in PR #1 now holds its privilege boundary against a hostile pull request. Publish decides who and what a run is from GitHub's own `workflow_run` data, checks the diff git regenerates rather than the patch text it is handed, and commits only regular test files; the sandbox mounts the working copy read-only; limits are reported truthfully and enforced, not only instructed.

**Why:** four independent reviews ([review 1](../_review/review-2026-10-11.md), [2](../_review/review-2026-10-11-2.md), [3](../_review/review-2026-10-11-3.md), [4](../_review/review-2026-10-11-4.md)) found ways a pull request could make the App commit what the [spec](../spec.md) forbids (AC-05, AC-06, AC-17) or misreport a run (AC-09, AC-12, AC-13). The fixes enforce the decisions already taken: an unprivileged run never decides what publish trusts ([ADR-0002](../adr/0002-split-unprivileged-agent-and-verify-from-workflow-run-publish.md)), and the agent's rules always come from main ([ADR-0004](../adr/0004-take-agent-rules-from-main-and-skip-prs-touching-them.md)).

**How to use:** unchanged for users. Open or update a pull request into `main`; maintainers start a backfill with *Run workflow* on `main` (see [setup](../../../test-agent-setup.md)).

**Behaviour changes worth knowing:**
- Publish acts only for pull requests into `main` and for backfills dispatched on `main` by an `admin`/`maintain` user (checked on the actor who started that attempt, so re-runs count too).
- A run whose head is already the App's own commit (a re-run) leaves the earlier report alone; a backfill branch someone else created is ignored.
- When a run hits its time, turn or budget limit, the report says so and lists every file not handled; the stable tests are still committed. Each test file can be run at most 4 times (1 run + 3 fix attempts).
- If the model token exchange fails, the run ends as "model unavailable" with a neutral check instead of a failed job.

**Operational notes:**
- Migration: none.
- Config: repository variable `TEST_AGENT_BOT_LOGIN` (`<app-slug>[bot]`) is now **required** by publish; it fails fast without it.
- First CI run to watch: the backend install under the read-only sandbox, the Docker isolation probe in `tests.yml`, and that App commits arrive with the App as verified committer (a re-run relies on it; if not, it reports "outdated" instead of staying silent — safe, but noisy).
- Rollback: revert the merge commit; no state to undo.

**Acceptance criteria hardened:** AC-05, AC-06, AC-07, AC-08, AC-09, AC-12, AC-13, AC-16, AC-17 (plus AC-03 and AC-18 report fidelity).
