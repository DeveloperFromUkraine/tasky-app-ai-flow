// Publish: the only code that writes to the repository. Runs from main (workflow_run), uses no model,
// runs no pull-request code. Re-checks everything the unprivileged jobs produced before committing.
// Contract: docs/features/pr-test-agent/contracts/events.md (Publish outcomes, Code-host outputs).
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { appendFileSync, lstatSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateDecisions, validateGate, validateResults, sameHead } from './artifacts.mjs'
import { checkPatch, findSecret, parsePatch, splitBlocks } from './check-patch.mjs'
import { renderReport, checkConclusion, MARKER } from './report.mjs'
import { isRulePath } from './rules.mjs'

const sha256 = (s) => createHash('sha256').update(s).digest('hex')
const MAX_REPORT = 60000

export async function publish({ run, artifacts, gh, apply }) {
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
  // The head moved: either the author pushed (outdated) or this is a re-run after our own commit, which
  // is told apart below by content once the files are known (author/committer fields are forgeable).
  let moved = false
  if (!backfill) {
    if (pull.sha !== gate.head_sha) {
      if ((await gh.parentOf(pull.sha)) !== gate.head_sha) return finish({ code: 'test_agent.outdated' })
      moved = true
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
  if (validateResults(results).length || !sameHead([results], gate.head_sha) || results.patch_sha256 !== sha256(patch) || filteredPatch == null) {
    return finish({ code: 'test_agent.artifact_invalid' })
  }

  // Patch text is untrusted and git may read it differently from any parser of ours, so the rules run
  // again on the diff git regenerates after applying it: that diff is what would be committed.
  let full, filtered
  try { full = await apply(patch); filtered = await apply(filteredPatch) } catch { return finish({ code: 'test_agent.artifact_invalid' }) }
  for (const d of [full.diff, filtered.diff]) {
    const v = checkPatch(d, { authorTestFiles: gate.author_test_files, texts: [] })
    if (!v.ok) return finish(v)
  }
  // The filtered patch may only drop whole files of the checked one, never change one.
  const checked = new Set(splitBlocks(full.diff))
  if (!splitBlocks(filtered.diff).every((b) => checked.has(b))) return finish({ code: 'test_agent.artifact_invalid' })
  const { files } = filtered
  // Added lines were scanned by checkPatch; a new file is scanned whole. A modified file's untouched
  // lines are the author's own (fixtures may look like credentials) and are not the agent's to answer for.
  const created = new Set(parsePatch(filtered.diff).filter((f) => f.status === 'added').map((f) => f.path))
  const leaked = files.find((f) => created.has(f.path) && findSecret(f.content))
  if (leaked) return finish({ code: 'test_agent.secret_detected', path: leaked.path, rule: 'no credential may be committed' })
  if (moved) {
    // A re-run of an already published run: the head is exactly the commit we would make. Keep that result.
    if (files.length && (await gh.commitMatches(pull.sha, gate.head_sha, files))) return ignore('already published for this head')
    return finish({ code: 'test_agent.outdated' })
  }
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
        if (!existing.open || !existing.byApp || !(await gh.commitMatches(existing.sha, gate.head_sha, files))) {
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

// Git's object id for a file's bytes, to compare our files with a commit's without fetching it.
export const gitBlobSha = (content) => createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex')

// --- Applying a patch: git is the source of truth ---------------------------------------------------
// Resets the plain checkout (nothing in it runs), applies the patch, and returns the diff git itself
// regenerates plus the content of every file git reports as changed. Only regular files inside the
// checkout are read: a symlink would read the runner's own files.
export function gitApply(checkout, text) {
  const git = (...a) => execFileSync('git', ['-C', checkout, '-c', 'core.hooksPath=/dev/null', '-c', 'core.quotePath=false', ...a], { encoding: 'utf8', maxBuffer: 64 << 20 })
  git('reset', '-q', '--hard'); git('clean', '-fdq')
  if (!text?.trim()) return { diff: '', files: [] }
  const file = join(mkdtempSync(join(tmpdir(), 'publish-')), 'p.patch')
  writeFileSync(file, text)
  git('apply', '--whitespace=nowarn', file)
  git('add', '-A')
  const diff = git('diff', '--cached', '--no-renames', 'HEAD')
  const status = git('diff', '--cached', '--no-renames', '--name-status', '-z', 'HEAD').split('\0').filter(Boolean)
  const root = realpathSync(checkout)
  const files = []
  for (let i = 0; i < status.length; i += 2) {
    const [kind, path] = [status[i], status[i + 1]]
    if (kind === 'D') continue // checkPatch rejects deletions with its own code
    const p = join(checkout, path)
    if (!lstatSync(p).isFile() || realpathSync(p) !== join(root, path)) throw new Error(`not a regular file inside the checkout: ${path}`)
    files.push({ path, content: readFileSync(p, 'utf8') })
  }
  return { diff, files }
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
    parentOf: async (sha) => { const c = await api('GET', `/commits/${sha}`); return c.parents.length === 1 ? c.parents[0].sha : null },
    // Ours by content, not by who: one parent, the analysed head, and exactly our files with our bytes.
    // Author and committer fields follow free-text emails and API commits are signed for anyone.
    async commitMatches(sha, parent, files) {
      const c = await api('GET', `/commits/${sha}`)
      const want = new Map(files.map((f) => [f.path, gitBlobSha(f.content)]))
      return c.parents.length === 1 && c.parents[0].sha === parent && c.files.length === want.size &&
        c.files.every((f) => ['added', 'modified'].includes(f.status) && want.get(f.filename) === f.sha)
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
  const { existsSync } = await import('node:fs')
  const [dir, checkout] = process.argv.slice(2)
  const read = (p) => (existsSync(join(dir, p)) ? readFileSync(join(dir, p), 'utf8') : null)
  const json = (p) => { try { return JSON.parse(read(p)) } catch { return null } }
  const artifacts = {
    gate: json('gate/testable.json'), decisions: json('agent/decisions.json'), patch: read('agent/agent.patch'),
    results: json('verify/results.json'), filteredPatch: read('verify/agent.filtered.patch'),
  }
  const out = await publish({
    run: {
      conclusion: process.env.RUN_CONCLUSION, headSha: process.env.RUN_HEAD_SHA, event: process.env.RUN_EVENT,
      headBranch: process.env.RUN_HEAD_BRANCH, prNumbers: JSON.parse(process.env.RUN_PRS || '[]'), actor: process.env.RUN_ACTOR,
    },
    artifacts, gh: github(process.env.GH_TOKEN, process.env.GITHUB_REPOSITORY, process.env.BOT_LOGIN), apply: async (text) => gitApply(checkout, text),
  })
  console.log(out.code ?? `no action${out.note ? `: ${out.note}` : ''}`)
  if (process.env.GITHUB_STEP_SUMMARY && out.body) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${out.body}\n`)
}
