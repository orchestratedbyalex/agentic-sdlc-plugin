---
phase: design
phase_number: 3
setup: "mkdir -p docs/design/{component-specs,dependency-interfaces,adrs,implementation-plans}"
groups:
  - { mode: parallel, agents: [sdlc-design-architecture-explorer, sdlc-design-decisions-explorer] }
  - { mode: parallel, agents: [sdlc-design-architecture-author, sdlc-design-component-spec-author] }
  - { mode: sequential, agents: [sdlc-design-adr-traceability-author] }
  - { mode: sequential, agents: [sdlc-design-reviewer] }
gate_after_each_group: true
post_phase: "set design.status + agent statuses completed; set design.adrs_count"
---

# Phase 3 — Design

Run setup. Then dispatch:

1. **Exploration (parallel):** architecture-explorer, decisions-explorer. Both read prior
   accepted ADRs as guardrails.
2. **Authoring (parallel):** architecture-author (includes the STRIDE-lite Trust Boundaries
   & Threats section — Microsoft SDL design-time threat modeling), component-spec-author.
3. **ADR consolidation (sequential):** adr-traceability-author — writes the ADRs (Nygard),
   the ADR index, and design-traceability.md.
4. **Validation (sequential):** design-reviewer — 9-point gate.
   - **Gate FAIL:** route issues to the relevant author, re-run, re-review until PASS.

**On completion:** set every `design.agents.*.status` and `design.status` to `"completed"`;
set `design.adrs_count` to the number of ADRs written. `implementation-plans/` stays empty
(Phase 4 populates it per change).
