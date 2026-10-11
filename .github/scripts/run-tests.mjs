// The agent's only way to execute code: runs one allowed test file in the sandbox (no network, no env).
// Usage (from the pull-request working copy): node <main>/.github/scripts/run-tests.mjs <test file>
import { isAllowedTestFile } from './rules.mjs'
import { sandbox } from './sandbox.mjs'

const MAX_OUTPUT = 12000
export const MAX_RUNS = 4 // 1 run + 3 fix attempts per test file (spec §6)

export function runTests(path, run, counts = {}) {
  if (!isAllowedTestFile(path)) return { code: 2, output: `refused: ${path} is not an allowed test file` }
  if ((counts[path] ?? 0) >= MAX_RUNS) {
    return { code: 3, output: `refused: attempt limit reached for ${path} (${MAX_RUNS} runs). Treat it as still failing: decide suspected_defect or intent_unclear and remove the failing test.` }
  }
  counts[path] = (counts[path] ?? 0) + 1
  const r = run(path)
  // Keep the tail: vitest prints the failures and the summary last.
  return { code: r.code, output: r.output.length > MAX_OUTPUT ? `…\n${r.output.slice(-MAX_OUTPUT)}` : r.output }
}

// The run counts live in .test-agent/, which the agent cannot write (claude-settings.json allows only
// decisions.json there) and the sandbox cannot either (read-only mount).
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync, writeFileSync } = await import('node:fs')
  const COUNTS = '.test-agent/runs.json'
  let counts = {}
  try { counts = JSON.parse(readFileSync(COUNTS, 'utf8')) } catch {}
  const r = runTests(process.argv[2] ?? '', (path) => {
    const [pkg, ...rest] = path.split('/')
    return sandbox({ workdir: process.cwd(), cwd: pkg, cmd: ['node_modules/.bin/vitest', 'run', rest.join('/')], timeoutSec: 120 })
  }, counts)
  writeFileSync(COUNTS, JSON.stringify(counts))
  process.stdout.write(r.output)
  process.exitCode = r.code
}
