// Measured coverage for the agent report: lcov × changed lines (pull request) or package line
// coverage before/after (backfill). No number in the report comes from anywhere else.
// Contract: docs/features/pr-test-agent/contracts/events.md (test_agent.results.v1 coverage).

export const TARGET_PCT = 80

const round = (n) => Math.round(n * 10) / 10

export function parseLcov(text, pkg) {
  const files = new Map()
  let hits = null
  for (const line of text.split('\n')) {
    if (line.startsWith('SF:')) {
      const sf = line.slice(3).trim()
      const at = sf.lastIndexOf(`${pkg}/src/`)
      const path = at >= 0 ? sf.slice(at) : `${pkg}/${sf.replace(/^\.\//, '')}`
      hits = new Map()
      files.set(path, hits)
    } else if (line.startsWith('DA:') && hits) {
      const [n, count] = line.slice(3).split(',')
      hits.set(Number(n), Number(count))
    }
  }
  return files
}

export function parseDiff(text) {
  const out = new Map()
  let lines = null
  let next = 0
  for (const line of text.split('\n')) {
    if (line.startsWith('+++ ')) {
      lines = line === '+++ /dev/null' ? null : []
      if (lines) out.set(line.slice(6), lines)
    } else if (line.startsWith('@@')) {
      next = Number(line.match(/\+(\d+)/)[1])
    } else if (lines && line.startsWith('+')) {
      lines.push(next++)
    } else if (lines && !line.startsWith('-') && !line.startsWith('\\')) {
      next++
    }
  }
  return out
}

const linePct = (lcovMap) => {
  let total = 0, covered = 0
  for (const hits of lcovMap.values()) for (const c of hits.values()) { total++; if (c > 0) covered++ }
  return total ? round((covered / total) * 100) : null
}

export function coverage({ mode, pkg, lcov, lcovBefore = null, diff, files, skipped }) {
  const base = { measured: false, diff: null, target_pct: TARGET_PCT, target_met: false, uncovered_lines: [], package_before_pct: null, package_after_pct: null }
  if (mode === 'backfill') {
    if (lcov == null) return base
    const after = linePct(parseLcov(lcov, pkg))
    const before = lcovBefore == null ? null : linePct(parseLcov(lcovBefore, pkg))
    return { ...base, measured: true, package_before_pct: before, package_after_pct: after, target_met: after != null && after >= TARGET_PCT }
  }
  if (lcov == null || files.length === 0) return base
  const hitsByFile = parseLcov(lcov, pkg)
  const changed = parseDiff(diff)
  let covered = 0, total = 0
  const uncovered_lines = []
  for (const file of files) {
    if (skipped.includes(file)) continue
    const hits = hitsByFile.get(file)
    const missed = []
    for (const n of changed.get(file) ?? []) {
      if (!hits?.has(n)) continue
      total++
      if (hits.get(n) > 0) covered++
      else missed.push(n)
    }
    if (missed.length) uncovered_lines.push({ file, lines: missed })
  }
  const pct = total ? round((covered / total) * 100) : null
  return { ...base, measured: true, diff: { covered, total, pct }, target_met: pct == null || pct >= TARGET_PCT, uncovered_lines }
}
