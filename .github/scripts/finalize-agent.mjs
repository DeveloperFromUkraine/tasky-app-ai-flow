// Runs after the claude step, always: guarantees a valid decisions.json even when the agent timed out,
// failed, or wrote nothing usable. Identity fields always come from the gate, never from the model.
import { readFileSync, writeFileSync } from 'node:fs'
import { validateDecisions } from './artifacts.mjs'

// The per-run budget and the turn cap are this run's own attempt limits (spec §6); only the model
// workspace refusing to serve is the spend limit.
function reason(exitCode, log) {
  if (exitCode === 124) return 'time_limit'
  if (/max[ _]turns|max_budget/i.test(log)) return 'attempt_limit'
  if (/credit balance|spend limit|usage limit/i.test(log)) return 'spend_limit'
  return 'model_unavailable'
}

// AC-12: every gate file the agent did not reach before a limit is listed as not completed.
function withUnfinished(d, gate) {
  if (!['time_limit', 'attempt_limit'].includes(d.not_completed_reason)) return d
  const handled = new Set(d.files.map((f) => f.path))
  const unfinished = ['backend', 'frontend'].flatMap((pkg) => gate.packages[pkg].files.filter((p) => !handled.has(p)).map((path) => ({
    path, package: pkg, decision: 'write', reason: 'not handled before the run stopped at a limit', test_files: [], outcome: 'limit_reached',
  })))
  return { ...d, files: [...d.files, ...unfinished] }
}

export function finalize({ decisions, gate, exitCode, log }) {
  const ids = { run_id: gate.run_id, mode: gate.mode, head_sha: gate.head_sha }
  const d = decisions && typeof decisions === 'object' ? { ...decisions, ...ids } : null
  if (d && validateDecisions(d).length === 0) {
    if (exitCode === 0 && d.completed) return d
    return withUnfinished({ ...d, completed: false, not_completed_reason: d.completed || !d.not_completed_reason ? reason(exitCode, log) : d.not_completed_reason }, gate)
  }
  return withUnfinished({ schema: 'test_agent.decisions.v1', ...ids, completed: false, not_completed_reason: reason(exitCode, log), skills_used: [], files: [] }, gate)
}

// CLI: node finalize-agent.mjs <decisions.json> <testable.json> <exit code> <claude log>
if (import.meta.url === `file://${process.argv[1]}`) {
  const [decPath, gatePath, code, logPath] = process.argv.slice(2)
  const read = (p) => { try { return readFileSync(p, 'utf8') } catch { return '' } }
  let decisions = null
  try { decisions = JSON.parse(read(decPath)) } catch {}
  const d = finalize({ decisions, gate: JSON.parse(read(gatePath)), exitCode: Number(code), log: read(logPath) })
  writeFileSync(decPath, JSON.stringify(d, null, 2))
  console.log(d.completed ? 'completed' : `not completed: ${d.not_completed_reason}`)
}
