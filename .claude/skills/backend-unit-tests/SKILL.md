---
name: backend-unit-tests
description: Write or update Vitest unit tests for the taskly backend (Express 5, Prisma 7, Zod) following this repository's conventions. Use for files under backend/src.
---

# Backend unit tests

## Where tests go

- One test file per source module: `backend/tests/<module>.test.ts`, or a subfolder of `backend/tests/` for a new feature (`backend/tests/<feature>/<module>.test.ts`).
- You may create test files and add cases. You may change assertions only in tests from main when the analysis decided `update`. Never touch tests the PR author changed in this pull request, except to add new cases.
- **Never edit** `backend/tests/fixture.ts`, `vitest.config.ts`, `package.json` or anything under `backend/src`. You may *import* `./fixture.ts`. Define extra fixtures inside your test file.

## Conventions (match the existing tests)

- `import { it, expect, vi } from 'vitest'`. Import sources with the `.ts` suffix: `import { x } from '../src/features/todos/validators.ts'`.
- Dense style, semicolons, single quotes, short `setup()` helpers, `it.each` for input tables.
- **No database.** Construct the real Prisma client with `createDatabase('postgresql://test:test@localhost:5432/test')` and mock its IO with `vi.spyOn(database.todo, 'findMany').mockResolvedValue(...)`; `afterEach(() => vi.restoreAllMocks())`. See `backend/tests/repository.test.ts`.
- **Routers:** mount `createXRouter(repository)` on `express()` with `express.json()` and drive it with Supertest; the repository is an object of `vi.fn()` mocks. See `backend/tests/router.test.ts`.
- `validators.ts` and `mappers.ts` carry a 100% per-file coverage threshold: cover every branch there.
- Assert observable behaviour: status codes, response bodies, the arguments passed to the repository. Do not assert implementation details or snapshot whole objects you did not construct.

## Running

Run only through the sandbox wrapper, from the repository root, one test file at a time, with exactly this command (any other form is denied):

    node ../main/.github/scripts/run-tests.mjs backend/tests/router.test.ts

A test file that fails 3 times after your fixes is not committed. Record it as `suspected_defect` or `intent_unclear` (see `analyze-changes`).
