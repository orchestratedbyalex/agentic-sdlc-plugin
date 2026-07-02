---
phase: operate
phase_number: 7
setup: "ensure docs/operate/ exists"
groups:
  - { mode: parallel, agents: [sdlc-operate-issue-triager, sdlc-operate-dependency-monitor, sdlc-operate-telemetry-monitor] }
  - { mode: conditional, agents: [sdlc-operate-incident-responder] }
  - { mode: sequential, agents: [sdlc-operate-feedback-loop] }
gate_after_each_group: true
post_phase: "record the cycle via the state script (cycle — completes operate, stores assessment/next_cycle, resets next-cycle phases); if next_cycle, begin a new cycle at the first pending phase"
---

# Phase 7 — Operate (Deliver & Support + Improve)

Operate and Develop are normally the same DevOps team (Software Production System model).

1. **Routine ops (parallel):** issue-triager (GitHub issues via `gh`), dependency-monitor
   (outdated + security advisories), telemetry-monitor (DORA metrics / NFR compliance — skip
   gracefully if no telemetry is configured). Dispatch the three concurrently; collect reports.
2. **Incident response (conditional):** if routine ops surfaced security/P0 flags, critical
   advisories, or SLO breaches, dispatch incident-responder — one
   `docs/operate/incident-<date>-<slug>.md` per incident (classification, root cause,
   containment + permanent fix). If nothing was flagged, skip this group.
3. **Feedback loop (sequential):** feedback-loop consumes all reports, creates new FR/NFR/US
   (status `proposed`) for gaps, updates the traceability matrix, writes
   `docs/operate/operate-report-<date>.md`, and reports its cycle assessment
   (STABLE | MAINTAIN | EVOLVE | URGENT) in a `CYCLE:` line — it never edits
   `sdlc-metadata.yml`.
   - **Gate FAIL:** if a routine-ops monitor errored out (rather than skipping gracefully),
     or the feedback-loop's final message lacks a parseable `CYCLE:` line (the deterministic
     cycle write depends on it), re-dispatch that agent ONCE with the defect named. If it
     fails again, STOP and emit `HUMAN_REVIEW_REQUIRED` — do not keep looping.

**On completion:** record the cycle deterministically from the feedback-loop's `CYCLE:` line —
never hand-edit the YAML:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs" cycle --assessment <a> --next-cycle <t|f> [--scope "..."] [--reason "..."]`.
The command completes operate (status + agents), stores the assessment, bumps the cycle
counter, and resets the next cycle's phases (MAINTAIN/URGENT → develop..operate pending;
EVOLVE → define..operate pending; STABLE = lifecycle complete). If `next_cycle` is true, the
wizard re-reads the board and begins the new cycle at the first pending phase.
