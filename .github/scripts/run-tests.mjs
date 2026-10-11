// The agent's only way to execute code: runs one allowed test file in the sandbox (no network, no env).
// Usage (from the pull-request working copy): node <main>/.github/scripts/run-tests.mjs <test file>
import { isAllowedTestFile, TSC } from './rules.mjs'
import { sandbox } from './sandbox.mjs'

const MAX_OUTPUT = 12000
export const MAX_RUNS = 4 // 1 run + 3 fix attempts per test file (spec §6)

// Run counts per test file. A missing file starts at zero; anything unreadable refuses every run, so
// overwriting the file (say through a redirect) can never reset the counts.
export function loadCounts(text) {
  if (text == null) return {}
  try {
    const c = JSON.parse(text)
    if (c && typeof c === 'object' && !Array.isArray(c) && Object.values(c).every(Number.isInteger)) return c
  } catch {}
  return null
}

export const countsPath = (env) => env.TEST_AGENT_RUNS || null

// One test file, judged the way the required tests check and verify judge it: vitest, then the package
// typecheck (only errors in this file), then for the frontend prettier. exec(cmd) runs in the package.
export function checkFile(path, exec, content = null) {
  const [pkg, ...rest] = path.split('/')
  const rel = rest.join('/')
  const v = exec(['node_modules/.bin/vitest', 'run', rel])
  let code = v.code
  const parts = [v.output]
  const mine = exec(TSC).output.split('\n').map((l) => l.trim()).filter((l) => l.startsWith(`${rel}(`))
  if (mine.length) {
    code ||= 1
    parts.push(`typecheck failed (tsc --noEmit); the required tests check runs it too. Fix these in ${path}:\n${mine.join('\n')}`)
  }
  if (pkg === 'frontend' && content != null) {
    const p = exec(['node_modules/.bin/prettier', rel])
    if (p.code === 0 && p.output !== content) {
      code ||= 1
      parts.push(`not formatted (prettier); the required tests check runs prettier --check. Rewrite ${path} to exactly:\n${p.output}`)
    }
  }
  return { code, output: parts.join('\n\n') }
}

export function runTests(path, run, counts = {}, save = () => {}) {
  if (!isAllowedTestFile(path)) return { code: 2, output: `refused: ${path} is not an allowed test file` }
  if (!counts) return { code: 3, output: 'refused: the run counts are unreadable, so no further runs are allowed' }
  if ((counts[path] ?? 0) >= MAX_RUNS) {
    return { code: 3, output: `refused: attempt limit reached for ${path} (${MAX_RUNS} runs). Treat it as still failing: decide suspected_defect or intent_unclear and remove the failing test.` }
  }
  counts[path] = (counts[path] ?? 0) + 1
  save(counts) // before the run: a run killed midway (a tool timeout) still counts
  const r = run(path)
  // Keep the tail: vitest prints the failures and the summary last.
  return { code: r.code, output: r.output.length > MAX_OUTPUT ? `…\n${r.output.slice(-MAX_OUTPUT)}` : r.output }
}

// The run counts live outside the working copy (TEST_AGENT_RUNS, set by the workflow under $RUNNER_TEMP),
// where neither the agent's tools nor the read-only sandbox can write. There is no fallback location.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { existsSync, readFileSync, writeFileSync } = await import('node:fs')
  const file = countsPath(process.env)
  const counts = file ? loadCounts(existsSync(file) ? readFileSync(file, 'utf8') : null) : null
  const r = runTests(process.argv[2] ?? '', (path) => {
    const pkg = path.split('/')[0]
    const content = existsSync(path) ? readFileSync(path, 'utf8') : null
    return checkFile(path, (cmd) => sandbox({ workdir: process.cwd(), cwd: pkg, cmd, timeoutSec: 120 }), content)
  }, counts, (c) => writeFileSync(file, JSON.stringify(c)))
  process.stdout.write(r.output)
  process.exitCode = r.code
}
