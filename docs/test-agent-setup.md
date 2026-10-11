# Test agent — one-time setup

What a repository maintainer sets up once so the test agent workflows can run. Design: [`docs/features/pr-test-agent/sad.md`](features/pr-test-agent/sad.md) §7.

## 1. Model access (Anthropic workload identity federation)

Already configured for pull requests: repository **variables** `ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_ORGANIZATION_ID`, `ANTHROPIC_SERVICE_ACCOUNT_ID`, `ANTHROPIC_WORKSPACE_ID` (Settings → Secrets and variables → Actions → Variables). There is no API key anywhere.

The federation rule must match only this repository's pull-request runs against main:

- issuer `https://token.actions.githubusercontent.com`, audience `https://api.anthropic.com`;
- `subject_prefix` `repo:<owner>/<repo>:pull_request`;
- claims `event_name = pull_request`, `base_ref = main`, `repository_owner_id = <owner id>`;
- `token_lifetime_seconds` 600.

**Backfill runs** (manual, from main) need a second rule with `subject_prefix` `repo:<owner>/<repo>:ref:refs/heads/main` and claim `event_name = workflow_dispatch`. Put its ID in the repository variable `ANTHROPIC_BACKFILL_FEDERATION_RULE_ID`; the workflow picks it for manual runs.

Fork pull requests never get an identity token (GitHub withholds `id-token: write` from them), and the gate stops them before the agent job.

## 2. GitHub App (the only write identity)

1. Settings → Developer settings → GitHub Apps → **New GitHub App**: name e.g. `taskly-test-agent`, no webhook.
2. Repository permissions: **Contents** read & write, **Pull requests** read & write, **Checks** read & write. Nothing else.
3. Install it on this repository only.
4. Generate a private key.
5. Settings → Environments → **New environment** `test-agent-publish`:
   - Deployment branches and tags → **Selected branches** → `main`.
   - Environment secret `TEST_AGENT_APP_PRIVATE_KEY` = the private key (PEM).
   - Environment variable `TEST_AGENT_APP_ID` = the App ID.
6. Repository variable `TEST_AGENT_BOT_LOGIN` = `<app-slug>[bot]`, e.g. `taskly-test-agent[bot]`. The gate uses it so the agent's own commits never start another agent run.

Do **not** add the App to any branch-protection bypass list.

## 3. Branch protection on main

Settings → Branches → rule for `main` (or a ruleset):

- Require a pull request before merging; **require review from Code Owners** (`.github/CODEOWNERS` covers `.github/` and `.claude/`).
- Require status checks: `tests (backend)`, `tests (frontend)`, `tests (agent scripts)`. Do **not** require `test-agent`. It is advisory (spec AC-09).
- Dismissing stale approvals after an agent push: open question, see spec §8.

## 4. Verify

1. Open a pull request to main that changes a file under `backend/src`.
2. Expect `tests (…)` to run, the `test-agent` workflow (gate → agent → verify), then `test-agent-publish`.
3. The pull request gets an agent commit by the App, one comment starting with «Test agent report», a `test-agent` check, and a new `tests (…)` run on the agent commit.

Backfill: Actions → **test-agent** → Run workflow → branch `main`, package `backend` or `frontend`.
