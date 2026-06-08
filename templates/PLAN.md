---
id: "PLAN-NNN"
title: "<short title>"
type: "implementation-plan"
status: "approved"             # proposed | approved | superseded
version: "1.0"                 # string — the Architect Clarifier bumps "1.0" → "1.1"
created: "YYYY-MM-DD"
author: "architect-planner-agent"
change_request: "<one-line summary>"
addresses_fr: []               # e.g. ["FR-016"]
addresses_nfr: []              # e.g. ["NFR-003"]
addresses_us: []               # e.g. ["US-015"]
constrained_by_adrs: []        # e.g. ["ADR-004"]
proposes_new_adrs: []          # ADR ids the developer will author; [] = none
proposes_new_requirements: []  # placeholder ids Requirements Sync will create; [] = none
supersedes: ""                 # set by the Architect Clarifier on a structural rewrite
superseded_by: ""              # set when this plan is later superseded
---

<!-- This is the single source of truth for PLAN frontmatter + sections.
     The Architect Planner MUST follow it exactly; downstream agents read these
     section names. Keep this file and the architect-planner prompt identical. -->

# PLAN-NNN: <Title>

## Summary
One sentence: what this change does and why.

## Requirements Addressed
| Req ID | Title | Relevant ACs |
|--------|-------|--------------|

## ADR Guardrails
| ADR ID | Decision (one line) | How this plan respects it |
|--------|---------------------|---------------------------|

## ADR Conflicts (if any)
- Existing ADR-XXX says <decision>, but this change requires <opposite>.
- Resolution: adjust the plan, or propose a superseding ADR-YYY.

## Security Considerations
<!-- Proportionate to the change. If it touches NO secrets/credentials, auth, untrusted
     input, shell/SQL/paths, sensitive data, or dependencies, write exactly:
     "none — rationale: <why>". Otherwise one row per concern. -->
| Concern | Control (how the plan mitigates it) | Where it lands |
|---------|-------------------------------------|----------------|

## Source File Changes
### <file path>
- **CS reference:** CS-XXX
- **What to change:** <specific modification>
- **Functions/classes affected:** <names>
- **Lines to modify:** <approx range>
- **Side effects:** <what other files import from this file>

(Repeat per file)

## New Test Scenarios
### <test file>
- **FR reference:** FR-XXX
- **ACs to cover:** AC-1, AC-3
- **Test description:** what each case verifies — include boundary and failure cases, not only the happy path
- **Fixtures needed:** any new fixture setup

(Repeat per file)

## Build & Test Verification
- Build command: <from CLAUDE.md>
- Test command: <from CLAUDE.md>
- Lint command: <from CLAUDE.md>
- Expected: existing tests still pass, new tests pass, lint clean

## Risk Assessment
- High-change-impact files (imported by many others)
- Backward-compatibility concerns
- Platform-specific considerations

## New Requirements (if any)
Behaviors introduced by this change that require new FR/US docs. Requirements Sync creates
these after the change is implemented (listed in `proposes_new_requirements`).

## Clarifications
<Appended by the Architect Clarifier if AMBIGUITIES were raised. Empty initially.>
