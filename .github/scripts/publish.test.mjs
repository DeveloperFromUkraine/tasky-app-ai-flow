import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { publish, github, gitApply, gitBlobSha } from './publish.mjs'
import { checkPatch } from './check-patch.mjs'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MARKER } from './report.mjs'
import { samples, fakeSecrets } from './test-fixtures.mjs'

const sha = samples.gate.head_sha
const patch = 'diff --git a/backend/tests/a.test.ts b/backend/tests/a.test.ts\nnew file mode 100644\n--- /dev/null\n+++ b/backend/tests/a.test.ts\n@@ -0,0 +1 @@\n+it("x", () => {})\n'
const sha256 = (s) => createHash('sha256').update(s).digest('hex')

function fakeGh({ files = [{ filename: 'backend/src/a.ts', status: 'modified' }], head = sha, base = 'main', refMoves = false, role = 'maintain', onMain = true, matching = [], existingBackfill = null, branchTaken = false } = {}) {
  const calls = []
  return {
    calls,
    prFiles: async () => files,
    prHead: async () => ({ sha: head, ref: 'feature/x', base }),
    role: async (login) => { calls.push(['role', login]); return role },
    onMain: async () => onMain,
    findPull: async (branch) => { calls.push(['find', branch]); return existingBackfill },
    parentOf: async (c) => (matching.includes(c) ? sha : 'f'.repeat(40)),
    commitMatches: async (c, parent, files) => { calls.push(['match', c, files.map((f) => f.path)]); return matching.includes(c) && parent === sha },
    commitFiles: async ({ branch, parent, files: f, create }) => { calls.push(['commit', branch, parent, f.map((x) => x.path)]); return refMoves || (create && branchTaken) ? null : 'e'.repeat(40) },
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
// Stands in for gitApply: the regenerated diff of a git-made patch is the patch itself.
const fakeApply = async (text) => ({ diff: text ?? '', files: text?.trim() ? [{ path: 'backend/tests/a.test.ts', content: 'it("x", () => {})\n' }] : [] })
const report = (gh) => gh.calls.find((c) => c[0] === 'report')
const go = async (gh, a = artifacts(), r = run()) => publish({ run: r, artifacts: a, gh, apply: fakeApply })

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
  const leaky = async (text) => ({ diff: text, files: [{ path: 'backend/tests/a.test.ts', content: `const t = "${fakeSecrets.githubApp}"\n` }] })
  const out = await publish({ run: run(), artifacts: artifacts(), gh, apply: leaky })
  assert.equal(out.code, 'test_agent.secret_detected')
  assert.ok(!gh.calls.some((c) => c[0] === 'commit'))
})

test('a patch that cannot be applied as regular files is rejected, not crashed on', async () => {
  const gh = fakeGh()
  const symlink = async () => { throw new Error('not a regular file inside the checkout: backend/tests/a.test.ts') }
  assert.equal((await publish({ run: run(), artifacts: artifacts(), gh, apply: symlink })).code, 'test_agent.artifact_invalid')
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
  const gh = fakeGh({ head: 'e'.repeat(40), matching: ['e'.repeat(40)] })
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
  const withFixture = async (text) => ({ diff: text, files: [{ path: 'backend/tests/a.test.ts', content: `const t = "${jwt}"\nit("y", () => {})\n` }] })
  const gh = fakeGh()
  assert.equal((await publish({ run: run(), artifacts: a, gh, apply: withFixture })).code, 'test_agent.committed')
})

test('a backfill re-run finds its pull request and updates the report instead of failing', async () => {
  const gh = fakeGh({ existingBackfill: { number: 55, sha: 'd'.repeat(40), open: true, byApp: true }, matching: ['d'.repeat(40)] })
  const out = await go(gh, backfillArtifacts(), dispatch())
  assert.equal(out.code, 'test_agent.committed')
  assert.ok(!gh.calls.some((c) => c[0] === 'commit' || c[0] === 'pull'))
  assert.equal(report(gh)[1], 55)
  assert.deepEqual(gh.calls.find((c) => c[0] === 'check').slice(1, 2), ['d'.repeat(40)])
})

test('a backfill branch taken by anyone but the App gets no commit, report or check', async () => {
  const own = { number: 55, sha: 'd'.repeat(40), open: true, byApp: true }
  for (const opts of [
    { existingBackfill: { ...own, byApp: false }, matching: [own.sha] }, // a collaborator's pull request
    { existingBackfill: { ...own, open: false }, matching: [own.sha] }, // closed or merged
    { existingBackfill: own, matching: [] }, // the App's PR, but someone pushed on top
    { branchTaken: true }, // a branch without a pull request
  ]) {
    const gh = fakeGh(opts)
    assert.equal((await go(gh, backfillArtifacts(), dispatch())).code, null, JSON.stringify(opts))
    assert.ok(!gh.calls.some((c) => ['pull', 'report', 'check'].includes(c[0])), JSON.stringify(opts))
  }
})

// --- gitApply: what publish checks is the diff git itself regenerates, never our reading of the text ---
const AUTHOR = 'backend/tests/author.test.ts'
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'pub-'))
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' })
  git('init', '-q'); mkdirSync(join(dir, 'backend/tests'), { recursive: true })
  writeFileSync(join(dir, AUTHOR), 'it("a", () => {\n  expect(1).toBe(1)\n})\n')
  git('add', '-A'); git('-c', 'user.name=x', '-c', 'user.email=x@x', 'commit', '-qm', 'base')
  return dir
}
const deletesAssertion = (dir, text) => checkPatch(gitApply(dir, text).diff, { authorTestFiles: [AUTHOR], texts: [] }).code
const removal = [`--- a/${AUTHOR}`, `+++ b/${AUTHOR}`, '@@ -1,3 +1,2 @@', ' it("a", () => {', '-  expect(1).toBe(1)', ' })']
const addition = [`diff --git a/${AUTHOR} b/${AUTHOR}`, `--- a/${AUTHOR}`, `+++ b/${AUTHOR}`, '@@ -3,0 +4 @@', '+// more']

test('gitApply: text before the first diff --git is caught through the regenerated diff', () => {
  assert.equal(deletesAssertion(repo(), [...removal, ...addition, ''].join('\n')), 'test_agent.author_assertion_changed')
})

test('gitApply: ---/+++ names that differ from the diff --git paths are caught', () => {
  const other = 'backend/tests/other.test.ts'
  const forged = [`diff --git a/${other} b/${other}`, ...removal, ...addition, ''].join('\n')
  const dir = repo(); writeFileSync(join(dir, other), 'x\n'); execFileSync('git', ['-C', dir, 'add', '-A']); execFileSync('git', ['-C', dir, '-c', 'user.name=x', '-c', 'user.email=x@x', 'commit', '-qm', 'o'])
  assert.equal(deletesAssertion(dir, forged), 'test_agent.author_assertion_changed')
})

test('gitApply: a block split off at a CR is caught (the tail a filter could keep)', () => {
  assert.equal(deletesAssertion(repo(), [`diff --git a/${AUTHOR} b/${AUTHOR}`, ...removal, ''].join('\n')), 'test_agent.author_assertion_changed')
})

test('gitApply resets the checkout between calls, reads back exactly what git changed, and refuses symlinks', () => {
  const dir = repo()
  const add = (p) => [`diff --git a/${p} b/${p}`, 'new file mode 100644', '--- /dev/null', `+++ b/${p}`, '@@ -0,0 +1 @@', '+it("n", () => {})', ''].join('\n')
  assert.deepEqual(gitApply(dir, add('backend/tests/n.test.ts')).files.map((f) => f.path), ['backend/tests/n.test.ts'])
  assert.deepEqual(gitApply(dir, add('backend/tests/m.test.ts')).files.map((f) => f.path), ['backend/tests/m.test.ts'])
  assert.deepEqual(gitApply(dir, ''), { diff: '', files: [] })
  const link = [`diff --git a/backend/tests/l.test.ts b/backend/tests/l.test.ts`, 'new file mode 120000', '--- /dev/null', '+++ b/backend/tests/l.test.ts', '@@ -0,0 +1 @@', '+/etc/hosts', '\\ No newline at end of file', ''].join('\n')
  assert.throws(() => gitApply(dir, link), /not a regular file/)
})

test('a filtered patch whose regenerated diff is not part of the checked one is rejected', async () => {
  const gh = fakeGh()
  const apply = async (text) => (text === patch
    ? { diff: patch, files: [{ path: 'backend/tests/a.test.ts', content: 'x\n' }] }
    : { diff: patch.replace('it("x"', 'it("y"'), files: [{ path: 'backend/tests/a.test.ts', content: 'y\n' }] })
  const a = artifacts({ filteredPatch: patch + '\n' })
  assert.equal((await publish({ run: run(), artifacts: a, gh, apply })).code, 'test_agent.artifact_invalid')
  assert.ok(!gh.calls.some((c) => c[0] === 'commit'))
})

test('creating an existing backfill branch (422 on POST /git/refs) yields null through the real client', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, { method }) => {
    const path = new URL(url).pathname
    if (method === 'POST' && path.endsWith('/git/refs')) return { ok: false, status: 422, text: async () => 'Reference already exists' }
    return { ok: true, status: 200, json: async () => ({ sha: 'c'.repeat(40), tree: { sha: 't'.repeat(40) } }) }
  }
  try {
    assert.equal(await github('t', 'o/r', 'bot[bot]').commitFiles({ branch: 'b', parent: sha, files: [], create: true, message: 'm' }), null)
  } finally { globalThis.fetch = realFetch }
})

test('commitMatches: a head commit is ours when it sits on the analysed head and changes exactly our files, byte for byte', async () => {
  const files = [{ path: 'backend/tests/a.test.ts', content: 'it("x", () => {})\n' }]
  const blob = gitBlobSha(files[0].content)
  assert.equal(blob, execFileSync('git', ['hash-object', '--stdin'], { input: files[0].content, encoding: 'utf8' }).trim())
  const commit = (over) => ({ parents: [{ sha }], files: [{ filename: 'backend/tests/a.test.ts', status: 'added', sha: blob }], author: { login: 'anyone' }, ...over })
  const realFetch = globalThis.fetch
  let body
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => body })
  try {
    const gh = github('t', 'o/r', 'bot[bot]')
    body = commit(); assert.equal(await gh.commitMatches('e'.repeat(40), sha, files), true) // whoever made it, it is exactly our change
    body = commit({ parents: [{ sha: 'f'.repeat(40) }] }); assert.equal(await gh.commitMatches('e'.repeat(40), sha, files), false)
    body = commit({ files: [{ filename: 'backend/tests/a.test.ts', status: 'added', sha: 'b'.repeat(40) }] }); assert.equal(await gh.commitMatches('e'.repeat(40), sha, files), false)
    body = commit({ files: [...commit().files, { filename: 'backend/src/x.ts', status: 'modified', sha: blob }] }); assert.equal(await gh.commitMatches('e'.repeat(40), sha, files), false)
    body = commit({ parents: [{ sha }, { sha: 'c'.repeat(40) }] }); assert.equal(await gh.commitMatches('e'.repeat(40), sha, files), false)
  } finally { globalThis.fetch = realFetch }
})

test('an author push on top of the analysed head is outdated even when it touches the same test file', async () => {
  const gh = fakeGh({ head: 'e'.repeat(40) }) // parent is the analysed head, but the content is not ours
  gh.parentOf = async () => sha
  assert.equal((await go(gh)).code, 'test_agent.outdated')
  assert.ok(!gh.calls.some((c) => c[0] === 'commit'))
})

test('the publish workflow downloads each artifact by name into the folder publish.mjs reads', async () => {
  const { readFileSync } = await import('node:fs')
  const yml = readFileSync(new URL('../workflows/test-agent-publish.yml', import.meta.url), 'utf8')
  const src = readFileSync(new URL('./publish.mjs', import.meta.url), 'utf8')
  for (const name of ['gate', 'agent', 'verify']) {
    assert.match(src, new RegExp(`'${name}/[\\w.]+'`), `publish.mjs reads ${name}/`)
    assert.match(yml, new RegExp(`name: ${name}\\n\\s+path: art/${name}\\n`), `workflow downloads ${name} into art/${name}`)
  }
})
