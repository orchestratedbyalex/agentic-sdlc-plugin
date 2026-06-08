---
name: sdlc-conventions
description: Reference for Agentic SDLC artifact schemas, the four focus tracks, and the five practice categories. Use when authoring or validating SDLC artifacts (ADR, PLAN, FR, NFR, US, CS, DI) or sdlc-metadata.yml.
---

# Agentic SDLC — Conventions

This skill is the single reference for the artifacts the SDLC agents produce. Templates
live in `${CLAUDE_PLUGIN_ROOT}/templates/`.

## Artifact locations (in the target repo)

| Artifact | Location | Template |
|---|---|---|
| State machine | `docs/requirements/sdlc-metadata.yml` | `templates/sdlc-metadata.yml` |
| Functional requirement | `docs/requirements/functional/FR-NNN-*.md` | `templates/FR.md` |
| Non-functional requirement | `docs/requirements/nonfunctional/NFR-NNN-*.md` | `templates/NFR.md` |
| User story | `docs/requirements/user-stories/US-NNN-*.md` | `templates/US.md` |
| Architecture decision record | `docs/design/adrs/ADR-NNN-*.md` | `templates/ADR.md` |
| Component spec | `docs/design/component-specs/CS-NNN-*.md` | `templates/CS.md` |
| Dependency interface | `docs/design/dependency-interfaces/DI-NNN-*.md` | `templates/DI.md` |
| Implementation plan | `docs/design/implementation-plans/PLAN-NNN-*.md` | `templates/PLAN.md` |

## ADRs (Michael Nygard 2011)
Title / Status / Context / Decision / Consequences. One file per decision. Accepted ADRs
are guardrails: Design and Develop agents MUST read them before producing work and may
not violate them without superseding the ADR.

## Four focus tracks
Cross-cutting concerns tagged on NFRs (and optionally ADRs):

| Track | Anchor | Covers |
|---|---|---|
| `quality` | ISO/IEC 25010 | functional suitability, performance, reliability, maintainability… |
| `security` | ISO/IEC 27001 | confidentiality, integrity, availability; threat modeling |
| `eco` | Green IT | carbon, resource/energy efficiency |
| `ai` | Responsible AI | model governance, AI-driven productivity |

When the `security` track applies to a change, the Develop planner records **Security
Considerations** in the PLAN (proportionate to the change), the code author follows the security
guardrails, and the reviewer's SECURITY check verifies them — secrets, injection, input
validation, and new dependencies are checked on every change, with an explicit "none → proceed"
for changes that aren't security-relevant.

## Five practice categories
RP (Required Practice — comply or document an exception), GP (Good Practice),
G (Guideline), Tooling, Evidence. Validation agents enforce RPs; author agents produce
Evidence; when an RP is not relevant, document the exception.

## Reviewer ≠ author
Review/validation agents run as isolated subagents with fresh context that did not author
the work under review (Microsoft SDL).

## Requirements sync
Every new behavior added in Develop becomes a new FR + US wired into
`docs/requirements/traceability-matrix.md`. No orphan features.

## Exploring the target repo (read hygiene)
When inventorying or searching the codebase, respect what the project already ignores —
this keeps explore/analysis agents fast on real-world repos:

- **Enumerate with `git ls-files`.** It lists only tracked files, so everything in
  `.gitignore` (dependencies, build output, caches) is excluded automatically. For
  untracked-but-wanted files add `git ls-files --others --exclude-standard`.
- **Never read or traverse dependency / build / vendor directories:** `node_modules/`,
  `vendor/`, `target/`, `dist/`, `build/`, `out/`, `.next/`, `.venv/`, `venv/`,
  `__pycache__/`, `coverage/`, `.git/` (and anything else `.gitignore` lists).
- **Scope `Glob`/`Grep` to source directories** (e.g. `src/`) rather than repo-root `**`
  globs that descend into the directories above.
- If the project is **not** a git repo, fall back to `find`/`Glob` with those directories
  explicitly excluded.
