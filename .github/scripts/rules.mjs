// Shared rules of the test agent, loaded from main by every job that enforces them.
// Source of truth: docs/features/pr-test-agent/CONTEXT.md («Allowed test files», «Testable change»).

export const PACKAGES = ['backend', 'frontend']

// Allowed test files: backend/tests/**/*.test.ts and frontend/src/**/*.test.{ts,tsx}.
export const isAllowedTestFile = (p) =>
  /^backend\/tests\/(?:[\w.-]+\/)*[\w.-]+\.test\.ts$/.test(p) ||
  /^frontend\/src\/(?:[\w.-]+\/)*[\w.-]+\.test\.tsx?$/.test(p)

// Changes to these paths alter the rules of the run itself (ADR-0004).
export const isRulePath = (p) => p.startsWith('.github/') || p.startsWith('.claude/')

const SOURCE = { backend: /^backend\/src\/.+\.ts$/, frontend: /^frontend\/src\/.+\.tsx?$/ }

// Testable change pre-filter: production sources only, minus docs, stories, type declarations,
// the design system, generated code and tests. Every non-source file fails the SOURCE match.
export function packageOf(p) {
  const pkg = PACKAGES.find((k) => SOURCE[k].test(p))
  if (!pkg) return null
  if (/\.(?:test|stories)\.tsx?$/.test(p) || p.endsWith('.d.ts')) return null
  if (/(?:^|\/)types\.ts$/.test(p) || p.includes('/generated/')) return null
  if (p.startsWith('frontend/src/design-system/') || p.startsWith('frontend/src/test/')) return null
  return pkg
}
