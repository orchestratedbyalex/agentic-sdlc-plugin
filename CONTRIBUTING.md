# Contributing

Thanks for your interest in improving the Agentic SDLC plugin. This document covers how to
work in the repo and the constraints that keep it coherent. Working guidance for Claude Code
itself lives in [CLAUDE.md](CLAUDE.md).

## Project shape

There is no build step. Everything is markdown (commands, agents, playbooks, skills,
templates) except one zero-dependency Node ESM file, `scripts/sdlc-state.mjs`, which owns all
state. Tests use the built-in `node:test` runner.

```bash
node --test            # must stay green (39 tests: state logic + plugin structure)
claude --plugin-dir .  # load the plugin into a Claude Code session
/reload-plugins        # after edits, inside the session
```

## Design invariants — do not regress these

These were earned through live runs and multi-specialist review. Treat them as constraints.
The authoritative list (with rationale) is in [CLAUDE.md](CLAUDE.md); in brief:

1. **Reviewer ≠ author.** Review agents are read-only (`Read Grep Glob Bash`); only authors get
   `Write Edit`. Never give a reviewer write tools.
2. **Deterministic state.** Every `sdlc-metadata.yml` mutation goes through `sdlc-state.mjs`
   (`init` / `complete` / `config`) — never an LLM hand-edit of YAML.
3. **Exercise the real artifact.** Gates run the actual production build and confirm tests truly
   executed (0 suites collected = FAIL).
4. **Git stays human-gated.** Agents stage and suggest commits/tags; they never commit, tag,
   push, or publish.
5. **Don't yak-shave the target.** Pre-existing toolchain rot is a gate finding routed back, not
   something agents fix in the target repo.
6. **Proportionate ceremony.** Feature-intake tiers changes trivial/standard/complex (with hard
   security/interface/dependency floors); depth scales, the load-bearing checks never drop.
7. **Standards-anchored.** Each phase cites its source standard. Keep citations honest.
8. **Subagents return only their final message.** Keep orchestrator output terse.
9. **Model profiles never downgrade the gates.** Routing may run mechanical/analysis agents on
   smaller models, but full-tier agents always inherit the session model.

## Editing agents

- Frontmatter: `name`, `description`, `tools` (space-separated). `name` must equal the filename.
- Body: a context header (role, phase, what to read first, "FINAL MESSAGE is your return
  value") + `--- TASK ---` + the working prompt.
- After any change, run `node --test` — `test/plugin-structure.test.mjs` asserts the playbook
  set and the **35-agent** roster count. Don't let those drift silently; update the tests
  deliberately if the roster changes.

## Versioning & releases

The project follows [Semantic Versioning](https://semver.org). Because `plugin.json` carries an
explicit `version`, **bump it whenever you land user-visible change** — Claude Code keys updates
off that version, so a push without a bump won't reach installed users. Record changes in
[CHANGELOG.md](CHANGELOG.md) under `[Unreleased]`, then promote them under the new version on
release.

## Pull requests

- Keep `node --test` green and run `claude plugin validate .` before opening a PR.
- Prefer focused, thematic commits over a single mixed one.
- Don't introduce runtime dependencies — the state engine stays zero-dependency.

## License

By contributing, you agree your contributions are licensed under the [MIT License](LICENSE.md).
