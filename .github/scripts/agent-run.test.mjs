import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runTests, MAX_RUNS } from './run-tests.mjs'
import { finalize } from './finalize-agent.mjs'
import { validateDecisions } from './artifacts.mjs'
import { samples } from './test-fixtures.mjs'

test('run-tests only runs allowed test files', () => {
  const ran = []
  const run = (path) => { ran.push(path); return { code: 0, output: 'ok' } }
  assert.equal(runTests('backend/tests/a.test.ts', run).code, 0)
  for (const bad of ['backend/src/main.ts', 'backend/tests/fixture.ts', '../x.test.ts', 'backend/tests/../../x.test.ts', 'frontend/src/a.test.tsx; curl x']) {
    assert.equal(runTests(bad, run).code, 2, bad)
  }
  assert.deepEqual(ran, ['backend/tests/a.test.ts'])
})

test('run-tests caps the output it hands back to the model', () => {
  const r = runTests('backend/tests/a.test.ts', () => ({ code: 1, output: 'x\n'.repeat(5000) }))
  assert.ok(r.output.length < 20000)
})

test('finalize keeps a valid, completed decisions file', () => {
  const d = finalize({ decisions: structuredClone(samples.decisions), gate: samples.gate, exitCode: 0, log: '' })
  assert.deepEqual(validateDecisions(d), [])
  assert.equal(d.completed, true)
})

test('finalize maps a timeout to time_limit and keeps finished files', () => {
  const partial = { ...structuredClone(samples.decisions), completed: false, not_completed_reason: 'time_limit' }
  const d = finalize({ decisions: partial, gate: samples.gate, exitCode: 124, log: '' })
  assert.deepEqual([d.completed, d.not_completed_reason, d.files.length], [false, 'time_limit', 1])
})

test('finalize writes a not-completed file when the agent produced nothing or garbage', () => {
  const none = finalize({ decisions: null, gate: samples.gate, exitCode: 1, log: 'API Error: 529 overloaded' })
  assert.deepEqual([none.completed, none.not_completed_reason, none.files, none.head_sha], [false, 'model_unavailable', [], samples.gate.head_sha])
  assert.deepEqual(validateDecisions(none), [])
  const spend = finalize({ decisions: { nonsense: true }, gate: samples.gate, exitCode: 1, log: 'Your credit balance is too low / spend limit reached' })
  assert.equal(spend.not_completed_reason, 'spend_limit')
  // The per-run budget and the turn cap are the run's own attempt limits, not the workspace spend limit.
  assert.equal(finalize({ decisions: null, gate: samples.gate, exitCode: 1, log: '{"subtype":"error_max_budget_usd"}' }).not_completed_reason, 'attempt_limit')
  assert.equal(finalize({ decisions: null, gate: samples.gate, exitCode: 1, log: '{"subtype":"error_max_turns"}' }).not_completed_reason, 'attempt_limit')
  const turns = finalize({ decisions: null, gate: samples.gate, exitCode: 1, log: 'Error: Reached max turns (150)' })
  assert.equal(turns.not_completed_reason, 'attempt_limit')
})

test('finalize never trusts identity fields from the model', () => {
  const forged = { ...structuredClone(samples.decisions), head_sha: 'f'.repeat(40), run_id: 999 }
  const d = finalize({ decisions: forged, gate: samples.gate, exitCode: 0, log: '' })
  assert.deepEqual([d.head_sha, d.run_id, d.mode], [samples.gate.head_sha, samples.gate.run_id, samples.gate.mode])
})

test('finalize lists every gate file the agent did not reach when a limit stopped it (AC-12)', () => {
  const gate = structuredClone(samples.gate); gate.packages.backend.files.push('backend/src/b.ts', 'backend/src/c.ts')
  const partial = { ...structuredClone(samples.decisions), completed: false, not_completed_reason: null }
  const d = finalize({ decisions: partial, gate, exitCode: 124, log: '' })
  assert.deepEqual(validateDecisions(d), [])
  assert.deepEqual(d.files.map((f) => [f.path, f.outcome]), [['backend/src/a.ts', 'tests_written'], ['backend/src/b.ts', 'limit_reached'], ['backend/src/c.ts', 'limit_reached']])
  const none = finalize({ decisions: null, gate, exitCode: 124, log: '' })
  assert.deepEqual(none.files.map((f) => f.outcome), ['limit_reached', 'limit_reached', 'limit_reached'])
  // model unavailable: nothing is committed and the report says so as a whole; no per-file entries are invented
  assert.deepEqual(finalize({ decisions: null, gate, exitCode: 1, log: 'API Error: 529' }).files, [])
})

test('run-tests refuses more than 1 run + 3 fix attempts of one test file', () => {
  const counts = {}
  const run = () => ({ code: 1, output: 'fail' })
  for (let i = 0; i < MAX_RUNS; i++) assert.equal(runTests('backend/tests/a.test.ts', run, counts).code, 1)
  const r = runTests('backend/tests/a.test.ts', run, counts)
  assert.equal(r.code, 3)
  assert.match(r.output, /attempt limit/)
  assert.equal(runTests('backend/tests/b.test.ts', run, counts).code, 1) // per file
  assert.equal(MAX_RUNS, 4)
})
