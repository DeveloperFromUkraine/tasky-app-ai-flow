// Runs after the claude step, always: guarantees a valid decisions.json even when the agent timed out,
// failed, or wrote nothing usable. Identity fields always come from the gate, never from the model.
import { readFileSync, writeFileSync } from 'node:fs'
import { validateDecisions } from './artifacts.mjs'

function reason(exitCode, log) {
  if (exitCode === 124) return 'time_limit'
  if (/max turns/i.test(log)) return 'attempt_limit'
  if (/credit balance|spend limit|usage limit|max_budget/i.test(log)) return 'spend_limit'
  return 'model_unavailable'
}

export function finalize({ decisions, gate, exitCode, log }) {
  const ids = { run_id: gate.run_id, mode: gate.mode, head_sha: gate.head_sha }
  const d = decisions && typeof decisions === 'object' ? { ...decisions, ...ids } : null
  if (d && validateDecisions(d).length === 0) {
    if (exitCode === 0) return d
    return d.completed ? { ...d, completed: false, not_completed_reason: reason(exitCode, log) } : d
  }
  return { schema: 'test_agent.decisions.v1', ...ids, completed: false, not_completed_reason: reason(exitCode, log), skills_used: [], files: [] }
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
