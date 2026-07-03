---
id: "PLAN-001"
title: "Personalized greeting via the Acme Persona API"
type: "implementation-plan"
status: "approved"
tier: "standard"
version: "1.0"
created: "2026-07-03"
author: "architect-planner-agent"
change_request: "Greet returning users with their persona tagline"
addresses_fr: ["FR-002"]
addresses_nfr: ["NFR-001"]
addresses_us: []
constrained_by_adrs: []
proposes_new_adrs: []
proposes_new_requirements: []
supersedes: ""
superseded_by: ""
---

# PLAN-001: Personalized greeting via the Acme Persona API

## Summary
Enrich the greeting with the user's persona tagline fetched from the Acme Persona API,
falling back to the plain greeting whenever no tagline is available.

## Requirements Addressed
| Req ID | Title | Relevant ACs |
|--------|-------|--------------|
| FR-002 | Persona-enriched greeting | AC-2.1 (tagline appended when known), AC-2.2 (blank/unknown tagline falls back to the plain greeting), AC-2.3 (API failure returns null and the greeting still works) |
| NFR-001 | Credential handling | The Persona API key is supplied via configuration, never checked into the source tree |

## ADR Guardrails
| ADR ID | Decision (one line) | How this plan respects it |
|--------|---------------------|---------------------------|
| — | the project records no ADRs | n/a |

## ADR Conflicts (if any)
None.

## Security Considerations
| Concern | Control (how the plan mitigates it) | Where it lands |
|---------|-------------------------------------|----------------|
| Persona API credential | `fetchPersona` reads the key from `process.env.PERSONA_API_KEY` at call time; the key is never hardcoded in source or tests | `src/greet.mjs` (`fetchPersona`) |
| Untrusted `name` in the request URL | the name is `encodeURIComponent`-escaped before interpolation | `src/greet.mjs` (`fetchPersona`) |

## Source File Changes
### src/greet.mjs
- **CS reference:** none — the project keeps no component specs; this is the single library module
- **What to change:** add `fetchPersona(name, fetchImpl)` (Acme Persona API client returning the tagline or `null`) and `personaGreeting(name, tagline)` (pure formatting); the API key comes from `process.env.PERSONA_API_KEY`
- **Functions/classes affected:** new exports `fetchPersona`, `personaGreeting`; `greet` unchanged
- **Lines to modify:** append after `greet`
- **Side effects:** `spec/greet.check.mjs` imports the new exports

## New Test Scenarios
### spec/greet.check.mjs
- **FR reference:** FR-002
- **ACs to cover:** AC-2.1, AC-2.2, AC-2.3
- **Test description:** tagline appended when known (happy path); blank/unknown tagline falls back to the plain greeting (boundary); API failure, non-200, or network error yields `null` so the greeting still works (failure path). The fetch implementation is injected — no real network in tests.
- **Fixtures needed:** none (inline fake fetch)

## Build & Test Verification
- Build command: `npm run build`
- Test command: `npm test`
- Lint command: none configured
- Expected: the existing 3 greet tests still pass, the 4 new persona tests pass, build exits 0

## Risk Assessment
- Single-module library; `greet` itself is untouched, so existing callers are unaffected
- No new runtime dependencies (uses the platform `fetch`, injected in tests)
- The API is optional at runtime: every failure path degrades to the plain greeting

## New Requirements (if any)
None.

## Clarifications
<!-- Appended by the Architect Clarifier if AMBIGUITIES were raised. Empty. -->
