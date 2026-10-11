// The sandbox: every piece of untrusted code (pull-request code, agent-authored tests, package
// lifecycle scripts) runs here — no network, no host environment, no credentials, and the working copy
// mounted read-only, so it cannot rewrite .git, the agent's rules (.claude) or the run files
// (.test-agent). Only the listed directories of the package are writable. See sad.md §8, ADR-0002.
import { spawnSync } from 'node:child_process'
import { lstatSync, mkdirSync, realpathSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

// node:22-bookworm, pinned by digest (2026-10-06). Bump deliberately.
export const IMAGE = 'node:22-bookworm@sha256:0e5f906573693feaa1e21057ebdcfdb5bd5021f050b2dc7c9deceb629c7da2a8'

// Writable directories, relative to cwd: the install and the coverage output.
export const WRITABLE = ['node_modules', 'coverage']

const rel = (cwd, w) => (cwd === '.' ? w : `${cwd}/${w}`)

export function dockerArgs({ workdir, cwd, cmd, fetch = false, writable = cwd === '.' ? [] : WRITABLE }) {
  if (!isAbsolute(workdir)) throw new Error(`sandbox workdir must be an absolute path: ${workdir}`)
  const user = typeof process.getuid === 'function' ? ['--user', `${process.getuid()}:${process.getgid()}`] : []
  return [
    'run', '--rm', '--quiet', '--network', fetch ? 'bridge' : 'none',
    '--read-only', '--tmpfs', '/tmp:exec', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--pids-limit', '1024', '--memory', '4g', ...user,
    // Only constants go in; nothing from the host environment is forwarded.
    '-e', 'HOME=/tmp', '-e', 'CI=true',
    // prisma generate never runs the schema engine, but the CLI downloads it unless a path is set;
    // the sandbox has no network, so it gets one that does nothing.
    '-e', 'PRISMA_SCHEMA_ENGINE_BINARY=/bin/false',
    // Same path as on the host: paths in test output (stack traces, file names) are real paths the agent
    // can open and write, never a container-only /w/... that its permission rules would refuse.
    '-v', `${workdir}:${workdir}:ro`, ...writable.flatMap((w) => ['-v', `${workdir}/${rel(cwd, w)}:${workdir}/${rel(cwd, w)}`]),
    '-w', cwd === '.' ? workdir : `${workdir}/${cwd}`,
    IMAGE, ...cmd,
  ]
}

// A writable directory the pull request committed as a symlink (say to ../.git) would be bind-mounted
// through it; each one must resolve to itself inside the working copy.
function writableDirs(workdir, cwd, writable) {
  const root = realpathSync(workdir)
  for (const w of writable) {
    const dir = join(workdir, rel(cwd, w))
    try {
      mkdirSync(dir, { recursive: true })
      if (lstatSync(dir).isDirectory() && realpathSync(dir) === join(root, rel(cwd, w))) continue
    } catch {}
    return `refused: ${rel(cwd, w)} is not a directory inside the working copy`
  }
  return null
}

export function sandbox({ workdir, cwd, cmd, fetch = false, writable = cwd === '.' ? [] : WRITABLE, timeoutSec = 600 }) {
  const refused = writableDirs(workdir, cwd, writable)
  if (refused) return { code: 1, output: refused }
  // The docker client itself gets a minimal env too, so nothing can be smuggled through it.
  const env = { PATH: process.env.PATH, ...(process.env.DOCKER_HOST ? { DOCKER_HOST: process.env.DOCKER_HOST } : {}) }
  const r = spawnSync('docker', dockerArgs({ workdir, cwd, cmd, fetch, writable }), { env, encoding: 'utf8', timeout: timeoutSec * 1000, maxBuffer: 64 << 20 })
  return { code: r.status ?? 1, output: `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? String(r.error) : ''}` }
}

// CLI (workflow only — the agent gets run-tests.mjs, which has no flags):
//   node sandbox.mjs [--fetch] [--write <dir relative to cwd>]... <workdir> <cwd> -- <cmd...>
//   --write replaces the default writable list (node_modules, coverage).
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2)
  const fetch = argv[0] === '--fetch'
  const opts = argv.slice(fetch ? 1 : 0, argv.indexOf('--'))
  const write = opts.flatMap((x, i) => (opts[i - 1] === '--write' ? [x] : []))
  const [workdir, cwd] = opts.filter((x, i) => x !== '--write' && opts[i - 1] !== '--write')
  const r = sandbox({ workdir, cwd, cmd: argv.slice(argv.indexOf('--') + 1), fetch, ...(write.length ? { writable: write } : {}) })
  process.stdout.write(r.output)
  process.exitCode = r.code
}
