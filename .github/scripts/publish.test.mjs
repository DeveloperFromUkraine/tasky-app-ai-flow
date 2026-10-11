import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { publish, github } from './publish.mjs'
import { MARKER } from './report.mjs'
import { samples, fakeSecrets } from './test-fixtures.mjs'

const sha = samples.gate.head_sha
const patch = 'diff --git a/backend/tests/a.test.ts b/backend/tests/a.test.ts\nnew file mode 100644\n--- /dev/null\n+++ b/backend/tests/a.test.ts\n@@ -0,0 +1 @@\n+it("x", () => {})\n'
const sha256 = (s) => createHash('sha256').update(s).digest('hex')

function fakeGh({ files = [{ filename: 'backend/src/a.ts', status: 'modified' }], head = sha, base = 'main', refMoves = false, role = 'maintain', onMain = true, ownCommit = false, existingBackfill = null } = {}) {
  const calls = []
  return {
    calls,
    prFiles: async () => files,
    prHead: async () => ({ sha: head, ref: 'feature/x', base }),
    role: async (login) => { calls.push(['role', login]); return role },
    onMain: async () => onMain,
    findPull: async (branch) => { calls.push(['find', branch]); return existingBackfill },
    isOwnCommitOn: async (c, parent) => ownCommit && c === head && parent === sha,
    commitFiles: async ({ branch, parent, files: f }) => { calls.push(['commit', branch, parent, f.map((x) => x.path)]); return refMoves ? null : 'e'.repeat(40) },
    createBranch: async (name, at) => { calls.push(['branch', name, at]) },
    openPull: async (o) => { calls.push(['pull', o.head, o.title]); return 99 },
    upsertReport: async (n, body) => { calls.push(['report', n, body]) },
    createCheck: async (o) => { calls.push(['check', o.head_sha, o.conclusion]) },
  }
}
const artifacts = (over = {}) => ({
  gate: structuredClone(samples.gate), decisions: structuredClone(samples.decisions),
  results: { ...structuredClone(samples.results), patch_sha256: sha256(patch) }, patch, filteredPatch: patch, ...over,
})
const run = (over = {}) => ({ conclusion: 'success', headSha: sha, event: 'pull_request', headBranch: 'feature/x', prNumbers: [7], actor: 'dev', ...over })
const dispatch = (over = {}) => run({ event: 'workflow_dispatch', headBranch: 'main', prNumbers: [], actor: 'boss', ...over })
const backfillArtifacts = () => {
  const a = artifacts(); for (const k of ['gate', 'decisions', 'results']) Object.assign(a[k], { mode: 'backfill' })
  Object.assign(a.gate, { pr_number: null, base_sha: sha })
  return a
}
const nothingWritten = (gh) => !gh.calls.some((c) => ['commit', 'pull', 'report', 'check'].includes(c[0]))
const applyPatch = async (text) => (text ? [{ path: 'backend/tests/a.test.ts', content: 'it("x", () => {})\n' }] : [])
const report = (gh) => gh.calls.find((c) => c[0] === 'report')
const go = async (gh, a = artifacts(), r = run()) => publish({ run: r, artifacts: a, gh, applyPatch })

test('happy path commits stable tests, reports and sets the check', async () => {
  const gh = fakeGh()
  const out = await go(gh)
  assert.equal(out.code, 'test_agent.committed')
  assert.deepEqual(gh.calls[0], ['commit', 'feature/x', sha, ['backend/tests/a.test.ts']])
  assert.ok(report(gh)[2].startsWith(MARKER))
  assert.deepEqual(gh.calls.find((c) => c[0] === 'check'), ['check', 'e'.repeat(40), 'success'])
})

test('cancelled runs and gate stops do nothing at all', async () => {
  for (const [a, r] of [[artifacts(), run({ conclusion: 'cancelled' })], [artifacts({ gate: null }), run()]]) {
    const gh = fakeGh()
    assert.equal((await go(gh, a, r)).code, null)
    assert.deepEqual(gh.calls, [])
  }
})

test('rule paths in the pull request make every artifact untrusted', async () => {
  const gh = fakeGh({ files: [{ filename: '.github/workflows/test-agent.yml', status: 'modified' }, { filename: 'backend/src/a.ts', status: 'modified' }] })
  const a = artifacts(); a.gate.decision = 'run' // a forged gate would say run
  assert.equal((await go(gh, a)).code, 'test_agent.skipped_rule_paths_changed')
  assert.ok(!gh.calls.some((c) => c[0] === 'commit'))
})

test('gate skip posts the notice', async () => {
  const a = artifacts({ decisions: null, results: null }); Object.assign(a.gate, { decision: 'skip', skip_reason: 'no_testable_change' })
  const gh = fakeGh()
  assert.equal((await go(gh, a)).code, 'test_agent.skipped_no_testable_change')
  assert.match(report(gh)[2], /no testable change/)
})

test('patch rule violations reject the whole run', async () => {
  const bad = patch.replaceAll('backend/tests/a.test.ts', 'backend/src/a.ts')
  const gh = fakeGh()
  assert.equal((await go(gh, artifacts({ patch: bad, filteredPatch: bad, results: { ...structuredClone(samples.results), patch_sha256: sha256(bad) } }))).code, 'test_agent.path_not_allowed')
  assert.ok(!gh.calls.some((c) => c[0] === 'commit'))
  assert.deepEqual(gh.calls.find((c) => c[0] === 'check').slice(2), ['neutral'])
})

test('secret in model text is rejected', async () => {
  const a = artifacts(); a.decisions.files[0].reason = `token ${fakeSecrets.githubApp}`
  assert.equal((await go(fakeGh(), a)).code, 'test_agent.secret_detected')
})

test('invalid or mismatched artifacts are rejected', async () => {
  const a = artifacts(); a.results.patch_sha256 = 'd'.repeat(64)
  assert.equal((await go(fakeGh(), a)).code, 'test_agent.artifact_invalid')
  const b = artifacts(); b.decisions.extra = 1
  assert.equal((await go(fakeGh(), b)).code, 'test_agent.artifact_invalid')
  const c = artifacts({ filteredPatch: patch.replaceAll('a.test.ts', 'z.test.ts') }) // filtered must be a subset
  assert.equal((await go(fakeGh(), c)).code, 'test_agent.artifact_invalid')
  assert.equal((await go(fakeGh(), artifacts(), run({ headSha: 'f'.repeat(40) }))).code, 'test_agent.artifact_invalid')
})

test('missing agent or verify output means not completed', async () => {
  assert.equal((await go(fakeGh(), artifacts({ decisions: null }))).code, 'test_agent.not_completed')
  assert.equal((await go(fakeGh(), artifacts({ results: null }))).code, 'test_agent.not_completed')
  const a = artifacts(); Object.assign(a.decisions, { completed: false, not_completed_reason: 'spend_limit' })
  const gh = fakeGh()
  assert.equal((await go(gh, a)).code, 'test_agent.not_completed')
  assert.ok(!gh.calls.some((c) => c[0] === 'commit'))
})

test('time or attempt limit commits the stable tests and says so', async () => {
  const a = artifacts(); Object.assign(a.decisions, { completed: false, not_completed_reason: 'time_limit' })
  const gh = fakeGh()
  assert.equal((await go(gh, a)).code, 'test_agent.limit_reached')
  assert.ok(gh.calls.some((c) => c[0] === 'commit'))
})

test('head moved before or during the commit → outdated, nothing committed', async () => {
  const gh = fakeGh({ head: 'f'.repeat(40) })
  assert.equal((await go(gh)).code, 'test_agent.outdated')
  assert.ok(!gh.calls.some((c) => c[0] === 'commit'))
  assert.equal((await go(fakeGh({ refMoves: true }))).code, 'test_agent.outdated')
})

test('nothing stable to commit still reports, without a commit', async () => {
  const gh = fakeGh()
  const out = await go(gh, artifacts({ filteredPatch: '' }))
  assert.equal(out.code, 'test_agent.committed')
  assert.ok(!gh.calls.some((c) => c[0] === 'commit'))
  assert.ok(report(gh))
})

test('backfill creates a branch, commits and opens a pull request with the report', async () => {
  const a = backfillArtifacts()
  a.results.coverage.backend = { ...a.results.coverage.backend, diff: null, package_before_pct: 33, package_after_pct: 81 }
  const gh = fakeGh()
  const out = await go(gh, a, dispatch())
  assert.equal(out.code, 'test_agent.committed')
  const [, branch, parent] = gh.calls.find((c) => c[0] === 'commit')
  assert.match(branch, /^test-agent\/backfill-backend-1$/)
  assert.equal(parent, sha)
  assert.deepEqual(gh.calls.find((c) => c[0] === 'pull').slice(1), [branch, 'test-agent: backfill backend'])
  assert.equal(report(gh)[1], 99)
  assert.match(report(gh)[2], /33% → 81%/)
})

test('the filtered patch must consist of blocks of the checked patch, byte for byte', async () => {
  const forged = patch.replace('it("x", () => {})', 'process.env.X = 1')
  const gh = fakeGh()
  assert.equal((await go(gh, artifacts({ filteredPatch: forged }))).code, 'test_agent.artifact_invalid')
  assert.ok(!gh.calls.some((c) => c[0] === 'commit'))
})

test('committed contents are scanned for secrets, not just the patch text', async () => {
  const gh = fakeGh()
  const leaky = async () => [{ path: 'backend/tests/a.test.ts', content: `const t = "${fakeSecrets.githubApp}"\n` }]
  const out = await publish({ run: run(), artifacts: artifacts(), gh, applyPatch: leaky })
  assert.equal(out.code, 'test_agent.secret_detected')
  assert.ok(!gh.calls.some((c) => c[0] === 'commit'))
})

test('a patch that cannot be applied as regular files is rejected, not crashed on', async () => {
  const gh = fakeGh()
  const symlink = async () => { throw new Error('not a regular file inside the checkout: backend/tests/a.test.ts') }
  assert.equal((await publish({ run: run(), artifacts: artifacts(), gh, applyPatch: symlink })).code, 'test_agent.artifact_invalid')
  assert.ok(!gh.calls.some((c) => c[0] === 'commit'))
})

test('a pull-request run cannot pass itself off as a backfill (ADR-0002: identity comes from the run)', async () => {
  const gh = fakeGh({ files: [{ filename: '.github/workflows/test-agent.yml', status: 'modified' }] })
  const out = await go(gh, backfillArtifacts(), run())
  assert.equal(out.code, null)
  assert.ok(nothingWritten(gh))
})

test('a pull-request gate naming a pull request outside the run, or a base other than main, does nothing', async () => {
  const a = artifacts(); a.gate.pr_number = 8
  const gh = fakeGh()
  assert.equal((await go(gh, a)).code, null)
  assert.ok(nothingWritten(gh))
  const gh2 = fakeGh({ base: 'release' })
  assert.equal((await go(gh2)).code, null)
  assert.ok(nothingWritten(gh2))
})

test('a backfill runs only from main, by a maintainer, on a commit of main', async () => {
  for (const [r, opts] of [[dispatch({ headBranch: 'feature/x' }), {}], [dispatch(), { role: 'write' }], [dispatch(), { onMain: false }]]) {
    const gh = fakeGh(opts)
    assert.equal((await go(gh, backfillArtifacts(), r)).code, null)
    assert.ok(nothingWritten(gh))
  }
  const gh = fakeGh()
  await go(gh, backfillArtifacts(), dispatch({ actor: 'rerunner' }))
  assert.deepEqual(gh.calls.find((c) => c[0] === 'role'), ['role', 'rerunner'])
})

test('a dispatch run with a pull-request gate does nothing', async () => {
  const gh = fakeGh()
  assert.equal((await go(gh, artifacts(), dispatch())).code, null)
  assert.ok(nothingWritten(gh))
})

test('the report upsert edits only the App bot\'s own comment', async () => {
  const comments = [{ id: 1, user: { type: 'Bot', login: 'github-actions[bot]' }, body: `${MARKER} spoof` }, { id: 2, user: { type: 'Bot', login: 'taskly-test-agent[bot]' }, body: `${MARKER} old` }]
  const seen = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, { method }) => {
    seen.push(`${method} ${new URL(url).pathname}`)
    return { ok: true, status: 200, json: async () => (method === 'GET' ? comments : {}) }
  }
  try {
    await github('t', 'o/r', 'taskly-test-agent[bot]').upsertReport(7, `${MARKER} new`)
  } finally { globalThis.fetch = realFetch }
  assert.deepEqual(seen, ['GET /repos/o/r/issues/7/comments', 'PATCH /repos/o/r/issues/comments/2'])
})

test('a re-run after the agent already committed leaves the earlier result alone (events.md idempotency)', async () => {
  const gh = fakeGh({ head: 'e'.repeat(40), ownCommit: true })
  const out = await go(gh)
  assert.equal(out.code, null)
  assert.ok(nothingWritten(gh))
})

test('the GitHub client refuses to run without the App bot login', () => {
  assert.throws(() => github('t', 'o/r', ''), /BOT_LOGIN/)
  assert.throws(() => github('t', 'o/r', undefined), /BOT_LOGIN/)
})

test('an author fixture that looks like a secret does not reject the run; agent-added secrets still do', async () => {
  const jwt = fakeSecrets.jwt
  const edit = 'diff --git a/backend/tests/a.test.ts b/backend/tests/a.test.ts\nindex 1111111..2222222 100644\n--- a/backend/tests/a.test.ts\n+++ b/backend/tests/a.test.ts\n@@ -1 +1,2 @@\n const t = "x"\n+it("y", () => {})\n'
  const a = artifacts({ patch: edit, filteredPatch: edit }); a.results.patch_sha256 = sha256(edit)
  const withFixture = async () => [{ path: 'backend/tests/a.test.ts', content: `const t = "${jwt}"\nit("y", () => {})\n` }]
  const gh = fakeGh()
  assert.equal((await publish({ run: run(), artifacts: a, gh, applyPatch: withFixture })).code, 'test_agent.committed')
})

test('a backfill re-run finds its pull request and updates the report instead of failing', async () => {
  const gh = fakeGh({ existingBackfill: { number: 55, sha: 'd'.repeat(40) } })
  const out = await go(gh, backfillArtifacts(), dispatch())
  assert.equal(out.code, 'test_agent.committed')
  assert.ok(!gh.calls.some((c) => c[0] === 'commit' || c[0] === 'pull'))
  assert.equal(report(gh)[1], 55)
  assert.deepEqual(gh.calls.find((c) => c[0] === 'check').slice(1, 2), ['d'.repeat(40)])
})
