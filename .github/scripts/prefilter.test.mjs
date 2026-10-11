import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify, decide } from './prefilter.mjs'

const repo = 'acme/taskly'
const pr = (over = {}) => ({
  mode: 'pull_request', repo, headRepo: repo, baseRef: 'main', senderLogin: 'alice', botLogin: 'taskly-test-agent[bot]',
  files: [{ filename: 'backend/src/features/todos/router.ts', status: 'modified' }], ...over,
})

test('classify keeps production sources and drops the pre-filter list', () => {
  const out = classify([
    'backend/src/features/todos/router.ts', 'frontend/src/features/todos/components/TodoItem.tsx',
    'README.md', 'docs/x.md', 'frontend/src/design-system/components/Button.tsx',
    'frontend/src/features/todos/components/TodoItem.stories.tsx', 'backend/src/features/todos/types.ts',
    'frontend/src/vite-env.d.ts', 'backend/src/generated/prisma/client.ts', 'package.json', 'backend/package-lock.json',
    'backend/prisma/schema.prisma', 'backend/Dockerfile', 'backend/vitest.config.ts', 'backend/tests/router.test.ts',
    'frontend/src/features/todos/components/TodoItem.test.tsx', 'frontend/src/test/setup.ts',
  ])
  assert.deepEqual(out, {
    backend: ['backend/src/features/todos/router.ts'],
    frontend: ['frontend/src/features/todos/components/TodoItem.tsx'],
  })
})

test('mixed docs and source runs with only the source', () => {
  const d = decide(pr({ files: [{ filename: 'README.md', status: 'modified' }, { filename: 'backend/src/main.ts', status: 'modified' }] }))
  assert.equal(d.decision, 'run')
  assert.deepEqual(d.packages.backend.files, ['backend/src/main.ts'])
})

test('rule paths skip the run', () => {
  const d = decide(pr({ files: [{ filename: '.claude/skills/x/SKILL.md', status: 'added' }, { filename: 'backend/src/main.ts', status: 'modified' }] }))
  assert.deepEqual([d.decision, d.skip_reason], ['skip', 'rule_paths_changed'])
  assert.equal(decide(pr({ files: [{ filename: '.github/workflows/x.yml', status: 'modified' }] })).skip_reason, 'rule_paths_changed')
  for (const f of ['CLAUDE.md', 'backend/CLAUDE.md', 'CLAUDE.local.md', '.mcp.json', 'frontend/.mcp.json']) {
    assert.equal(decide(pr({ files: [{ filename: f, status: 'added' }, { filename: 'backend/src/main.ts', status: 'modified' }] })).skip_reason, 'rule_paths_changed', f)
  }
})

test('no testable change skips', () => {
  const d = decide(pr({ files: [{ filename: 'package.json', status: 'modified' }, { filename: 'backend/package-lock.json', status: 'modified' }] }))
  assert.deepEqual([d.decision, d.skip_reason], ['skip', 'no_testable_change'])
})

test('fork, non-main base and bot commits stop', () => {
  assert.deepEqual(pick(decide(pr({ headRepo: 'mallory/taskly' }))), ['stop', 'fork'])
  assert.deepEqual(pick(decide(pr({ baseRef: 'develop' }))), ['stop', 'non_main_base'])
  assert.deepEqual(pick(decide(pr({ senderLogin: 'taskly-test-agent[bot]' }))), ['stop', 'bot_commit'])
})

test('author test files are the allowed test files changed in the diff, not deleted', () => {
  const d = decide(pr({ files: [
    { filename: 'backend/src/main.ts', status: 'modified' },
    { filename: 'backend/tests/router.test.ts', status: 'modified' },
    { filename: 'frontend/src/a/B.test.tsx', status: 'added' },
    { filename: 'backend/tests/old.test.ts', status: 'removed' },
    { filename: 'backend/tests/fixture.ts', status: 'modified' },
  ] }))
  assert.deepEqual(d.author_test_files, ['backend/tests/router.test.ts', 'frontend/src/a/B.test.tsx'])
})

test('backfill needs admin or maintain and lists the whole package', () => {
  const bf = (over) => ({ mode: 'backfill', repo, ref: 'refs/heads/main', package: 'frontend', role: 'maintain',
    files: [{ filename: 'frontend/src/lib/http.ts' }, { filename: 'frontend/src/design-system/index.ts' }, { filename: 'backend/src/main.ts' }], ...over })
  assert.deepEqual(pick(decide(bf({ role: 'write' }))), ['stop', 'not_maintainer'])
  assert.deepEqual(pick(decide(bf({ package: 'infra' }))), ['stop', 'invalid_package'])
  assert.deepEqual(pick(decide(bf({ ref: 'refs/heads/feature' }))), ['stop', 'non_main_base'])
  const d = decide(bf({ role: 'admin' }))
  assert.equal(d.decision, 'run')
  assert.deepEqual(d.packages, { backend: { files: [] }, frontend: { files: ['frontend/src/lib/http.ts'] } })
  assert.deepEqual(d.author_test_files, [])
})

function pick(d) { return [d.decision, d.stop_reason] }
