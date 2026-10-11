---
status: Living
updated_at: "2026-10-11"
---

# Domain Context — pr-test-agent

## Glossary

- Agent report — the single pull-request comment (for backfill: on the pull request the backfill opens), updated on every agent run, that lists per-file decisions, skills used, test results and diff coverage; on a backfill pull request it is owned by the backfill run, because the pull-request agent run does not run there. NOT the check status (the pass/fail mark next to the PR).
- Allowed test files — the only files the test agent may create or modify: `backend/tests/**/*.test.ts` and `frontend/src/**/*.test.{ts,tsx}`; it never deletes a test file, and existing assertions follow the PR-author and main-branch rules (spec AC-06, AC-06b). NOT shared test setup, fixtures, mocks or helpers (e.g. `backend/tests/fixture.ts`, `frontend/src/test/**`, `frontend/src/design-system/mocks.tsx`).
- Agent run — one execution of the test agent for one head commit of a pull request, or one on-demand backfill of a single package. NOT the whole PR workflow (which also includes the tests check).
- Agent-authored test — a test file created or changed by a test-agent commit. NOT a test written by the PR author (the agent may add to those files but never rewrites the author's assertions).
- Diff coverage — the share of added or changed lines in testable changes that the test suite executes. NOT overall package coverage.
- PR author — the person who opens or updates a pull request against main. NOT the reviewer.
- Repository maintainer — the person, holding the admin or maintain role in the GitHub repository, who sets up the workflow prerequisites (model trust, repository variables, main-branch protection) and owns the agent's rules. NOT the PR author.
- Reviewer — the person who reads the agent report and approves or rejects the pull request. NOT the PR author (in a solo repository the same person may hold both roles at different times).
- Skill — a reusable instruction package for one sub-task (change analysis, backend tests, frontend tests, reporting) that the test agent loads on demand. NOT the agent itself.
- Suspected defect — a finding the test agent reports instead of committing a failing test: production code behaves differently from what the change plainly intends. NOT a mistake in the agent's own test.
- Test agent — the automated actor that analyses a pull request's changes and writes or updates unit tests for them. NOT the tests check (the deterministic test run with no model involved).
- Tests check — the deterministic, merge-blocking run of the full backend and frontend test suites on a pull request, with no model involved. NOT the test agent's own advisory check.
- Testable change — a changed production source file (for backfill: any production source file in the chosen package) that passes the pre-filter, which excludes `*.md` and other docs, `*.stories.tsx`, `types.ts` and `*.d.ts`, `frontend/src/design-system/**`, `generated/**`, and every non-source file (package manifests, lockfiles, configs, the Prisma schema, Dockerfiles). NOT any changed file.
