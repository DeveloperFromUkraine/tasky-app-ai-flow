// Keeps an agent-authored test file only after 3 consecutive passing runs in the sandbox (spec §6,
// AC-14) and writes the filtered patch publish may commit.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePatch } from './check-patch.mjs'
import { sandbox } from './sandbox.mjs'

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
  return text.split(/(?=^diff --git )/m).filter((block) => {
    const m = block.match(/^diff --git a\/.+ b\/(.+)$/m)
    return !m || !drop.includes(m[1])
  }).join('')
}

// Runs one test file with the package's own vitest inside the sandbox.
export function runTestFile(workdir, path) {
  const [pkg, ...rest] = path.split('/')
  return sandbox({ workdir, cwd: pkg, cmd: ['node_modules/.bin/vitest', 'run', rest.join('/')], timeoutSec: 120 }).code
}

// CLI: node stability.mjs <workdir with patch applied> <agent.patch> <outdir>
// Writes <outdir>/stability.json and <outdir>/agent.filtered.patch.
if (import.meta.url === `file://${process.argv[1]}`) {
  const [workdir, patchPath, outdir] = process.argv.slice(2)
  const patch = readFileSync(patchPath, 'utf8')
  const files = parsePatch(patch).map((f) => f.path)
  const r = checkStability(files, (p) => runTestFile(workdir, p))
  writeFileSync(join(outdir, 'stability.json'), JSON.stringify(r, null, 2))
  writeFileSync(join(outdir, 'agent.filtered.patch'), filterPatch(patch, r.unstable.map((u) => u.path)))
  console.log(`kept ${r.kept.length}, unstable ${r.unstable.length}`)
}
