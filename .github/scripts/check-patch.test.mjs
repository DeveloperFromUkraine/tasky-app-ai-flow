import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePatch, checkPatch, findSecret } from './check-patch.mjs'
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
