// Runs after the claude step, always: guarantees a valid decisions.json even when the agent timed out,
// failed, or wrote nothing usable. Identity fields always come from the gate, never from the model.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { validateDecisions } from './artifacts.mjs'

// The per-run budget and the turn cap are this run's own attempt limits (spec §6); only the model
// workspace refusing to serve is the spend limit.
function reason(exitCode, log) {
  if (exitCode === 124) return 'time_limit'
  if (/max[ _]turns|max_budget/i.test(log)) return 'attempt_limit'
  if (/credit balance|spend limit|usage limit/i.test(log)) return 'spend_limit'
  if (exitCode === 0) return 'attempt_limit' // the model answered and ended its turn without finishing
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
    if (exitCode === 0) {
      if (d.completed) return d
      // Only a cut-off run (exit 124) hit the time limit; an agent that says so after a clean exit did not.
      const own = d.not_completed_reason === 'time_limit' ? null : d.not_completed_reason
      return withUnfinished({ ...d, not_completed_reason: own ?? reason(exitCode, log) }, gate)
    }
    return withUnfinished({ ...d, completed: false, not_completed_reason: d.completed || !d.not_completed_reason ? reason(exitCode, log) : d.not_completed_reason }, gate)
  }
  return withUnfinished({ schema: 'test_agent.decisions.v1', ...ids, completed: false, not_completed_reason: reason(exitCode, log), skills_used: [], files: [] }, gate)
}

// One log line about the claude run: counts and the names of denied tools (with a file path inside the
// working copy), never the conversation, tool input content or file content (spec §6.1).
const resultOf = (log) => log.split('\n').map((l) => { try { return JSON.parse(l) } catch { return null } }).find((j) => j?.type === 'result')

// The counts publish may show in the check details (test_agent.run.v1); null when Claude never answered.
export function runStats(log, gate) {
  const r = resultOf(log)
  if (!r) return null
  return { schema: 'test_agent.run.v1', run_id: gate.run_id, mode: gate.mode, head_sha: gate.head_sha,
    subtype: String(r.subtype), turns: r.num_turns, cost_usd: r.total_cost_usd, denials: (r.permission_denials ?? []).length }
}

export function runSummary(log) {
  const result = resultOf(log)
  if (!result) return 'claude: no result (see the step log)'
  const denials = (result.permission_denials ?? []).map((d) => {
    const path = d.tool_input?.file_path?.match(/(?:^|\/)(\.test-agent\/[\w.-]+|(?:backend|frontend)\/[\w./-]+)$/)?.[1]
    const program = d.tool_input?.command?.match(/^\s*([\w.\/-]{1,60})(?=\s|$)/)?.[1]
    return path ? `${d.tool_name} ${path}` : program ? `${d.tool_name} ${program}` : d.tool_name
  })
  const cost = typeof result.total_cost_usd === 'number' ? result.total_cost_usd.toFixed(2) : '?'
  return `claude: subtype=${result.subtype} turns=${result.num_turns} cost_usd=${cost} denials=${denials.length}${denials.length ? ` (${denials.join(', ')})` : ''}`
}

// Why an agent's decisions.json was or was not used: validator messages name field paths, never values.
export function decisionsStatus(decisions) {
  if (!decisions || typeof decisions !== 'object') return 'decisions.json: missing or not JSON'
  const errs = validateDecisions(decisions)
  return errs.length ? `decisions.json: invalid (${errs.length}): ${errs.slice(0, 10).join('; ')}` : 'decisions.json: valid'
}

// CLI: node finalize-agent.mjs <decisions.json> <testable.json> <exit code> <claude log>
if (import.meta.url === `file://${process.argv[1]}`) {
  const [decPath, gatePath, code, logPath] = process.argv.slice(2)
  const read = (p) => { try { return readFileSync(p, 'utf8') } catch { return '' } }
  let decisions = null
  try { decisions = JSON.parse(read(decPath)) } catch {}
  const log = read(logPath)
  const gate = JSON.parse(read(gatePath))
  console.log(runSummary(log))
  // Checked as finalize uses it: identity fields always come from the gate.
  const ids = { run_id: gate.run_id, mode: gate.mode, head_sha: gate.head_sha }
  console.log(decisionsStatus(decisions && typeof decisions === 'object' ? { ...decisions, ...ids } : null))
  const stats = runStats(log, gate)
  if (stats) writeFileSync(join(dirname(decPath), 'run.json'), JSON.stringify(stats, null, 2))
  const d = finalize({ decisions, gate, exitCode: Number(code), log })
  writeFileSync(decPath, JSON.stringify(d, null, 2))
  console.log(d.completed ? 'completed' : `not completed: ${d.not_completed_reason}`)
}
