import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLcov, parseDiff, coverage } from './diff-coverage.mjs'

// lcov as vitest writes it: SF relative to the package (or absolute inside the sandbox mount).
const lcov = [
  'TN:', 'SF:src/a.ts', 'DA:1,1', 'DA:2,1', 'DA:3,0', 'DA:4,1', 'DA:5,1', 'LF:5', 'LH:4', 'end_of_record',
  'TN:', 'SF:/w/backend/src/b.ts', 'DA:1,0', 'DA:2,0', 'LF:2', 'LH:0', 'end_of_record',
].join('\n')

const diff = [
  'diff --git a/backend/src/a.ts b/backend/src/a.ts', '--- a/backend/src/a.ts', '+++ b/backend/src/a.ts',
  '@@ -0,0 +1,5 @@', '+l1', '+l2', '+l3', '+l4', '+l5', '@@ -9 +10,2 @@', '-x', '+l10', '+l11',
  'diff --git a/backend/src/b.ts b/backend/src/b.ts', '--- a/backend/src/b.ts', '+++ b/backend/src/b.ts', '@@ -1 +1 @@', '-y', '+z',
].join('\n')

test('parseLcov normalises paths to repo-relative and keeps line hits', () => {
  const m = parseLcov(lcov, 'backend')
  assert.deepEqual([...m.keys()], ['backend/src/a.ts', 'backend/src/b.ts'])
  assert.equal(m.get('backend/src/a.ts').get(3), 0)
})

test('parseDiff returns added line numbers on the new side', () => {
  assert.deepEqual(parseDiff(diff).get('backend/src/a.ts'), [1, 2, 3, 4, 5, 10, 11])
})

test('diff coverage counts only instrumented changed lines of testable, non-skipped files', () => {
  const r = coverage({ mode: 'pull_request', pkg: 'backend', lcov, diff, files: ['backend/src/a.ts', 'backend/src/b.ts'], skipped: ['backend/src/b.ts'] })
  assert.deepEqual(r.diff, { covered: 4, total: 5, pct: 80 })
  assert.equal(r.measured, true)
  assert.equal(r.target_met, true)
  assert.deepEqual(r.uncovered_lines, [{ file: 'backend/src/a.ts', lines: [3] }])
})

test('below target lists uncovered lines and misses the target', () => {
  const r = coverage({ mode: 'pull_request', pkg: 'backend', lcov, diff, files: ['backend/src/a.ts', 'backend/src/b.ts'], skipped: [] })
  assert.deepEqual(r.diff, { covered: 4, total: 6, pct: 66.7 })
  assert.equal(r.target_met, false)
  assert.deepEqual(r.uncovered_lines, [{ file: 'backend/src/a.ts', lines: [3] }, { file: 'backend/src/b.ts', lines: [1] }])
})

test('missing lcov means not measured, no number', () => {
  const r = coverage({ mode: 'pull_request', pkg: 'backend', lcov: null, diff, files: ['backend/src/a.ts'], skipped: [] })
  assert.deepEqual([r.measured, r.diff, r.target_met], [false, null, false])
})

test('no testable files in a package → not measured', () => {
  const r = coverage({ mode: 'pull_request', pkg: 'frontend', lcov, diff, files: [], skipped: [] })
  assert.deepEqual([r.measured, r.diff], [false, null])
})

test('changed lines that are not instrumented do not count', () => {
  const r = coverage({ mode: 'pull_request', pkg: 'backend', lcov, diff, files: ['backend/src/a.ts'], skipped: [] })
  assert.equal(r.diff.total, 5) // lines 10 and 11 have no DA record
  const none = coverage({ mode: 'pull_request', pkg: 'backend', lcov: 'TN:\nSF:src/a.ts\nend_of_record', diff, files: ['backend/src/a.ts'], skipped: [] })
  assert.deepEqual([none.diff.pct, none.target_met], [null, true])
})

test('backfill reports package line coverage before and after', () => {
  const r = coverage({ mode: 'backfill', pkg: 'backend', lcov, lcovBefore: 'TN:\nSF:src/a.ts\nDA:1,1\nDA:2,0\nend_of_record', diff: '', files: [], skipped: [] })
  assert.deepEqual([r.package_before_pct, r.package_after_pct, r.diff, r.measured], [50, 57.1, null, true])
  assert.equal(r.target_met, false)
})
