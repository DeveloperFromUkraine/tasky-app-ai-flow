// Shared sample artifacts for the script self-checks.
const sha = 'a'.repeat(40)
const head = { run_id: 1, mode: 'pull_request', head_sha: sha }
export const samples = {
  gate: { schema: 'test_agent.gate.v1', ...head, base_sha: 'b'.repeat(40), pr_number: 7, decision: 'run', skip_reason: null,
    packages: { backend: { files: ['backend/src/a.ts'] }, frontend: { files: [] } }, author_test_files: [] },
  decisions: { schema: 'test_agent.decisions.v1', ...head, completed: true, not_completed_reason: null, skills_used: ['analyze-changes', 'backend-unit-tests'],
    files: [{ path: 'backend/src/a.ts', package: 'backend', decision: 'write', reason: 'new function', test_files: ['backend/tests/a.test.ts'], outcome: 'tests_written' }] },
  results: { schema: 'test_agent.results.v1', ...head, patch_sha256: 'c'.repeat(64), kept_test_files: ['backend/tests/a.test.ts'], unstable_test_files: [],
    tests: { backend: { passed: 3, failed: 0 }, frontend: { passed: 0, failed: 0 } },
    coverage: {
      backend: { measured: true, diff: { covered: 4, total: 5, pct: 80 }, target_pct: 80, target_met: true, uncovered_lines: [{ file: 'backend/src/a.ts', lines: [3] }], package_before_pct: null, package_after_pct: null },
      frontend: { measured: false, diff: null, target_pct: 80, target_met: false, uncovered_lines: [], package_before_pct: null, package_after_pct: null } } },
}

// Credential-shaped strings for the secret-scan tests, assembled at runtime so that repository secret
// scanners don't flag the test source itself. None of them is a real credential.
const x = (n) => 'x'.repeat(n)
export const fakeSecrets = {
  anthropic: ['sk', 'ant', 'api03', x(30)].join('-'),
  githubApp: ['ghs', x(36)].join('_'),
  githubPat: ['github', 'pat', `11${x(20)}`].join('_'),
  githubClassic: ['ghp', x(36)].join('_'),
  jwt: [`eyJ${x(16)}`, `eyJ${x(16)}`, x(24)].join('.'),
  pem: ['-----BEGIN', 'RSA', 'PRIVATE', 'KEY-----'].join(' '),
  oidc: ['ACTIONS', 'ID', 'TOKEN', 'REQUEST', 'TOKEN'].join('_') + '=abc',
}
