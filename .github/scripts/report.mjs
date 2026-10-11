// Renders the agent report (one upserted PR comment) and the advisory check result.
// Numbers come only from results.json; model text from decisions.json is escaped and capped.
// Contract: docs/features/pr-test-agent/contracts/events.md (Code-host outputs, Publish outcomes).

export const MARKER = '<!-- test-agent-report -->'

export const escapeText = (s, max = 500) =>
  String(s).slice(0, max).replace(/\s*\n\s*/g, ' ')
    .replace(/([\\`*_[\]|#~])/g, '\\$1')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/@/g, '&#64;')

const short = (sha) => (sha ? `\`${sha.slice(0, 7)}\`` : 'none')
const code = (p) => `\`${String(p).replace(/`/g, '')}\``

const NOTICE = {
  'test_agent.skipped_no_testable_change': 'Skipped: this pull request has no testable change (only files the pre-filter excludes).',
  'test_agent.skipped_rule_paths_changed': 'Skipped: this pull request changes the agent rules (`.github/` or `.claude/`), so the agent does not run on it. The tests check and code-owner review still apply.',
  'test_agent.outdated': 'Outdated: new commits arrived while the agent was running. Nothing was committed; the run for the newest commit replaces this one.',
  'test_agent.artifact_invalid': 'Rejected: the run output did not match the expected format. Nothing was committed.',
}
const REJECTED = new Set(['test_agent.path_not_allowed', 'test_agent.test_file_deleted', 'test_agent.author_assertion_changed', 'test_agent.secret_detected'])
const NOT_COMPLETED = { model_unavailable: 'the model was unavailable', spend_limit: 'the model workspace spend limit was reached', time_limit: 'the time limit was reached', attempt_limit: 'the attempt limit was reached' }
const OUTCOME = { tests_written: 'tests written', tests_updated: 'tests updated', suspected_defect: 'suspected defect', intent_unclear: 'intent unclear', author_test_flagged: 'author test flagged', limit_reached: 'not completed (limit)', skipped: 'skipped' }

function coverageCell(c) {
  if (!c?.measured) return ['not measured', '—']
  if (c.diff) return [c.diff.pct == null ? 'no instrumented changed lines' : `${c.diff.pct}% (${c.diff.covered}/${c.diff.total} lines)`, c.target_met ? 'met' : 'missed']
  return [`${c.package_before_pct ?? '?'}% → ${c.package_after_pct}% (package lines)`, c.target_met ? 'met' : 'missed']
}

export function renderReport({ outcome, gate, decisions, results, agentSha = null }) {
  const head = gate?.head_sha ?? decisions?.head_sha
  const out = [MARKER, '## Test agent report', '', `Analysed commit ${short(head)} · agent commit ${short(agentSha)}`, '']
  if (NOTICE[outcome.code]) return [...out, NOTICE[outcome.code], ''].join('\n')
  if (REJECTED.has(outcome.code)) {
    return [...out, `**The agent's change was rejected** (\`${outcome.code}\`): nothing was committed.`, '', `- File: ${code(outcome.path)}`, `- Rule broken: ${escapeText(outcome.rule)}`, ''].join('\n')
  }
  if (outcome.code === 'test_agent.not_completed') {
    const why = NOT_COMPLETED[decisions?.not_completed_reason] ?? 'the agent or verify job failed'
    out.push(`**The agent run did not complete:** ${why}. Nothing was committed; the merge depends only on the tests check.`, '')
  }
  if (results) {
    out.push('### Results', '', '| Package | Tests passed | Tests failed | Diff coverage | Target (80%) |', '|---|---|---|---|---|')
    for (const pkg of ['backend', 'frontend']) {
      const [cov, target] = coverageCell(results.coverage[pkg])
      out.push(`| ${pkg} | ${results.tests[pkg].passed} | ${results.tests[pkg].failed} | ${cov} | ${target} |`)
    }
    out.push('')
    const uncovered = Object.values(results.coverage).flatMap((c) => c.uncovered_lines)
    if (uncovered.length) out.push('**Uncovered changed lines**', '', ...uncovered.map((u) => `- ${code(u.file)}: ${u.lines.join(', ')}`), '')
    if (results.unstable_test_files.length) out.push('### Unstable tests (discarded)', '', ...results.unstable_test_files.map((u) => `- ${code(u.path)} failed on run ${u.failed_run} of 3`), '')
  }
  if (decisions) {
    const files = decisions.files
    if (files.length) out.push('### Decisions', '', '| File | Decision | Outcome | Reason |', '|---|---|---|---|', ...files.map((f) => `| ${code(f.path)} | ${f.decision} | ${OUTCOME[f.outcome]} | ${escapeText(f.reason)} |`), '')
    const defects = files.filter((f) => f.outcome === 'suspected_defect')
    if (defects.length) out.push('### Suspected defects', '', ...defects.map((f) => `- ${code(f.defect.location)} — expected: ${escapeText(f.defect.expected, 300)} · actual: ${escapeText(f.defect.actual, 300)}`), '')
    const flagged = files.filter((f) => f.outcome === 'author_test_flagged')
    if (flagged.length) out.push('### For the PR author', '', 'These tests of yours fail and were left untouched:', '', ...flagged.flatMap((f) => f.test_files.map((p) => `- ${code(p)}`)), '')
    const unfinished = files.filter((f) => f.outcome === 'limit_reached')
    if (unfinished.length) out.push('### Not completed', '', ...unfinished.map((f) => `- ${code(f.path)} — a limit was reached`), '')
    if (decisions.observations?.length) out.push('### Observations', '', ...decisions.observations.map((o) => `- ${escapeText(o, 300)}`), '')
    out.push(`Skills used: ${decisions.skills_used.join(', ') || 'none'}`, '')
  }
  return out.join('\n')
}

export function checkConclusion({ outcome, gate, decisions, results }) {
  const ok = outcome.code === 'test_agent.committed' && decisions?.completed &&
    !decisions.files.some((f) => f.outcome === 'limit_reached') &&
    ['backend', 'frontend'].every((p) => !gate.packages[p].files.length || (results.coverage[p].measured && results.coverage[p].target_met))
  return { conclusion: ok ? 'success' : 'neutral', title: ok ? 'Tests added, target met' : `Advisory: ${outcome.code.replace('test_agent.', '').replace(/_/g, ' ')}` }
}
