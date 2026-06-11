---
phase: verify
phase_number: 5
setup: ""
groups:
  - { mode: parallel, agents: [sdlc-verify-coverage-analyst, sdlc-verify-independent-code-reviewer, sdlc-verify-static-dynamic-analyzer, sdlc-verify-regression-tester] }
  - { mode: sequential, agents: [sdlc-verify-validation-reviewer] }
gate_after_each_group: true
post_phase: "READY FOR RELEASE → set verify.status + agent statuses completed; REWORK REQUIRED → do NOT update status, route blockers back to Phase 4"
---

# Phase 5 — Verify (Verification + Validation, IEEE 1012)

Prerequisite: the Develop phase has completed the change(s) under verification.

1. **Verification group (parallel):** coverage-analyst, independent-code-reviewer,
   static-dynamic-analyzer, regression-tester — dispatch all four in one message. They
   answer "are we building it right?" (read-only; the independent reviewer did NOT author
   the code). The static-dynamic-analyzer MUST run the project's **production build** (the
   deployable artifact, not the unit-test toolchain — they can differ) and the
   regression-tester must confirm the suite actually **executed** (0 suites collected =
   FAIL, not a pass). A failing build, or a runner that errored out, is a gate BLOCKER even
   when types + unit assertions are green.
2. **Validation group (sequential):** validation-reviewer — consumes the four reports, runs
   UAT against the user stories, and is the release gate ("are we building the right thing?").
   The gate fails (REWORK REQUIRED) if the release build did not exit 0 and produce its
   artifact (condition c2).
   - **READY FOR RELEASE:** set every `verify.agents.*.status` and `verify.status` to `"completed"`.
   - **REWORK REQUIRED:** do NOT update status; route the blockers back to Phase 4 (Develop)
     and re-run Verify after they're fixed, per the bounded protocol below.
3. **Re-verification after REWORK (bounded — track the cycle count; cycle 1 = the initial run):**
   - **Cycle 2** (first re-run after the Phase 4 fixes): re-run **static-dynamic-analyzer +
     regression-tester IN FULL** (the mechanical safety net — a fix can break anything), and
     re-dispatch **coverage-analyst + independent-code-reviewer in RE-VERIFY mode**: pass each a
     `REVERIFY_SCOPE` block containing the rework diff (files changed since the failed verdict)
     and the prior blocker list, so they verify the fix and its blast radius rather than the
     whole change-set from scratch. The validation-reviewer always re-runs over the four fresh
     reports and must confirm every prior blocker is explicitly FIXED.
   - **Cycle 3:** FULL re-verification — all four agents from scratch, no scoping (repeated
     rework means the blast radius is not well understood; do not scope twice in a row).
   - **Still REWORK REQUIRED after cycle 3:** STOP and emit `HUMAN_REVIEW_REQUIRED` to the
     user — do not keep looping.
