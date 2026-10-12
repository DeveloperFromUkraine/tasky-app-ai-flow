// Before the agent runs: which existing test files already fail on the pull-request head. A change can
// break a test from main (a new dependency the test does not mock, say); the agent only runs the files it
// touches, so without this list it would never see that failure. Runs in the sandbox, like all PR code.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { PACKAGES } from './rules.mjs'
import { sandbox } from './sandbox.mjs'

// The report goes to coverage/, the package's writable directory in the sandbox.
export const BASELINE_CMD = ['node_modules/.bin/vitest', 'run', '--reporter=json', '--outputFile=coverage/baseline.json']

export function baselineFailures(json, repo) {
  return (json?.testResults ?? []).filter((r) => r.status === 'failed').map((r) => {
    const first = r.assertionResults?.find((a) => a.status === 'failed')?.failureMessages?.[0] ?? r.message ?? ''
    return { file: relative(repo, r.name), error: String(first).split('\n')[0].slice(0, 300) }
  })
}

// CLI: node baseline.mjs <repo> <testable.json> <out.json>
if (import.meta.url === `file://${process.argv[1]}`) {
  const [repo, gatePath, out] = process.argv.slice(2)
  const gate = JSON.parse(readFileSync(gatePath, 'utf8'))
  const failures = []
  for (const pkg of PACKAGES.filter((p) => gate.packages[p].files.length)) {
    const report = join(repo, pkg, 'coverage', 'baseline.json')
    rmSync(report, { force: true })
    sandbox({ workdir: repo, cwd: pkg, cmd: BASELINE_CMD, timeoutSec: 240 })
    let json = null
    try { json = existsSync(report) ? JSON.parse(readFileSync(report, 'utf8')) : null } catch {}
    failures.push(...baselineFailures(json, repo))
    rmSync(report, { force: true })
  }
  writeFileSync(out, JSON.stringify(failures, null, 2))
  console.log(`baseline: ${failures.length} failing test file(s)${failures.length ? `: ${failures.map((f) => f.file).join(', ')}` : ''}`)
}
