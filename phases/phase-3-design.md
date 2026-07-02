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
post_phase: "present the HUMAN_CHECKPOINT design & ADR sign-off; on approve, flip approved proposed ADRs to accepted, then complete design with --evidence citing gate PASS + user sign-off; set design.adrs_count"
---

# Phase 3 — Design

Run setup. Then dispatch:

1. **Exploration (parallel):** architecture-explorer, decisions-explorer. Both read prior
   accepted ADRs as guardrails.
2. **Authoring (parallel):** architecture-author (includes the STRIDE-lite Trust Boundaries
   & Threats section — Microsoft SDL design-time threat modeling), component-spec-author.
3. **ADR consolidation (sequential):** adr-traceability-author — writes the ADRs (Nygard),
   the ADR index, and design-traceability.md. Decisions already embodied in the code enter
   as `accepted` (retroactive record); decisions newly made in THIS design phase enter as
   `proposed` — the human accepts them at the sign-off checkpoint, not the agent.
4. **Validation (sequential):** design-reviewer — 9-point gate.
   - **Gate FAIL:** route issues to the relevant author, re-run, re-review. If the gate FAILs
     **3** times (or a previously-cleared issue reappears), STOP and emit
     `HUMAN_REVIEW_REQUIRED` — do not keep looping.

**On completion:** present the **design & ADR sign-off** (`HUMAN_CHECKPOINT`, see the
wizard): summarize the architecture choice and, for EACH `proposed` ADR, its decision, the
alternative it rejected, and the cost being accepted — the trade-offs are the human's call,
not the agent's. Only on **approve**: flip each approved ADR from `proposed` to `accepted`
(frontmatter `status:`, the `## Status` section, its `adrs/README.md` row — mechanical
orchestrator edits), then set every `design.agents.*.status` and `design.status` to
`"completed"` with
`complete --phase design --evidence "design-reviewer VERDICT: PASS <date>; user sign-off <date>"`;
set `design.adrs_count` to the number of ADRs written. `implementation-plans/` stays empty
(Phase 4 populates it per change).
