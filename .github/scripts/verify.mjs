// Verify job (no model, read-only): re-measures the agent's work so no number in the report comes
// from model output. Applies the patch, keeps only test files that pass 3 runs in a row, then runs
// each package's suite with coverage on the stable tests. Contract: events.md test_agent.results.v1.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PACKAGES } from './rules.mjs'
import { parsePatch } from './check-patch.mjs'
import { validateDecisions } from './artifacts.mjs'
import { coverage } from './diff-coverage.mjs'
import { sandbox } from './sandbox.mjs'
import { checkStability, filterPatch, runTestFile } from './stability.mjs'

export function parseVitestJson(text) {
  try {
    const j = JSON.parse(text)
    return { passed: j.numPassedTests ?? 0, failed: j.numFailedTests ?? 0 }
  } catch {
    return { passed: 0, failed: 0 }
  }
}

export function assembleResults({ gate, patchSha, stability, tests, coverage }) {
  return {
    schema: 'test_agent.results.v1', run_id: gate.run_id, mode: gate.mode, head_sha: gate.head_sha, patch_sha256: patchSha,
    kept_test_files: stability.kept, unstable_test_files: stability.unstable, tests, coverage,
  }
}

// coverage/ is a writable bind mount in the sandbox (sandbox.mjs WRITABLE). Vitest rm -rf's its reports
// directory before a run, which fails on a mount point, so the report goes one level below it.
export const COVERAGE_CMD = ['node_modules/.bin/vitest', 'run', '--coverage.enabled=true', '--coverage.reporter=lcov',
  '--coverage.reportsDirectory=coverage/run', '--reporter=json', '--outputFile=coverage/vitest-results.json']

const git = (repo, ...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 << 20 })

// One full suite run with coverage, in the sandbox. Thresholds may fail the exit code; «measured»
// depends only on whether lcov.info was written.
function measure(repo, pkg) {
  const dir = join(repo, pkg)
  rmSync(join(dir, 'coverage'), { recursive: true, force: true })
  sandbox({
    workdir: repo, cwd: pkg, timeoutSec: 180,
    cmd: COVERAGE_CMD,
  })
  const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null)
  return { lcov: read(join(dir, 'coverage', 'run', 'lcov.info')), tests: parseVitestJson(read(join(dir, 'coverage', 'vitest-results.json')) ?? '') }
}

// CLI: node verify.mjs <repo at head> <testable.json> <agent dir: agent.patch + decisions.json> <outdir>
if (import.meta.url === `file://${process.argv[1]}`) {
  const [repo, gatePath, agentDir, outdir] = process.argv.slice(2)
  const gate = JSON.parse(readFileSync(gatePath, 'utf8'))
  const patch = readFileSync(join(agentDir, 'agent.patch'), 'utf8')
  let decisions = null
  try { decisions = JSON.parse(readFileSync(join(agentDir, 'decisions.json'), 'utf8')) } catch {}
  const skipped = decisions && validateDecisions(decisions).length === 0
    ? decisions.files.filter((f) => f.decision === 'skip').map((f) => f.path) : []
  const relevant = PACKAGES.filter((p) => gate.packages[p].files.length > 0)

  const before = {}
  if (gate.mode === 'backfill') for (const p of relevant) before[p] = measure(repo, p).lcov

  const reset = () => { git(repo, 'checkout', '--', '.'); git(repo, 'clean', '-fdq') }
  const apply = (text) => {
    if (!text.trim()) return
    const file = resolve(outdir, '.apply.patch')
    writeFileSync(file, text)
    git(repo, 'apply', '--whitespace=nowarn', file) // throws → no results.json → publish reports not completed
    rmSync(file)
  }

  apply(patch)
  const touched = parsePatch(patch).map((f) => f.path)
  const stability = checkStability(touched, (p) => runTestFile(repo, p))
  const filtered = filterPatch(patch, stability.unstable.map((u) => u.path))
  reset()
  apply(filtered)

  const diff = gate.mode === 'pull_request' ? git(repo, 'diff', `${gate.base_sha}...HEAD`) : ''
  const tests = {}, cov = {}
  for (const pkg of PACKAGES) {
    const m = relevant.includes(pkg) ? measure(repo, pkg) : { lcov: null, tests: { passed: 0, failed: 0 } }
    tests[pkg] = m.tests
    cov[pkg] = coverage({ mode: gate.mode, pkg, lcov: m.lcov, lcovBefore: before[pkg] ?? null, diff, files: relevant.includes(pkg) ? gate.packages[pkg].files : [], skipped })
  }
  const patchSha = createHash('sha256').update(patch).digest('hex')
  writeFileSync(join(outdir, 'results.json'), JSON.stringify(assembleResults({ gate, patchSha, stability, tests, coverage: cov }), null, 2))
  writeFileSync(join(outdir, 'agent.filtered.patch'), filtered)
  console.log(`kept ${stability.kept.length}, unstable ${stability.unstable.length}`)
}
