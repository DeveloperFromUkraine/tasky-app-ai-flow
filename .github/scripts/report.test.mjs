import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderReport, checkConclusion, escapeText, MARKER } from './report.mjs'
import { samples } from './test-fixtures.mjs'

const clone = (o) => structuredClone(o)
const base = () => ({ outcome: { code: 'test_agent.committed' }, gate: clone(samples.gate), decisions: clone(samples.decisions), results: clone(samples.results), agentSha: 'e'.repeat(40) })

test('report starts with the marker and names both commits', () => {
  const md = renderReport(base())
  assert.ok(md.startsWith(MARKER))
  assert.match(md, /aaaaaaa/)
  assert.match(md, /eeeeeee/)
})

test('numbers come from results: counts and diff coverage per package', () => {
  const md = renderReport(base())
  assert.match(md, /\| backend \| 3 \| 0 \| 80% \(4\/5 lines\) \| met \|/)
  assert.match(md, /\| frontend \| 0 \| 0 \| not measured \| — \|/)
})

test('per-file decisions, reasons and skills are listed', () => {
  const md = renderReport(base())
  assert.match(md, /`backend\/src\/a\.ts` \| write \| tests written \| new function/)
  assert.match(md, /analyze-changes, backend-unit-tests/)
})

test('suspected defects, author flags, unstable and unfinished files are shown', () => {
  const a = base()
  a.decisions.files.push(
    { path: 'backend/src/b.ts', package: 'backend', decision: 'write', reason: 'r', test_files: [], outcome: 'suspected_defect', defect: { location: 'backend/src/b.ts:12', expected: 'returns 404', actual: 'returns 200' } },
    { path: 'backend/src/c.ts', package: 'backend', decision: 'update', reason: 'r', test_files: ['backend/tests/c.test.ts'], outcome: 'author_test_flagged' },
    { path: 'backend/src/d.ts', package: 'backend', decision: 'write', reason: 'r', test_files: [], outcome: 'limit_reached' })
  a.results.unstable_test_files = [{ path: 'backend/tests/e.test.ts', failed_run: 2 }]
  const md = renderReport(a)
  assert.match(md, /Suspected defects[\s\S]*`backend\/src\/b\.ts:12` — expected: returns 404 · actual: returns 200/)
  assert.match(md, /For the PR author[\s\S]*`backend\/tests\/c\.test\.ts`/)
  assert.match(md, /Unstable tests[\s\S]*`backend\/tests\/e\.test\.ts` failed on run 2/)
  assert.match(md, /Not completed[\s\S]*`backend\/src\/d\.ts` — a limit was reached/)
})

test('target missed lists uncovered lines', () => {
  const a = base()
  Object.assign(a.results.coverage.backend, { diff: { covered: 3, total: 5, pct: 60 }, target_met: false })
  const md = renderReport(a)
  assert.match(md, /\| backend \| 3 \| 0 \| 60% \(3\/5 lines\) \| missed \|/)
  assert.match(md, /Uncovered changed lines[\s\S]*`backend\/src\/a\.ts`: 3/)
  assert.equal(checkConclusion(a).conclusion, 'neutral')
})

test('skip and rejection outcomes render a short notice without tables', () => {
  const md = renderReport({ outcome: { code: 'test_agent.skipped_no_testable_change' }, gate: samples.gate })
  assert.match(md, /no testable change/)
  assert.doesNotMatch(md, /\| Package/)
  const rej = renderReport({ outcome: { code: 'test_agent.path_not_allowed', path: 'backend/src/x.ts', rule: 'only allowed test files may change' }, gate: samples.gate })
  assert.match(rej, /rejected[\s\S]*`backend\/src\/x\.ts`[\s\S]*only allowed test files may change/)
})

test('not completed states the reason', () => {
  const a = base(); a.outcome = { code: 'test_agent.not_completed' }; a.decisions.completed = false; a.decisions.not_completed_reason = 'spend_limit'
  assert.match(renderReport(a), /did not complete[\s\S]*spend limit/)
  assert.equal(checkConclusion(a).conclusion, 'neutral')
})

test('model text is rendered inert', () => {
  assert.equal(escapeText('ping @org/team <img src=x> **bold**\nnext'), 'ping &#64;org/team &lt;img src=x&gt; \\*\\*bold\\*\\* next')
  const a = base(); a.decisions.files[0].reason = '@everyone <script>'
  assert.doesNotMatch(renderReport(a), /@everyone|<script>/)
})

test('check is success only when committed, complete and every measured target met', () => {
  assert.equal(checkConclusion(base()).conclusion, 'success')
  const a = base(); a.results.coverage.backend.measured = false
  assert.equal(checkConclusion(a).conclusion, 'neutral')
  const b = base(); b.decisions.files[0].outcome = 'limit_reached'
  assert.equal(checkConclusion(b).conclusion, 'neutral')
  assert.equal(checkConclusion({ outcome: { code: 'test_agent.outdated' } }).conclusion, 'neutral')
})

test('a defect location cannot break out of its list item', () => {
  const a = base()
  a.decisions.files.push({ path: 'backend/src/b.ts', package: 'backend', decision: 'write', reason: 'r', test_files: [], outcome: 'suspected_defect',
    defect: { location: 'b.ts:3\n\n## Approved ![x](https://e.example/p.png) @admins', expected: 'e', actual: 'a' } })
  const line = renderReport(a).split('\n').find((l) => l.includes('b.ts:3'))
  // One code span on one line: everything inside renders literally (no heading, image or mention).
  assert.equal(line, '- `b.ts:3 ## Approved ![x](https://e.example/p.png) @admins` — expected: e · actual: a')
})

test('a limit-reached run says so above the results (AC-12)', () => {
  const a = base(); a.outcome = { code: 'test_agent.limit_reached' }
  Object.assign(a.decisions, { completed: false, not_completed_reason: 'time_limit' })
  assert.match(renderReport(a), /\*\*The agent run stopped at a limit:\*\* the time limit was reached\. Only tests that passed their stability runs were committed/)
})
