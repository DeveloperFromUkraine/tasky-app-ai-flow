import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WRITABLE } from './sandbox.mjs'
import { COVERAGE_CMD, parseVitestJson, assembleResults } from './verify.mjs'
import { validateResults } from './artifacts.mjs'
import { samples } from './test-fixtures.mjs'

test('parseVitestJson reads pass/fail counts, and missing output counts as nothing measured', () => {
  assert.deepEqual(parseVitestJson('{"numPassedTests":12,"numFailedTests":1,"numTotalTests":13}'), { passed: 12, failed: 1 })
  assert.deepEqual(parseVitestJson(''), { passed: 0, failed: 0 })
  assert.deepEqual(parseVitestJson('not json'), { passed: 0, failed: 0 })
})

test('assembleResults builds a valid results.json from measured parts', () => {
  const cov = samples.results.coverage
  const r = assembleResults({
    gate: samples.gate, patchSha: 'c'.repeat(64),
    stability: { kept: ['backend/tests/a.test.ts'], unstable: [{ path: 'backend/tests/b.test.ts', failed_run: 2 }] },
    tests: { backend: { passed: 3, failed: 0 }, frontend: { passed: 0, failed: 0 } },
    coverage: cov,
  })
  assert.deepEqual(validateResults(r), [])
  assert.deepEqual([r.head_sha, r.run_id, r.mode], [samples.gate.head_sha, samples.gate.run_id, samples.gate.mode])
  assert.deepEqual(r.unstable_test_files, [{ path: 'backend/tests/b.test.ts', failed_run: 2 }])
})

test('coverage is written below a writable mount, never to the mount point vitest would rm -rf', () => {
  const dir = COVERAGE_CMD.find((a) => a.startsWith('--coverage.reportsDirectory='))?.split('=')[1]
  const out = COVERAGE_CMD.find((a) => a.startsWith('--outputFile='))?.split('=')[1]
  assert.ok(dir && WRITABLE.some((w) => dir.startsWith(`${w}/`)), dir)
  assert.ok(out && WRITABLE.some((w) => out.startsWith(`${w}/`)), out)
})
