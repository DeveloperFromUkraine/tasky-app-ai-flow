// Validators for the run artifacts. Every artifact is untrusted input for the job that reads it.
// Contract: docs/features/pr-test-agent/contracts/events.md. Each validator returns a list of errors.

const t = {
  str: (max = 300, re) => (v, p) => typeof v !== 'string' ? [`${p}: not a string`] : v.length > max ? [`${p}: longer than ${max}`] : re && !re.test(v) ? [`${p}: bad format`] : [],
  int: (min = 0, max = Number.MAX_SAFE_INTEGER) => (v, p) => Number.isInteger(v) && v >= min && v <= max ? [] : [`${p}: not an integer in range`],
  num: (v, p) => typeof v === 'number' && Number.isFinite(v) ? [] : [`${p}: not a number`],
  bool: (v, p) => typeof v === 'boolean' ? [] : [`${p}: not a boolean`],
  is: (c) => (v, p) => v === c ? [] : [`${p}: must be ${c}`],
  oneOf: (...vals) => (v, p) => vals.includes(v) ? [] : [`${p}: not one of ${vals.join('|')}`],
  orNull: (f) => (v, p) => v === null ? [] : f(v, p),
  arr: (f, max = 1000) => (v, p) => !Array.isArray(v) ? [`${p}: not an array`] : v.length > max ? [`${p}: too many items`] : v.flatMap((x, i) => f(x, `${p}[${i}]`)),
  obj: (shape, optional = []) => (v, p) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return [`${p}: not an object`]
    const errs = Object.keys(v).filter((k) => !(k in shape)).map((k) => `${p}.${k}: unknown field`)
    for (const [k, f] of Object.entries(shape)) {
      if (!(k in v)) { if (!optional.includes(k)) errs.push(`${p}.${k}: required`); continue }
      errs.push(...f(v[k], `${p}.${k}`))
    }
    return errs
  },
}

// Testable files per package (gate); decisions may list every gate file of both packages (finalize).
const MAX_FILES = 1000
const SHA = /^[0-9a-f]{40}$/
const PATH = /^(?:backend|frontend)\/(?!.*\.\.)[\w./@-]+$/
const path = t.str(300, PATH)
const head = (schema) => ({ schema: t.is(schema), run_id: t.int(), mode: t.oneOf('pull_request', 'backfill'), head_sha: t.str(40, SHA) })
const perPackage = (f) => t.obj({ backend: f, frontend: f })

const gate = t.obj({
  ...head('test_agent.gate.v1'), base_sha: t.str(40, SHA), pr_number: t.orNull(t.int(1)),
  decision: t.oneOf('run', 'skip'), skip_reason: t.orNull(t.oneOf('no_testable_change', 'rule_paths_changed')),
  packages: perPackage(t.obj({ files: t.arr(path, MAX_FILES) })), author_test_files: t.arr(path),
})

// The only reasons a file may be skipped; anything else is unfinished work (finalize reports it so).
export const SKIP_CATEGORIES = ['no_logic', 'covered', 'generated']
const OUTCOMES = ['tests_written', 'tests_updated', 'suspected_defect', 'intent_unclear', 'author_test_flagged', 'limit_reached', 'skipped']
const fileDecision = t.obj({
  path, package: t.oneOf('backend', 'frontend'), decision: t.oneOf('write', 'update', 'skip'), reason: t.str(500),
  test_files: t.arr(path, 50), outcome: t.oneOf(...OUTCOMES),
  defect: t.obj({ location: t.str(300), expected: t.str(300), actual: t.str(300) }),
  skip_category: t.oneOf(...SKIP_CATEGORIES),
}, ['defect', 'skip_category'])
const decisions = t.obj({
  ...head('test_agent.decisions.v1'), completed: t.bool,
  not_completed_reason: t.orNull(t.oneOf('model_unavailable', 'spend_limit', 'time_limit', 'attempt_limit')),
  skills_used: t.arr(t.oneOf('analyze-changes', 'backend-unit-tests', 'frontend-unit-tests', 'test-report'), 4),
  files: t.arr(fileDecision, 2 * MAX_FILES), observations: t.arr(t.str(300), 50),
}, ['observations'])

const results = t.obj({
  ...head('test_agent.results.v1'), patch_sha256: t.str(64, /^[0-9a-f]{64}$/),
  kept_test_files: t.arr(path), unstable_test_files: t.arr(t.obj({ path, failed_run: t.int(1, 3), failed_check: t.oneOf('typecheck', 'format') }, ['failed_run', 'failed_check'])),
  tests: perPackage(t.obj({ passed: t.int(), failed: t.int() })),
  coverage: perPackage(t.obj({
    measured: t.bool, diff: t.orNull(t.obj({ covered: t.int(), total: t.int(), pct: t.orNull(t.num) })),
    target_pct: t.num, target_met: t.bool, uncovered_lines: t.arr(t.obj({ file: path, lines: t.arr(t.int(1), 10000) })),
    package_before_pct: t.orNull(t.num), package_after_pct: t.orNull(t.num),
  })),
})

// Counts from Claude Code's own result line, written by finalize (not by the model); shown only in the
// check details. Contract: events.md test_agent.run.v1.
const run = t.obj({ ...head('test_agent.run.v1'), subtype: t.str(40, /^[a-z_]+$/), turns: t.int(0, 10000), cost_usd: t.num, denials: t.int(0, 10000) })

export const validateGate = (v) => gate(v, 'gate')
export const validateRun = (v) => run(v, 'run')
export function validateResults(v) {
  const errs = results(v, 'results')
  ;(Array.isArray(v?.unstable_test_files) ? v.unstable_test_files : []).forEach((u, i) => {
    if (('failed_run' in (u ?? {})) === ('failed_check' in (u ?? {}))) errs.push(`results.unstable_test_files[${i}]: exactly one of failed_run, failed_check`)
  })
  return errs
}
export function validateDecisions(v) {
  const errs = decisions(v, 'decisions')
  ;(Array.isArray(v?.files) ? v.files : []).forEach((f, i) => {
    if (f?.outcome === 'suspected_defect' && !f.defect) errs.push(`decisions.files[${i}].defect: required for suspected_defect`)
    if ((f?.decision === 'skip') !== ('skip_category' in (f ?? {}))) errs.push(`decisions.files[${i}].skip_category: required for skip, and only for skip`)
  })
  return errs
}
export const sameHead = (artifacts, sha) => artifacts.every((a) => a?.head_sha === sha)
