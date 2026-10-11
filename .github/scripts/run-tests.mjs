// The agent's only way to execute code: runs one allowed test file in the sandbox (no network, no env).
// Usage (from the pull-request working copy): node <main>/.github/scripts/run-tests.mjs <test file>
import { isAllowedTestFile } from './rules.mjs'
import { sandbox } from './sandbox.mjs'

const MAX_OUTPUT = 12000

export function runTests(path, run) {
  if (!isAllowedTestFile(path)) return { code: 2, output: `refused: ${path} is not an allowed test file` }
  const r = run(path)
  // Keep the tail: vitest prints the failures and the summary last.
  return { code: r.code, output: r.output.length > MAX_OUTPUT ? `…\n${r.output.slice(-MAX_OUTPUT)}` : r.output }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = runTests(process.argv[2] ?? '', (path) => {
    const [pkg, ...rest] = path.split('/')
    return sandbox({ workdir: process.cwd(), cwd: pkg, cmd: ['node_modules/.bin/vitest', 'run', rest.join('/')], timeoutSec: 120 })
  })
  process.stdout.write(r.output)
  process.exitCode = r.code
}
