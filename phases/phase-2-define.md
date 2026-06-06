---
phase: define
phase_number: 2
setup: "mkdir -p docs/requirements/{functional,nonfunctional,user-stories}"
groups:
  - { mode: parallel, agents: [sdlc-define-source-analyst, sdlc-define-test-analyst, sdlc-define-nfr-analyst] }
  - { mode: parallel, agents: [sdlc-define-fr-author, sdlc-define-nfr-author, sdlc-define-us-author] }
  - { mode: sequential, agents: [sdlc-define-requirement-reviewer] }
gate_after_each_group: true
post_phase: "write traceability-matrix.md + review-checklist.md; set define.status + agent statuses to completed; update requirement_counts"
---

# Phase 2 — Define

Run the setup command first. Then dispatch in three groups:

1. **Exploration (parallel):** sdlc-define-source-analyst, sdlc-define-test-analyst,
   sdlc-define-nfr-analyst — one Task message, three concurrent dispatches. Collect findings.
2. **Authoring (parallel):** sdlc-define-fr-author, sdlc-define-nfr-author,
   sdlc-define-us-author — pass the findings. They write FR/NFR/US docs.
3. **Validation (sequential):** sdlc-define-requirement-reviewer — runs the 7-point gate.
   - **Gate FAIL:** route the reported issues back to the relevant author, re-run the author,
     then re-run the reviewer. Repeat until PASS.

**On completion:** write `docs/requirements/traceability-matrix.md` and
`docs/requirements/review-checklist.md`; update `requirement_counts`; set every
`define.agents.*.status` and `define.status` to `"completed"`.
