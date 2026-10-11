// Publish: the only code that writes to the repository. Runs from main (workflow_run), uses no model,
// runs no pull-request code. Re-checks everything the unprivileged jobs produced before committing.
// Contract: docs/features/pr-test-agent/contracts/events.md (Publish outcomes, Code-host outputs).
import { createHash } from 'node:crypto'
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateDecisions, validateGate, validateResults, sameHead } from './artifacts.mjs'
import { checkPatch, findSecret, parsePatch, splitBlocks } from './check-patch.mjs'
import { renderReport, checkConclusion, MARKER } from './report.mjs'
import { isRulePath } from './rules.mjs'

const sha256 = (s) => createHash('sha256').update(s).digest('hex')
const MAX_REPORT = 60000

export async function publish({ run, artifacts, gh, applyPatch }) {
  const { gate, decisions, results, patch, filteredPatch } = artifacts
  // Cancelled runs were replaced by a newer one; a missing gate artifact means the gate stopped the run.
  if (run.conclusion === 'cancelled' || !gate) return { code: null }
  if (validateGate(gate).length) return { code: null, note: 'invalid gate artifact' }

  // ADR-0002: who and what this run is comes from the triggering run (GitHub's own event data), never
  // from the artifacts, which the unprivileged workflow wrote and a pull request may have rewritten.
  const ignore = (note) => ({ code: null, note })
  const backfill = run.event === 'workflow_dispatch'
  if (gate.mode !== (backfill ? 'backfill' : 'pull_request')) return ignore('gate mode does not match the run')
  let pull = null
  if (backfill) {
    if (run.headBranch !== 'main') return ignore('backfill not run from main')
    if (!['admin', 'maintain'].includes(await gh.role(run.actor))) return ignore('backfill not started by a maintainer')
    if (!(await gh.onMain(run.headSha))) return ignore('backfill commit is not on main')
  } else {
    if (!run.prNumbers.includes(gate.pr_number)) return ignore('gate pull request is not the run\'s')
    pull = await gh.prHead(gate.pr_number)
    if (pull.base !== 'main') return ignore('pull request does not target main')
  }

  const pr = backfill ? null : gate.pr_number
  let target = pr // where the report goes; for backfill, the pull request it opens
  let agentSha = null

  const finish = async (outcome) => {
    const view = { outcome, gate, decisions: outcome.trusted ? decisions : null, results: outcome.trusted ? results : null, agentSha }
    const body = renderReport(view).slice(0, MAX_REPORT)
    if (target) await gh.upsertReport(target, body)
    const check = checkConclusion(view)
    await gh.createCheck({ head_sha: agentSha ?? gate.head_sha, conclusion: check.conclusion, title: check.title, summary: body })
    return { code: outcome.code, body }
  }

  if (!backfill) {
    // ADR-0004: the pull request may have rewritten the unprivileged workflow, so publish checks the
    // rule paths itself from the API and then trusts nothing the run produced.
    const files = await gh.prFiles(pr)
    if (files.some((f) => isRulePath(f.filename))) return finish({ code: 'test_agent.skipped_rule_paths_changed' })
  }
  if (gate.head_sha !== run.headSha) return finish({ code: 'test_agent.artifact_invalid' })
  if (gate.decision === 'skip') return finish({ code: `test_agent.skipped_${gate.skip_reason}` })

  let branch = null
  if (!backfill) {
    if (pull.sha !== gate.head_sha) {
      // A re-run of an already published run finds the agent's own commit on top: keep that result.
      if (await gh.isOwnCommitOn(pull.sha, gate.head_sha)) return ignore('already published for this head')
      return finish({ code: 'test_agent.outdated' })
    }
    branch = pull.ref
  }

  if (!decisions) return finish({ code: 'test_agent.not_completed' })
  if (validateDecisions(decisions).length || !sameHead([decisions], gate.head_sha) || patch == null) return finish({ code: 'test_agent.artifact_invalid' })
  const verdict = checkPatch(patch, { authorTestFiles: gate.author_test_files, texts: [JSON.stringify(decisions)] })
  if (!verdict.ok) return finish(verdict)
  if (!decisions.completed && ['model_unavailable', 'spend_limit'].includes(decisions.not_completed_reason)) {
    return finish({ code: 'test_agent.not_completed', trusted: true })
  }
  if (!results) return finish({ code: 'test_agent.not_completed', trusted: true })
  // The filtered patch may only drop whole blocks of the checked patch, never change one.
  const checked = new Set(splitBlocks(patch))
  if (validateResults(results).length || !sameHead([results], gate.head_sha) || results.patch_sha256 !== sha256(patch) ||
      filteredPatch == null || !splitBlocks(filteredPatch).every((b) => checked.has(b))) {
    return finish({ code: 'test_agent.artifact_invalid' })
  }

  let files
  try { files = await applyPatch(filteredPatch) } catch { return finish({ code: 'test_agent.artifact_invalid' }) }
  // Added lines were scanned by checkPatch; a new file is scanned whole. A modified file's untouched
  // lines are the author's own (fixtures may look like credentials) and are not the agent's to answer for.
  const created = new Set(parsePatch(filteredPatch).filter((f) => f.status === 'added').map((f) => f.path))
  const leaked = files.find((f) => created.has(f.path) && findSecret(f.content))
  if (leaked) return finish({ code: 'test_agent.secret_detected', path: leaked.path, rule: 'no credential may be committed' })
  const code = decisions.completed ? 'test_agent.committed' : 'test_agent.limit_reached'
  if (files.length) {
    const short = gate.head_sha.slice(0, 7)
    if (backfill) {
      const pkg = ['backend', 'frontend'].find((p) => gate.packages[p].files.length)
      branch = `test-agent/backfill-${pkg}-${gate.run_id}`
      // A re-run of the same backfill run finds its own open pull request and reports there again,
      // committing nothing. The branch name is guessable from the run id, so a pull request or branch
      // anyone else made under it is never trusted.
      const existing = await gh.findPull(branch)
      if (existing) {
        if (!existing.open || !existing.byApp || !(await gh.isOwnCommitOn(existing.sha, gate.head_sha))) {
          return ignore('backfill branch has a pull request the App did not make')
        }
        target = existing.number
        agentSha = existing.sha
      } else {
        agentSha = await gh.commitFiles({ branch, parent: gate.head_sha, files, create: true, message: `test-agent: backfill ${pkg}` })
        if (!agentSha) return ignore('backfill branch already exists')
        target = await gh.openPull({ head: branch, title: `test-agent: backfill ${pkg}`, body: `Backfill run ${gate.run_id} of the test agent. See the agent report below.` })
      }
    } else {
      agentSha = await gh.commitFiles({ branch, parent: gate.head_sha, files, message: `test-agent: tests for ${short}` })
      if (!agentSha) return finish({ code: 'test_agent.outdated' }) // the branch moved while publishing
    }
  }
  return finish({ code, trusted: true })
}

// --- GitHub REST client (App installation token) ---------------------------------------------------
export function github(token, repo, botLogin) {
  // Without it the report upsert and the re-run check cannot tell the App's comments and commits apart.
  if (!botLogin) throw new Error('BOT_LOGIN (vars.TEST_AGENT_BOT_LOGIN) is required')
  const api = async (method, path, body) => {
    const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      method, body: body && JSON.stringify(body),
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
    })
    if (res.status === 422 && path.startsWith('/git/refs')) return null // not a fast-forward, or the branch exists
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`)
    return res.status === 204 ? null : res.json()
  }
  const all = async (path) => {
    const out = []
    for (let page = 1; ; page++) {
      const items = await api('GET', `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`)
      out.push(...items)
      if (items.length < 100) return out
    }
  }
  return {
    prFiles: (n) => all(`/pulls/${n}/files`),
    prHead: async (n) => { const p = await api('GET', `/pulls/${n}`); return { sha: p.head.sha, ref: p.head.ref, base: p.base.ref } },
    role: async (login) => (await api('GET', `/collaborators/${encodeURIComponent(login)}/permission`)).role_name,
    isOwnCommitOn: async (sha, parent) => {
      const c = await api('GET', `/commits/${sha}`)
      return c.author?.login === botLogin && c.parents.some((p) => p.sha === parent)
    },
    // A commit of main: comparing main...sha gives `identical` or `behind` only for main's own history.
    onMain: async (sha) => ['identical', 'behind'].includes((await api('GET', `/compare/main...${sha}`)).status),
    async commitFiles({ branch, parent, files, create = false, message }) {
      const base = await api('GET', `/git/commits/${parent}`)
      const tree = await api('POST', '/git/trees', { base_tree: base.tree.sha, tree: files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })) })
      const commit = await api('POST', '/git/commits', { message, tree: tree.sha, parents: [parent] })
      const ref = create
        ? await api('POST', '/git/refs', { ref: `refs/heads/${branch}`, sha: commit.sha })
        : await api('PATCH', `/git/refs/heads/${branch}`, { sha: commit.sha, force: false })
      return ref ? commit.sha : null
    },
    findPull: async (branch) => {
      const [p] = await api('GET', `/pulls?state=all&head=${encodeURIComponent(`${repo.split('/')[0]}:${branch}`)}`)
      return p ? { number: p.number, sha: p.head.sha, open: p.state === 'open', byApp: p.user?.login === botLogin } : null
    },
    openPull: async ({ head, title, body }) => (await api('POST', '/pulls', { head, base: 'main', title, body })).number,
    async upsertReport(n, body) {
      const mine = (await all(`/issues/${n}/comments`)).find((c) => c.user?.login === botLogin && c.body?.startsWith(MARKER))
      if (mine) await api('PATCH', `/issues/comments/${mine.id}`, { body })
      else await api('POST', `/issues/${n}/comments`, { body })
    },
    createCheck: ({ head_sha, conclusion, title, summary }) =>
      api('POST', '/check-runs', { name: 'test-agent', head_sha, status: 'completed', conclusion, output: { title, summary: summary.slice(0, 60000) } }),
  }
}

// CLI: node publish.mjs <artifacts dir> <pull-request checkout dir>
// env: GH_TOKEN (App installation token), GITHUB_REPOSITORY, BOT_LOGIN (the App's bot user), and the triggering run's own fields:
//      RUN_CONCLUSION, RUN_HEAD_SHA, RUN_EVENT, RUN_HEAD_BRANCH, RUN_PRS (JSON array of numbers), RUN_ACTOR
if (import.meta.url === `file://${process.argv[1]}`) {
  const { execFileSync } = await import('node:child_process')
  const { writeFileSync, existsSync, lstatSync, realpathSync } = await import('node:fs')
  const [dir, checkout] = process.argv.slice(2)
  const read = (p) => (existsSync(join(dir, p)) ? readFileSync(join(dir, p), 'utf8') : null)
  const json = (p) => { try { return JSON.parse(read(p)) } catch { return null } }
  const artifacts = {
    gate: json('gate/testable.json'), decisions: json('agent/decisions.json'), patch: read('agent/agent.patch'),
    results: json('verify/results.json'), filteredPatch: read('verify/agent.filtered.patch'),
  }
  // Applies the filtered patch to a plain checkout (no install, no execution) and reads the files back.
  // Only regular files inside the checkout are read: a symlink would read the runner's own files.
  const root = realpathSync(checkout)
  const applyPatch = async (text) => {
    if (!text?.trim()) return []
    const file = join(process.env.RUNNER_TEMP ?? '/tmp', 'filtered.patch')
    writeFileSync(file, text)
    execFileSync('git', ['-C', checkout, 'apply', '--whitespace=nowarn', file])
    return parsePatch(text).map((f) => {
      const p = join(checkout, f.path)
      if (!lstatSync(p).isFile() || realpathSync(p) !== join(root, f.path)) throw new Error(`not a regular file inside the checkout: ${f.path}`)
      return { path: f.path, content: readFileSync(p, 'utf8') }
    })
  }
  const out = await publish({
    run: {
      conclusion: process.env.RUN_CONCLUSION, headSha: process.env.RUN_HEAD_SHA, event: process.env.RUN_EVENT,
      headBranch: process.env.RUN_HEAD_BRANCH, prNumbers: JSON.parse(process.env.RUN_PRS || '[]'), actor: process.env.RUN_ACTOR,
    },
    artifacts, gh: github(process.env.GH_TOKEN, process.env.GITHUB_REPOSITORY, process.env.BOT_LOGIN), applyPatch,
  })
  console.log(out.code ?? `no action${out.note ? `: ${out.note}` : ''}`)
  if (process.env.GITHUB_STEP_SUMMARY && out.body) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${out.body}\n`)
}
