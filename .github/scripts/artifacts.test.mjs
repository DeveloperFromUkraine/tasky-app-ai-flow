import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateGate, validateDecisions, validateResults, sameHead } from './artifacts.mjs'

import { samples } from './test-fixtures.mjs'

const sha = 'a'.repeat(40)
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

test('an unstable file names either the failed run or the failed check, never both or neither', () => {
  const r = (u) => ({ ...structuredClone(samples.results), unstable_test_files: [u] })
  assert.deepEqual(validateResults(r({ path: 'backend/tests/a.test.ts', failed_check: 'typecheck' })), [])
  assert.deepEqual(validateResults(r({ path: 'backend/tests/a.test.ts', failed_run: 2 })), [])
  assert.ok(validateResults(r({ path: 'backend/tests/a.test.ts' })).length)
  assert.ok(validateResults(r({ path: 'backend/tests/a.test.ts', failed_run: 2, failed_check: 'format' })).length)
  assert.ok(validateResults(r({ path: 'backend/tests/a.test.ts', failed_check: 'lint' })).length)
})
