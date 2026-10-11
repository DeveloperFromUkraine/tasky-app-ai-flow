import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePatch, checkPatch, findSecret, splitBlocks } from './check-patch.mjs'
import { fakeSecrets } from './test-fixtures.mjs'

const diff = (path, body, { header = '', from = path, to = path } = {}) =>
  `diff --git a/${from} b/${to}\n${header}--- ${from === '/dev/null' ? from : 'a/' + from}\n+++ ${to === '/dev/null' ? to : 'b/' + to}\n${body}`

const addOnly = '@@ -1,2 +1,3 @@\n line\n+added\n line\n'
const changed = '@@ -1,2 +1,2 @@\n-expect(a).toBe(1)\n+expect(a).toBe(2)\n line\n'

test('parsePatch reads files, status and added/removed lines', () => {
  const files = parsePatch(diff('backend/tests/a.test.ts', changed) + diff('frontend/src/x/Y.test.tsx', '@@ -0,0 +1 @@\n+new\n', { header: 'new file mode 100644\n', from: '/dev/null', to: 'frontend/src/x/Y.test.tsx' }))
  assert.deepEqual(files.map((f) => [f.path, f.status, f.added.length, f.removed.length]),
    [['backend/tests/a.test.ts', 'modified', 1, 1], ['frontend/src/x/Y.test.tsx', 'added', 1, 0]])
})

const verdict = (patch, author = []) => checkPatch(patch, { authorTestFiles: author, texts: [] })

test('allowed test edits pass, including assertion changes in main tests', () => {
  assert.equal(verdict(diff('backend/tests/a.test.ts', changed)).ok, true)
  assert.equal(verdict(diff('backend/tests/a.test.ts', addOnly), ['backend/tests/a.test.ts']).ok, true)
})

test('production code and shared fixtures are not allowed', () => {
  assert.equal(verdict(diff('backend/src/x.ts', addOnly)).code, 'test_agent.path_not_allowed')
  assert.equal(verdict(diff('backend/tests/fixture.ts', addOnly)).code, 'test_agent.path_not_allowed')
  assert.equal(verdict(diff('frontend/src/test/setup.ts', addOnly)).code, 'test_agent.path_not_allowed')
})

test('deleting or renaming away a test file is rejected', () => {
  const del = diff('backend/tests/a.test.ts', '@@ -1 +0,0 @@\n-x\n', { header: 'deleted file mode 100644\n', to: '/dev/null' })
  assert.equal(verdict(del).code, 'test_agent.test_file_deleted')
  const ren = `diff --git a/backend/tests/a.test.ts b/backend/tests/b.test.ts\nsimilarity index 100%\nrename from backend/tests/a.test.ts\nrename to backend/tests/b.test.ts\n`
  assert.equal(verdict(ren).code, 'test_agent.test_file_deleted')
})

test('binary patches are rejected', () => {
  const bin = `diff --git a/backend/tests/a.test.ts b/backend/tests/a.test.ts\nGIT binary patch\nliteral 3\n`
  assert.equal(verdict(bin).code, 'test_agent.path_not_allowed')
})

test('PR-author tests may only gain lines', () => {
  const r = verdict(diff('backend/tests/a.test.ts', changed), ['backend/tests/a.test.ts'])
  assert.deepEqual([r.code, r.path], ['test_agent.author_assertion_changed', 'backend/tests/a.test.ts'])
})

test('secret-shaped strings in the patch or model text are rejected', () => {
  for (const s of Object.values(fakeSecrets)) {
    assert.ok(findSecret(s), s)
  }
  assert.equal(findSecret('expect(todo.title).toBe("Buy milk")'), null)
  assert.equal(verdict(diff('backend/tests/a.test.ts', '@@ -0,0 +1 @@\n+const t = "' + fakeSecrets.githubClassic + '"\n')).code, 'test_agent.secret_detected')
  assert.equal(checkPatch(diff('backend/tests/a.test.ts', addOnly), { authorTestFiles: [], texts: [`reason ${fakeSecrets.anthropic}`] }).code, 'test_agent.secret_detected')
})

test('empty patch is ok', () => {
  assert.equal(verdict('').ok, true)
})

test('only regular 100644 files may be written: symlinks, mode changes and submodules are rejected', () => {
  const sym = diff('backend/tests/a.test.ts', '@@ -0,0 +1 @@\n+/proc/self/environ\n\\ No newline at end of file\n', { header: 'new file mode 120000\nindex 0000000..1111111\n', from: '/dev/null', to: 'backend/tests/a.test.ts' })
  assert.equal(verdict(sym).code, 'test_agent.path_not_allowed')
  const exec = 'diff --git a/backend/tests/a.test.ts b/backend/tests/a.test.ts\nold mode 100644\nnew mode 100755\n'
  assert.equal(verdict(exec).code, 'test_agent.path_not_allowed')
  const editLink = diff('backend/tests/a.test.ts', '@@ -1 +1 @@\n-x\n+y\n', { header: 'index 1111111..2222222 120000\n' })
  assert.equal(verdict(editLink).code, 'test_agent.path_not_allowed')
  const sub = diff('backend/tests/a.test.ts', '@@ -0,0 +1 @@\n+Subproject commit ' + 'a'.repeat(40) + '\n', { header: 'new file mode 160000\n', from: '/dev/null', to: 'backend/tests/a.test.ts' })
  assert.equal(verdict(sub).code, 'test_agent.path_not_allowed')
  assert.equal(verdict(diff('backend/tests/a.test.ts', addOnly, { header: 'index 1111111..2222222 100644\n' })).ok, true)
})

test('copies and quoted (unparsable) headers are rejected, never silently dropped', () => {
  const copy = 'diff --git a/backend/tests/a.test.ts b/backend/tests/b.test.ts\nsimilarity index 100%\ncopy from backend/tests/a.test.ts\ncopy to backend/tests/b.test.ts\n'
  assert.equal(verdict(copy).code, 'test_agent.path_not_allowed')
  const quoted = 'diff --git "a/backend/tests/\\303\\251.test.ts" "b/backend/tests/\\303\\251.test.ts"\nnew file mode 100644\n--- /dev/null\n+++ "b/backend/tests/\\303\\251.test.ts"\n@@ -0,0 +1 @@\n+x\n'
  assert.equal(verdict(diff('backend/tests/a.test.ts', addOnly) + quoted).code, 'test_agent.path_not_allowed')
})

test('dot segments never count as an allowed test file', () => {
  for (const p of ['backend/tests/../../x.test.ts', 'backend/tests/./a.test.ts', 'frontend/src/../../.github/x.test.ts']) {
    assert.equal(verdict(diff(p, addOnly)).code, 'test_agent.path_not_allowed', p)
  }
})

test('splitBlocks splits a patch into whole per-file blocks', () => {
  const a = diff('backend/tests/a.test.ts', addOnly), b = diff('backend/tests/b.test.ts', changed)
  assert.deepEqual(splitBlocks(a + b), [a, b])
  assert.deepEqual(splitBlocks(''), [])
})

test('content lines starting with --/++ inside a hunk are content, not file headers', () => {
  const del = diff('backend/tests/a.test.ts', '@@ -1,2 +1,1 @@\n---i\n x\n')
  assert.equal(verdict(del, ['backend/tests/a.test.ts']).code, 'test_agent.author_assertion_changed')
  const [f] = parsePatch(diff('backend/tests/a.test.ts', '@@ -1 +1,2 @@\n x\n+++i\n'))
  assert.deepEqual([f.added, f.removed], [['++i'], []])
})

test('lines past a hunk\'s counted length make the block unparsable, as git apply would read them as another patch', () => {
  const forged = [
    'diff --git a/backend/tests/new.test.ts b/backend/tests/new.test.ts', 'new file mode 100644', '--- /dev/null', '+++ b/backend/tests/new.test.ts',
    '@@ -0,0 +1 @@', '+it("n", () => {})',
    '--- a/backend/tests/author.test.ts', '+++ b/backend/tests/author.test.ts', '@@ -1,3 +1,2 @@', ' it("a", () => {', '-  expect(1).toBe(1)', ' })',
    'diff --git a/backend/tests/author.test.ts b/backend/tests/author.test.ts', '--- a/backend/tests/author.test.ts', '+++ b/backend/tests/author.test.ts',
    '@@ -2,0 +2,1 @@', '+  // more', '',
  ].join('\n')
  assert.equal(verdict(forged, ['backend/tests/author.test.ts']).code, 'test_agent.path_not_allowed')
  // a git-generated patch with several hunks, a no-newline marker and default counts stays fine
  const ok = diff('backend/tests/a.test.ts', '@@ -1 +1 @@\n-x\n+y\n\\ No newline at end of file\n@@ -9,2 +9,3 @@\n a\n+b\n c\n')
  assert.equal(verdict(ok).ok, true)
})
