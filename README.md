# Agentic SDLC — Claude Code Plugin

A standards-anchored, agent-driven Software Development Lifecycle for Claude Code.
Run one command — `/agentic-sdlc:sdlc` (short: `/sdlc`) — and the wizard detects your
project state and drives seven phases (Prepare → Define → Design → Develop → Verify →
Release → Operate) with a roster of **35 specialized subagents**.

## Requirements

- **Claude Code** (CLI, desktop, web, or IDE extension).
- **Node.js 18+** — the plugin's only executable (`scripts/sdlc-state.mjs`) is zero-dependency
  ESM and uses the built-in `node:test` runner. No `npm install` step.

## Install (from the marketplace)

```text
# inside Claude Code:
/plugin marketplace add orchestratedbyalex/agentic-sdlc-plugin
/plugin install agentic-sdlc@agentic-sdlc-marketplace
/agentic-sdlc:sdlc
```

## Install (local development)

```bash
claude --plugin-dir /ABSOLUTE/PATH/TO/agentic-sdlc-plugin
# inside Claude Code:
/reload-plugins
/agentic-sdlc:sdlc
```

## Quick start

Run `/sdlc` in any repository. The wizard:

1. **Detects state** — `greenfield` (empty folder), `existing` (code, no SDLC metadata), or
   `resume` (metadata present) — and prints a seven-phase status board.
2. **Routes you** — scaffolds a greenfield skeleton, sets up an existing repo, or resumes
   exactly where you left off (down to the specific agent).
3. **Drives each phase** by dispatching its subagents (in parallel where independent), runs a
   validation **gate** after each group, and routes failures back to the responsible author.
4. **Records evidence** in *your* repo — requirements under `docs/requirements/`, design under
   `docs/design/`, operations under `docs/operate/`, and all state in
   `docs/requirements/sdlc-metadata.yml`.

State is deterministic and resumable: every status change goes through `sdlc-state.mjs`, never
an ad-hoc edit, so you can stop and resume any time.

## The seven phases

| Phase | Purpose | Anchored in |
|-------|---------|-------------|
| **Prepare** | Map the project; produce a CLAUDE.md the agents can rely on | ISO/IEC/IEEE 12207 |
| **Define** | Functional / non-functional requirements + user stories, gated | IEEE 12207 |
| **Design** | Architecture, component specs, ADRs, STRIDE-lite threat model | IEEE 1016, Microsoft SDL, Nygard ADRs |
| **Develop** | Plan → implement + test (proportionate to change tier) → review | Microsoft SDL |
| **Verify** | Coverage, independent review, real production build, regression | IEEE 1012, ISO/IEC 25010 |
| **Release** | Changelog, version bump, staged commit + tag (human-gated) | ITIL 4 |
| **Operate** | Triage, dependency/telemetry monitoring, feedback into the next cycle | ITIL 4, ISO/IEC 27001, DORA |

## How it's built (the two-zone model)

The plugin carries the **process** ("how"); your target repository receives the **evidence**
("what" — requirements, design docs, `sdlc-metadata.yml`). That separation is load-bearing:
the plugin stays generic, your repo accumulates the lifecycle record.

- The `/sdlc` wizard (`commands/sdlc.md`) — the orchestrator entry point.
- **35 subagents** (`agents/`), dispatched via the Task tool, honoring parallelism and a strict
  **reviewer ≠ author** rule (reviewers are read-only).
- **7 machine-readable phase playbooks** (`phases/`) — groups, modes, gates, post-phase state.
- **Deterministic, tested state** (`scripts/sdlc-state.mjs`) — the single source of metadata truth.
- Artifact templates (`templates/`) and two skills (`sdlc-conventions`, `sdlc-feature-intake`).
- **Configurable model routing** (`quality` / `balanced` / `economy`) that never downgrades the
  judgment-bearing agents or the gates.

## Test

```bash
node --test          # 31 tests, all green (state logic + plugin structure)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the design invariants, agent conventions, and the
version-bump policy. Contributor guidance for working *in* this repo lives in
[CLAUDE.md](CLAUDE.md).

## License

[MIT](LICENSE.md) © 2026 [@orchestratedbyalex](https://github.com/orchestratedbyalex).
