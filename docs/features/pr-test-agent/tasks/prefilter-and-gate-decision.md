---
id: T1
title: "Implement the pre-filter and gate decision script"
layer: "domain"
deps: []
blocks: ["T9"]
acs: ["AC-02", "AC-07", "AC-17"]
files_hint: [".github/scripts/prefilter.mjs", ".github/scripts/prefilter.test.mjs"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or contradicts the code in front of you, open the named file for the full text and follow that. Do not invent the missing part. -->

# T1 — Implement the pre-filter and gate decision script

## Place in the sequence

- **Blocked by:** — · **Blocks:** T9 — Create the agent workflow with triggers, concurrency and the gate job · **Wave:** 1.
- **Lane:** own lane.

## Why (user story)

> **As a** PR author
> **I want** the test agent to skip pull requests that contain no testable change
> **So that** documentation or styling changes don't cost time or money and don't add noise
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

> **As a** repository maintainer
> **I want** the test agent to be unable to change anything except allowed test files, and unable to expose credentials
> **So that** a hostile or prompt-injected pull request cannot turn the agent against the repository
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

Decides, without any model, whether a pull request or backfill request gets an agent run, and which files are testable.

## Inlined context

> - Testable change — a changed production source file (for backfill: any production source file in the chosen package) that passes the pre-filter, which excludes `*.md` and other docs, `*.stories.tsx`, `types.ts` and `*.d.ts`, `frontend/src/design-system/**`, `generated/**`, and every non-source file (package manifests, lockfiles, configs, the Prisma schema, Dockerfiles). NOT any changed file.
>
> — `CONTEXT.md §Glossary, Testable change, verbatim` · full text: [CONTEXT.md](../CONTEXT.md)

> | Run duties | gate: trigger checks, maintainer role, pre-filter, skip reason. verify: baseline coverage (backfill: package before), patched coverage, stability. publish: trust checks, the no-model skip notice (AC-02, rule paths), patch rules, commit to the pull-request branch or create the backfill branch and open its pull request (AC-16), report, check | here |
>
> — `sad.md §8, Run duties, verbatim` · full text: [sad.md](../sad.md)

> Stops that must not reach publish (fork, non-main base, bot commit, non-maintainer) produce **no** artifact; their reason goes to the job summary only.
>
> — `contracts/events.md, test_agent.gate.v1 Notes, verbatim` · full text: [sad.md](../sad.md)

> **Chosen:** option 1. The parts that write and that enforce the rules cannot be changed by the pull request they judge. Option 2 only protects main after the fact.
>
> — `adr/0004-take-agent-rules-from-main-and-skip-prs-touching-them.md, Decision outcome, verbatim` · full text: [0004-take-agent-rules-from-main-and-skip-prs-touching-them.md](../adr/0004-take-agent-rules-from-main-and-skip-prs-touching-them.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [events.md](../contracts/events.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Produces `testable.json` = `test_agent.gate.v1`: `schema, run_id, mode, head_sha, base_sha, pr_number, decision (run|skip), skip_reason (null|no_testable_change|rule_paths_changed), packages.{backend,frontend}.files, author_test_files`.
- Stops (fork, non-main base, bot commit, non-maintainer) → no artifact, reason to the job summary.

— `contracts/events.md, test_agent.gate.v1, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-02 (US-02) — happy

> **Given** a PR author's pull request contains no testable change (every changed file is excluded by the pre-filter)
> **When** the workflow runs
> **Then** no agent run starts, and a stage that uses no model posts a short notice in the agent report that the pull request was skipped because there is no testable change
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-07 (US-05) — authorization

> **Given** a pull request comes from a fork, or targets a branch other than main
> **When** the workflow is triggered
> **Then** the test agent does not run, receives no model access and no privileged trigger runs; the tests check still runs; and the PR author sees in the workflow result (not a pull-request comment) that the agent only serves same-repository pull requests to main (and on-demand backfill runs started by a repository maintainer)
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-17 (US-09) — authorization

> **Given** someone without the admin or maintain role in the repository tries to start an on-demand backfill run
> **When** the start is requested
> **Then** no agent run starts and no model access is granted, because only a repository maintainer may start a backfill run; the role is checked before any model access
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Export pure `classify(files)` applying the glossary pre-filter list; non-source files excluded — `.github/scripts/prefilter.mjs`
- [ ] Export pure `decide({event, baseRef, headRepo, repo, headAuthorIsBot, role, files, package})` returning run / skip / stop with reason — same file
- [ ] CLI entry: read event JSON + changed-file list + role from args/env, write `testable.json` or a job-summary line — same file
- [ ] Self-check `node --test` cases for every branch — `.github/scripts/prefilter.test.mjs`

## Edge cases

| Case | Behaviour |
|---|---|
| PR mixes docs and a source file | run, only the source file is listed |
| PR touches `.claude/` and a source file | skip, `rule_paths_changed` |
| only `package.json` / lockfile changed | skip, `no_testable_change` |
| fork PR | stop, reason in job summary, no artifact |
| base branch not main | stop, reason in job summary |
| head commit by the App bot | stop, no artifact |
| backfill by role `write` | stop, refusal in job summary |
| backfill `frontend` | all production sources of `frontend/src` after pre-filter, backend empty |

## Definition of Done

- [ ] `node --test .github/scripts/prefilter.test.mjs` passes, covering every edge case above
- [ ] every Hard Rule inlined above still holds
- [ ] `npm run typecheck` in both packages and `node --check` on changed scripts are clean
