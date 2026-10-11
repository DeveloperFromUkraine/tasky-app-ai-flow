---
name: frontend-unit-tests
description: Write or update Vitest + Testing Library unit tests for the taskly frontend (React 19, TanStack Query, styled-components) following this repository's conventions. Use for files under frontend/src.
---

# Frontend unit tests

## Where tests go

- Colocated: `frontend/src/<path>/<Name>.test.tsx` next to `<Name>.tsx` (`.test.ts` for non-JSX modules).
- You may create test files and add cases. You may change assertions only in tests from main when the analysis decided `update`. Never touch tests the PR author changed in this pull request, except to add new cases.
- **Never edit** `frontend/src/test/**` (setup, fixtures), `frontend/src/design-system/**` (including `mocks.tsx`), `vite.config.ts`, `package.json` or any non-test file. You may *import* `src/test/todoFixture`.

## Conventions (match the existing tests)

- Prettier style: no semicolons, single quotes, trailing commas, 80 columns.
- `import { render, screen } from '@testing-library/react'`, `userEvent.setup()`, `import { expect, it, vi } from 'vitest'`. jest-dom matchers are set up globally.
- Replace the design system in component tests: `vi.mock('<relative>/design-system', () => import('<relative>/design-system/mocks'))`. See `frontend/src/features/todos/components/TodoItem.test.tsx`.
- Query by role, label or visible text, not by class or test id.
- **API modules:** mock `lib/http`'s `request` with `vi.mock(..., () => ({ request: vi.fn() }))`. See `frontend/src/features/todos/api/todos.test.ts`.
- **`lib/http.ts` itself:** stub `fetch` with `vi.stubGlobal('fetch', vi.fn())` and restore it after each test.
- **Hooks using TanStack Query:** `renderHook` with a wrapper that provides a fresh `QueryClient({ defaultOptions: { queries: { retry: false } } })` created inside the test; mock the API object, not the network.
- Assert what the user sees or what is sent; no snapshots.

## Running

Run only through the sandbox wrapper named in your prompt, one test file at a time, for example:

    node <scripts>/run-tests.mjs frontend/src/features/todos/components/TodoItem.test.tsx

A test file that fails 3 times after your fixes is not committed. Record it as `suspected_defect` or `intent_unclear` (see `analyze-changes`).
