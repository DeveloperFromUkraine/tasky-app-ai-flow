// Deterministic patch rules + secret scan, run by publish before anything is committed.
// Contract: docs/features/pr-test-agent/contracts/events.md (test_agent.patch.v1, Publish outcomes).
import { readFileSync } from 'node:fs'
import { isAllowedTestFile } from './rules.mjs'

// One block per file, each starting at its `diff --git` header; concatenating them gives the patch back.
export const splitBlocks = (text) => text.split(/(?=^diff --git )/m).filter(Boolean)

export function parsePatch(text) {
  const files = []
  let f = null
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      // Quoted headers (unusual file names) don't match and stay unparsable, so checkPatch rejects them.
      const head = line.match(/^diff --git a\/(\S+) b\/(\S+)$/)
      f = { from: head?.[1] ?? line, path: head?.[2] ?? line, unparsable: !head, status: 'modified', modes: [], binary: false, added: [], removed: [], hunk: null }
      files.push(f)
      continue
    }
    if (!f) continue
    // Hunks are read the way git apply reads them: by the line counts in their @@ header. Inside the
    // counts every line is content (a removed `--i` shows as `---i`); once they run out, only another
    // @@ may follow, since git apply would take anything else (say `--- a/x`) as a patch of its own.
    const at = line.match(/^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/)
    if (f.hunk && (f.hunk.old > 0 || f.hunk.new > 0)) {
      if (line.startsWith('+')) { f.added.push(line.slice(1)); f.hunk.new-- }
      else if (line.startsWith('-')) { f.removed.push(line.slice(1)); f.hunk.old-- }
      else if (line.startsWith(' ') || line === '') { f.hunk.old--; f.hunk.new-- }
      else if (!line.startsWith('\\')) f.unparsable = true
      continue
    }
    if (at) { f.hunk = { old: Number(at[1] ?? 1), new: Number(at[2] ?? 1) }; continue }
    if (f.hunk) { if (line !== '' && !line.startsWith('\\')) f.unparsable = true; continue }
    const mode = line.match(/^(?:new file mode|deleted file mode|old mode|new mode|index \S+) (\d+)$/)
    if (mode) f.modes.push(mode[1])
    if (line.startsWith('new file mode')) f.status = 'added'
    else if (line.startsWith('deleted file mode')) f.status = 'deleted'
    else if (line.startsWith('rename from ')) f.status = 'renamed'
    else if (line.startsWith('copy from ')) f.status = 'copied'
    else if (line.startsWith('GIT binary patch') || line.startsWith('Binary files ')) f.binary = true
  }
  return files
}

// ponytail: pattern list, not entropy analysis; add patterns when a new credential shape appears.
const SECRETS = [
  /sk-ant-[\w-]{20,}/, /\bgh[pousr]_[A-Za-z0-9]{30,}/, /\bgithub_pat_[\w]{20,}/,
  /\beyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /ACTIONS_(?:ID_TOKEN_REQUEST|RUNTIME)_(?:TOKEN|URL)/, /\bAKIA[0-9A-Z]{16}\b/,
]
export const findSecret = (s) => SECRETS.find((re) => re.test(s)) ?? null

const fail = (code, path, rule) => ({ ok: false, code, path, rule })

export function checkPatch(text, { authorTestFiles = [], texts = [] }) {
  for (const f of parsePatch(text)) {
    if (f.status === 'deleted' || f.status === 'renamed') return fail('test_agent.test_file_deleted', f.from, 'the agent never deletes or renames a test file')
    if (f.unparsable || f.binary || f.status === 'copied' || f.modes.some((m) => m !== '100644') || !isAllowedTestFile(f.path)) return fail('test_agent.path_not_allowed', f.path, 'only allowed test files may change')
    if (authorTestFiles.includes(f.path) && f.removed.length) return fail('test_agent.author_assertion_changed', f.path, "the PR author's assertions are never rewritten")
    if (f.added.some(findSecret)) return fail('test_agent.secret_detected', f.path, 'no credential may be committed')
  }
  if (texts.some(findSecret)) return fail('test_agent.secret_detected', 'decisions.json', 'no credential may appear in the agent report')
  return { ok: true }
}

// CLI: node check-patch.mjs <agent.patch> <testable.json> [decisions.json]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [patch, gate, decisions] = process.argv.slice(2)
  const texts = decisions ? [readFileSync(decisions, 'utf8')] : []
  const r = checkPatch(readFileSync(patch, 'utf8'), { authorTestFiles: JSON.parse(readFileSync(gate, 'utf8')).author_test_files, texts })
  console.log(JSON.stringify(r))
  process.exitCode = r.ok ? 0 : 1
}
