# Diagrams

Visual documentation of how the plugin runs.

- **`agentic-sdlc-flow.excalidraw`** — the editable master. Open it at
  [excalidraw.com](https://excalidraw.com) (drag & drop) or with the VS Code / Obsidian
  Excalidraw extension. One canvas: an **Overview** frame (the lifecycle — `/sdlc` through the
  seven phases, the gates, the persisted state, the three human checkpoints, and the
  route-backs) plus a **detail frame per phase** (its agents, gate, what it produces, the state
  it writes, the human's what/why, and its standards as clickable chips).
- **`agentic-sdlc-flow.svg`** — a rendered snapshot of the same canvas, for viewing without
  Excalidraw (embeds, quick reference). If you edit the `.excalidraw`, re-export the SVG from
  Excalidraw (File → Export image → SVG) to keep it in sync.

An **interactive** web version — click a phase to open its detail — is published via GitHub
Pages, linked from the [How-it-works page](https://orchestratedbyalex.github.io/agentic-sdlc-plugin/).
