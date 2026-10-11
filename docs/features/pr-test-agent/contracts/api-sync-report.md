---
updated_at: "2026-10-11"
contract: events.md
---

# API sync report — pr-test-agent

**Interface kind:** `worker` (from `sad.md` frontmatter `target_surfaces`) → `contracts/events.md` only, no OpenAPI.
**data-model.md:** absent — legal fast-lane skip (no schema change: the feature has no datastore; `sad.md` §5 declares no entity, no staged migrations). Field origins below point to spec, SAD and glossary instead of schema columns.

## A. Field origins

| schema_path | origin | confidence |
|---|---|---|
| gate.mode | spec US-01 / US-09, AC-16 | high |
| gate.head_sha, base_sha, run_id, pr_number | sad.md §6 flow 1, flow 4 head check; spec AC-03, AC-13 | high |
| gate.decision, skip_reason | sad.md §6 flow 2 alt-branches; spec AC-02, ADR-0004 | high |
| gate.packages.*.files | CONTEXT «Testable change» pre-filter; flow 7 backfill clause | high |
| gate.author_test_files | spec AC-06 («added or changed in this pull request's diff») | high |
| patch (paths) | CONTEXT «Allowed test files»; spec AC-05 | high |
| decisions.completed, not_completed_reason | spec AC-09, AC-12; sad.md §6 flow 5 | high |
| decisions.skills_used | spec AC-03; sad.md §5 skill list | high |
| decisions.files[].decision | spec AC-03 (write, update or skip) | high |
| decisions.files[].reason | spec AC-03; length cap from sad.md §8 Report row | medium |
| decisions.files[].outcome | sad.md §6 flow 3 alt-branches; spec AC-04, AC-04b, AC-06, AC-06b, AC-12 | high |
| decisions.files[].defect | spec AC-04 (location, expected versus actual) | high |
| decisions.observations | spec AC-04b (backfill observation) | high |
| results.patch_sha256, kept_test_files | sad.md §5 verify duties; ties results to the exact patch | medium |
| results.unstable_test_files | spec AC-14; NFR «Stability runs» | high |
| results.tests.*.passed / failed | spec AC-03 (passed and failed counts) | high |
| results.coverage.*.measured | spec AC-15; sad.md §11 lcov row | high |
| results.coverage.*.diff, target_pct, target_met | spec NFR «Diff coverage target ≥ 80%»; AC-18 | high |
| results.coverage.*.uncovered_lines | spec AC-18 | high |
| results.coverage.*.package_before_pct / after_pct | spec AC-16; NFR backfill measurement | high |
| output.commit message, backfill branch name | sad.md §5 publish duties; naming is a contract proposal | medium |
| output.report marker | sad.md §8 Report row | high |
| output.check conclusions | sad.md §8 Check result row; spec AC-09 | high |

## B. Drift checklist

1. **Endpoint ↔ data-model** *(core)* — ✓ (fallback: no data model, no existing schema touched). Every artifact maps to a §4 user story: gate → US-02, US-05, US-09; patch → US-01, US-05; decisions → US-03, US-04; results → US-03, US-07; outputs → US-01, US-03, US-07, US-08, US-09.
2. **Error code ↔ repo error definition** *(core)* — ✓ with note: no error registry exists in the repo for CI automation; the `test_agent.*` codes in events.md are the contract's proposal and become the constants in the publish script.
3. **Validation ↔ constraint** *(core)* — ✓. Path rules = CONTEXT «Allowed test files» globs verbatim; target 80 = spec §6; stability 3 runs = spec §6; package enum = spec AC-16; role check = CONTEXT «Repository maintainer».
4. **Contract ↔ sequence** *(supporting)* — ✗ one flag: `test_agent.artifact_invalid` (schema failure or `head_sha` mismatch between artifacts) and «agent or verify job crashed» have no explicit `alt` branch in `sad.md` §6 flows 4/5. Follow-up: fold into flow 4/5 when the SAD is next touched; behaviour is already fixed here (no commit, check neutral, reason in report).

**Back-feed — AC coverage:** AC-01 committed · AC-02 skipped_no_testable_change · AC-03 report fields + results.tests/coverage · AC-04 outcome suspected_defect · AC-04b intent_unclear / observations · AC-05 path_not_allowed, test_file_deleted · AC-06 author_test_flagged + author_assertion_changed · AC-06b tests_updated · AC-07 job summary, no artifact · AC-08 secret_detected (sandbox part is non-contract, `sad.md` §8) · AC-09 not_completed · AC-10 commit by App identity · AC-11 cancelled → no output · AC-12 limit_reached · AC-13 outdated · AC-14 unstable_test_files · AC-15 measured false · AC-16 backfill branch + before/after · AC-17 job summary, no artifact · AC-18 target_met false + uncovered_lines. Every AC covered; every artifact traces to ≥1 user story.

**Result:** 3/3 core ✓, 1 supporting flag (non-blocking, noted above). No pause.
