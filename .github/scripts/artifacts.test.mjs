import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateGate, validateDecisions, validateResults, sameHead } from './artifacts.mjs'

const sha = 'a'.repeat(40)
const head = { run_id: 1, mode: 'pull_request', head_sha: sha }
export const samples = {
  gate: { schema: 'test_agent.gate.v1', ...head, base_sha: 'b'.repeat(40), pr_number: 7, decision: 'run', skip_reason: null,
    packages: { backend: { files: ['backend/src/a.ts'] }, frontend: { files: [] } }, author_test_files: [] },
  decisions: { schema: 'test_agent.decisions.v1', ...head, completed: true, not_completed_reason: null, skills_used: ['analyze-changes', 'backend-unit-tests'],
    files: [{ path: 'backend/src/a.ts', package: 'backend', decision: 'write', reason: 'new function', test_files: ['backend/tests/a.test.ts'], outcome: 'tests_written' }] },
  results: { schema: 'test_agent.results.v1', ...head, patch_sha256: 'c'.repeat(64), kept_test_files: ['backend/tests/a.test.ts'], unstable_test_files: [],
    tests: { backend: { passed: 3, failed: 0 }, frontend: { passed: 0, failed: 0 } },
    coverage: {
      backend: { measured: true, diff: { covered: 4, total: 5, pct: 80 }, target_pct: 80, target_met: true, uncovered_lines: [{ file: 'backend/src/a.ts', lines: [3] }], package_before_pct: null, package_after_pct: null },
      frontend: { measured: false, diff: null, target_pct: 80, target_met: false, uncovered_lines: [], package_before_pct: null, package_after_pct: null } } },
}
const clone = (o) => structuredClone(o)

test('valid samples pass', () => {
  assert.deepEqual(validateGate(samples.gate), [])
  assert.deepEqual(validateDecisions(samples.decisions), [])
  assert.deepEqual(validateResults(samples.results), [])
})

test('unknown fields are rejected', () => {
  const d = clone(samples.decisions); d.files[0].coverage = 99
  assert.match(validateDecisions(d).join(), /files\[0\]\.coverage: unknown field/)
})

test('text caps and enums are enforced', () => {
  const d = clone(samples.decisions); d.files[0].reason = 'x'.repeat(501)
  assert.match(validateDecisions(d).join(), /reason: longer than 500/)
  const e = clone(samples.decisions); e.files[0].outcome = 'approved'
  assert.match(validateDecisions(e).join(), /outcome: not one of/)
})

test('suspected defect requires the defect block', () => {
  const d = clone(samples.decisions); d.files[0].outcome = 'suspected_defect'
  assert.match(validateDecisions(d).join(), /defect: required/)
  d.files[0].defect = { location: 'backend/src/a.ts:3', expected: 'x', actual: 'y' }
  assert.deepEqual(validateDecisions(d), [])
})

test('paths and shas are shape-checked', () => {
  const g = clone(samples.gate); g.head_sha = 'nope'
  assert.match(validateGate(g).join(), /head_sha/)
  const d = clone(samples.decisions); d.files[0].test_files = ['../../etc/passwd']
  assert.match(validateDecisions(d).join(), /test_files\[0\]/)
})

test('head commit must match across artifacts', () => {
  assert.equal(sameHead([samples.gate, samples.decisions, samples.results], sha), true)
  const r = clone(samples.results); r.head_sha = 'd'.repeat(40)
  assert.equal(sameHead([samples.gate, r], sha), false)
})
