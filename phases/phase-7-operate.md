---
phase: operate
phase_number: 7
setup: "ensure docs/operate/ exists"
groups:
  - { mode: parallel, agents: [sdlc-operate-issue-triager, sdlc-operate-dependency-monitor, sdlc-operate-telemetry-monitor] }
  - { mode: conditional, agents: [sdlc-operate-incident-responder] }
  - { mode: sequential, agents: [sdlc-operate-feedback-loop] }
gate_after_each_group: true
post_phase: "set operate.status + agent statuses completed; record cycle assessment + next_cycle; if next_cycle, begin a new cycle at the first pending phase"
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
   `docs/operate/operate-report-<date>.md`, and updates `sdlc-metadata.yml`. Its cycle
   assessment is one of STABLE | MAINTAIN | EVOLVE | URGENT.

**On completion:** set every `operate.agents.*.status` and `operate.status` to `"completed"`;
record the cycle assessment and `next_cycle: true|false`. If `next_cycle` is true, the wizard
re-reads the board and begins a new cycle at the first pending phase (MAINTAIN/EVOLVE/URGENT
reset the relevant phases; STABLE = lifecycle complete).
