// Gate: decides, without any model, whether an agent run happens and which files are testable.
// Contract: docs/features/pr-test-agent/contracts/events.md (test_agent.gate.v1).
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { PACKAGES, isAllowedTestFile, isRulePath, packageOf } from './rules.mjs'

export function classify(paths) {
  const out = Object.fromEntries(PACKAGES.map((k) => [k, []]))
  for (const p of paths) {
    const pkg = packageOf(p)
    if (pkg) out[pkg].push(p)
  }
  return out
}

const stop = (stop_reason) => ({ decision: 'stop', stop_reason })

export function decide(ctx) {
  if (ctx.mode === 'backfill') {
    if (!['admin', 'maintain'].includes(ctx.role)) return stop('not_maintainer')
    if (!PACKAGES.includes(ctx.package)) return stop('invalid_package')
    const files = classify(ctx.files.map((f) => f.filename))
    const packages = Object.fromEntries(PACKAGES.map((k) => [k, { files: k === ctx.package ? files[k] : [] }]))
    const any = packages[ctx.package].files.length > 0
    return { decision: any ? 'run' : 'skip', skip_reason: any ? null : 'no_testable_change', packages, author_test_files: [] }
  }
  if (ctx.headRepo !== ctx.repo) return stop('fork')
  if (ctx.baseRef !== 'main') return stop('non_main_base')
  if (ctx.senderLogin === ctx.botLogin) return stop('bot_commit')

  const paths = ctx.files.map((f) => f.filename)
  const author_test_files = ctx.files.filter((f) => f.status !== 'removed' && isAllowedTestFile(f.filename)).map((f) => f.filename)
  const live = ctx.files.filter((f) => f.status !== 'removed').map((f) => f.filename)
  const packages = Object.fromEntries(Object.entries(classify(live)).map(([k, v]) => [k, { files: v }]))
  const base = { packages, author_test_files }
  if (paths.some(isRulePath)) return { decision: 'skip', skip_reason: 'rule_paths_changed', ...base }
  if (!Object.values(packages).some((p) => p.files.length)) return { decision: 'skip', skip_reason: 'no_testable_change', ...base }
  return { decision: 'run', skip_reason: null, ...base }
}

const SUMMARY = {
  fork: 'The test agent only serves same-repository pull requests to main (and backfill runs started by a repository maintainer). Pull requests from forks get the tests check only.',
  non_main_base: 'The test agent only serves same-repository pull requests to main (and backfill runs started by a repository maintainer). This pull request targets another branch.',
  bot_commit: 'Head commit was pushed by the test agent itself; no new agent run.',
  not_maintainer: 'Only a repository maintainer (admin or maintain role) may start a backfill run.',
  invalid_package: 'Backfill package must be backend or frontend.',
}

// CLI: node prefilter.mjs --files <files.json> [--role <role>] --out <testable.json>
// files.json: pull request → the pull-request files API array; backfill → [{filename}] of the package.
function main(argv, env) {
  const arg = (k) => argv[argv.indexOf(k) + 1]
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'))
  const files = JSON.parse(readFileSync(arg('--files'), 'utf8'))
  const backfill = env.GITHUB_EVENT_NAME === 'workflow_dispatch'
  const pr = event.pull_request
  const ctx = backfill
    ? { mode: 'backfill', repo: env.GITHUB_REPOSITORY, package: event.inputs?.package, role: arg('--role'), files }
    : { mode: 'pull_request', repo: env.GITHUB_REPOSITORY, headRepo: pr.head.repo?.full_name, baseRef: pr.base.ref,
        senderLogin: event.sender?.login, botLogin: env.BOT_LOGIN, files }
  const d = decide(ctx)
  const out = (k, v) => env.GITHUB_OUTPUT && appendFileSync(env.GITHUB_OUTPUT, `${k}=${v}\n`)
  out('decision', d.decision)
  if (d.decision === 'stop') {
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `### Test agent\n\n${SUMMARY[d.stop_reason]}\n`)
    console.log(`stop: ${d.stop_reason}`)
    return
  }
  const artifact = {
    schema: 'test_agent.gate.v1', run_id: Number(env.GITHUB_RUN_ID), mode: ctx.mode,
    head_sha: backfill ? env.GITHUB_SHA : pr.head.sha, base_sha: backfill ? env.GITHUB_SHA : pr.base.sha,
    pr_number: backfill ? null : pr.number, decision: d.decision, skip_reason: d.skip_reason,
    packages: d.packages, author_test_files: d.author_test_files,
  }
  writeFileSync(arg('--out'), JSON.stringify(artifact, null, 2))
  console.log(`${d.decision}${d.skip_reason ? `: ${d.skip_reason}` : ''}`)
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv, process.env)
