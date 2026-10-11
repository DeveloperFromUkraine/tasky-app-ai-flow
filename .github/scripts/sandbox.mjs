// The sandbox: every piece of untrusted code (pull-request code, agent-authored tests, package
// lifecycle scripts) runs here — no network, no host environment, no credentials, only the
// working copy mounted. See sad.md §8 Sandboxing, ADR-0002.
import { spawnSync } from 'node:child_process'

// node:22-bookworm, pinned by digest (2026-10-06). Bump deliberately.
export const IMAGE = 'node:22-bookworm@sha256:0e5f906573693feaa1e21057ebdcfdb5bd5021f050b2dc7c9deceb629c7da2a8'

export function dockerArgs({ workdir, cwd, cmd, fetch = false }) {
  const user = typeof process.getuid === 'function' ? ['--user', `${process.getuid()}:${process.getgid()}`] : []
  return [
    'run', '--rm', '--network', fetch ? 'bridge' : 'none',
    '--read-only', '--tmpfs', '/tmp:exec', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--pids-limit', '1024', '--memory', '4g', ...user,
    // Only constants go in; nothing from the host environment is forwarded.
    '-e', 'HOME=/tmp', '-e', 'CI=true',
    '-v', `${workdir}:/w`, '-w', cwd === '.' ? '/w' : `/w/${cwd}`,
    IMAGE, ...cmd,
  ]
}

export function sandbox({ workdir, cwd, cmd, fetch = false, timeoutSec = 600 }) {
  // The docker client itself gets a minimal env too, so nothing can be smuggled through it.
  const env = { PATH: process.env.PATH, ...(process.env.DOCKER_HOST ? { DOCKER_HOST: process.env.DOCKER_HOST } : {}) }
  const r = spawnSync('docker', dockerArgs({ workdir, cwd, cmd, fetch }), { env, encoding: 'utf8', timeout: timeoutSec * 1000, maxBuffer: 64 << 20 })
  return { code: r.status ?? 1, output: `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? String(r.error) : ''}` }
}

// CLI (workflow only — the agent gets run-tests.mjs, which has no --fetch):
//   node sandbox.mjs [--fetch] <workdir> <cwd> -- <cmd...>
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2)
  const fetch = argv[0] === '--fetch'
  const [workdir, cwd] = argv.slice(fetch ? 1 : 0)
  const r = sandbox({ workdir, cwd, cmd: argv.slice(argv.indexOf('--') + 1), fetch })
  process.stdout.write(r.output)
  process.exitCode = r.code
}
