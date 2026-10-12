// Keeps an agent-authored test file only after 3 consecutive passing runs in the sandbox (spec §6,
// AC-14) and builds the filtered patch publish may commit; verify.mjs drives it.
import { parsePatch, splitBlocks } from './check-patch.mjs'
import { sandbox } from './sandbox.mjs'
import { TSC } from './rules.mjs'

export const RUNS = 3

export function checkStability(files, run) {
  const kept = [], unstable = []
  for (const path of files) {
    let failed = 0
    for (let i = 1; i <= RUNS && !failed; i++) if (run(path) !== 0) failed = i
    if (failed) unstable.push({ path, failed_run: failed })
    else kept.push(path)
  }
  return { kept, unstable }
}

export function filterPatch(text, drop) {
  return splitBlocks(text).filter((block) => !drop.includes(parsePatch(block)[0]?.path)).join('')
}

// The repository's required tests check also runs tsc (both packages) and prettier (frontend). vitest
// strips types without checking them, so a test can pass every run and still turn that check red.
export function staticChecks(pkg, files) {
  const rel = files.map((f) => f.slice(pkg.length + 1))
  return [{ check: 'typecheck', cmd: TSC }, ...(pkg === 'frontend' ? [{ check: 'format', cmd: ['node_modules/.bin/prettier', '--list-different', ...rel] }] : [])]
}

// Which of the agent's files fail a static check (exec(check, cmd) → { code, output }, run in the package).
// Problems in other files are not the agent's and do not count against it.
export function staticFailures(pkg, files, exec) {
  const failed = new Map()
  for (const { check, cmd } of staticChecks(pkg, files)) {
    const r = exec(check, cmd)
    if (r.code === 0) continue
    const lines = r.output.split('\n').map((l) => l.trim())
    for (const f of files) {
      const rel = f.slice(pkg.length + 1)
      const hit = check === 'typecheck' ? lines.some((l) => l.startsWith(`${rel}(`)) : lines.includes(rel)
      if (hit && !failed.has(f)) failed.set(f, check)
    }
  }
  return [...failed].map(([path, failed_check]) => ({ path, failed_check }))
}

// Runs one test file with the package's own vitest inside the sandbox.
export function runTestFile(workdir, path) {
  const [pkg, ...rest] = path.split('/')
  return sandbox({ workdir, cwd: pkg, cmd: ['node_modules/.bin/vitest', 'run', rest.join('/')], timeoutSec: 120 }).code
}
