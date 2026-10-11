import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dockerArgs, sandbox } from './sandbox.mjs'
import { checkStability, filterPatch } from './stability.mjs'

test('docker args isolate the run: no network, no host env, only the workdir mounted', () => {
  const a = dockerArgs({ workdir: '/repo', cwd: 'backend', cmd: ['npm', 'test'] })
  assert.ok(a.includes('--network') && a[a.indexOf('--network') + 1] === 'none')
  assert.ok(a.includes('--cap-drop') && a.includes('--read-only'))
  assert.ok(a.includes('--quiet')) // image pull progress must not mix into the command's output
  assert.deepEqual(a.filter((x, i) => a[i - 1] === '-v'), ['/repo:/w'])
  assert.equal(a[a.indexOf('-w') + 1], '/w/backend')
  assert.deepEqual(a.filter((x, i) => a[i - 1] === '-e'), ['HOME=/tmp', 'CI=true'])
  assert.ok(!a.some((x) => /TOKEN|ACTIONS_|GITHUB_/.test(x)))
  assert.deepEqual(a.slice(-2), ['npm', 'test'])
})

test('fetch mode is the only one with network', () => {
  const a = dockerArgs({ workdir: '/repo', cwd: 'backend', cmd: ['npm', 'ci', '--ignore-scripts'], fetch: true })
  assert.equal(a[a.indexOf('--network') + 1], 'bridge')
})

test('a test file is kept only after 3 consecutive passes', () => {
  const runs = { 'backend/tests/a.test.ts': [0, 0, 0], 'backend/tests/b.test.ts': [0, 0, 1], 'frontend/src/C.test.tsx': [1] }
  const calls = {}
  const run = (file) => { calls[file] = (calls[file] ?? 0) + 1; return runs[file][calls[file] - 1] }
  const r = checkStability(Object.keys(runs), run)
  assert.deepEqual(r.kept, ['backend/tests/a.test.ts'])
  assert.deepEqual(r.unstable, [{ path: 'backend/tests/b.test.ts', failed_run: 3 }, { path: 'frontend/src/C.test.tsx', failed_run: 1 }])
  assert.equal(calls['frontend/src/C.test.tsx'], 1)
})

test('filterPatch drops the diff blocks of unstable files only', () => {
  const block = (p) => `diff --git a/${p} b/${p}\n--- a/${p}\n+++ b/${p}\n@@ -0,0 +1 @@\n+x\n`
  const out = filterPatch(block('backend/tests/a.test.ts') + block('backend/tests/b.test.ts'), ['backend/tests/b.test.ts'])
  assert.equal(out, block('backend/tests/a.test.ts'))
})

// Runs only where a Docker daemon is reachable (CI); NON-red locally.
const docker = (() => { try { execFileSync('docker', ['info'], { stdio: 'ignore' }); return true } catch { return false } })()
test('sandboxed code sees no runner env and no network', { skip: !docker && 'docker not available (NON-red)' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'sbx-'))
  writeFileSync(join(dir, 'probe.mjs'), `
    const leaked = Object.keys(process.env).filter((k) => /TOKEN|SECRET|ACTIONS_|GITHUB_|ANTHROPIC/.test(k))
    let net = 'blocked'
    try { await fetch('https://example.com', { signal: AbortSignal.timeout(3000) }); net = 'open' } catch {}
    console.log(JSON.stringify({ leaked, net }))`)
  const r = sandbox({ workdir: dir, cwd: '.', cmd: ['node', 'probe.mjs'], env: { ...process.env, GITHUB_TOKEN: 'x', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'y' } })
  assert.equal(r.code, 0, r.output)
  assert.deepEqual(JSON.parse(r.output.trim().split('\n').pop()), { leaked: [], net: 'blocked' })
})
