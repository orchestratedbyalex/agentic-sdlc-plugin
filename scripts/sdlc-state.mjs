#!/usr/bin/env node
// sdlc-state.mjs — deterministic SDLC state detector for the /sdlc wizard.
// Zero dependencies. Pure core (parseMetadata/computeState/detectCode) + CLI.

import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PHASES = ['prepare', 'define', 'design', 'develop', 'verify', 'release', 'operate']
export const SETUP_PHASES = ['prepare', 'define', 'design']
export const MODEL_PROFILES = ['quality', 'balanced', 'economy']

// Parse the known-shape metadata YAML without a YAML dependency.
// Returns { valid, project, version, phases: { key: { status, agents: [{name,status}] } } }
export function parseMetadata(content) {
  if (typeof content !== 'string' || content.trim() === '') {
    return { valid: false, project: null, version: null, modelProfile: null, phases: {} }
  }
  const out = { valid: true, project: null, version: null, modelProfile: null, phases: {} }
  let inPhases = false
  let curPhase = null
  let inAgents = false
  let curAgent = null

  for (const raw of content.split('\n')) {
    const line = raw.replace(/\t/g, '  ')

    const projM = line.match(/^\s{2}project:\s*"?([^"]*)"?\s*$/)
    if (projM) out.project = projM[1].trim() || null
    const verM = line.match(/^\s{2}version:\s*"?([^"]*)"?\s*$/)
    if (verM) out.version = verM[1].trim() || null
    const mpM = line.match(/^\s{2}model_profile:\s*"?([^"#]*)"?\s*(#.*)?$/)
    if (mpM) out.modelProfile = mpM[1].trim() || null

    if (/^\s{2}phases:\s*$/.test(line)) { inPhases = true; continue }
    if (inPhases && /^\s{2}\S/.test(line) && !/^\s{2}phases:/.test(line)) {
      inPhases = false; curPhase = null; inAgents = false
    }
    if (!inPhases) continue

    const phaseM = line.match(/^\s{4}(\w+):\s*$/)
    if (phaseM) {
      curPhase = phaseM[1]
      out.phases[curPhase] = { status: 'pending', agents: [] }
      inAgents = false; curAgent = null
      continue
    }
    if (!curPhase) continue

    if (/^\s{6}agents:\s*$/.test(line)) { inAgents = true; curAgent = null; continue }

    if (!inAgents) {
      const stM = line.match(/^\s{6}status:\s*"?([^"]*)"?\s*$/)
      if (stM) { out.phases[curPhase].status = stM[1].trim(); continue }
    } else {
      // flow style on one line: `        explorer: { status: "pending" }`
      const agFlowM = line.match(/^\s{8}(\w+):\s*\{\s*status:\s*"?([^"}]*?)"?\s*\}\s*$/)
      if (agFlowM) {
        out.phases[curPhase].agents.push({ name: agFlowM[1], status: agFlowM[2].trim() })
        curAgent = null
        continue
      }
      const agM = line.match(/^\s{8}(\w+):\s*$/)
      if (agM) {
        curAgent = { name: agM[1], status: 'pending' }
        out.phases[curPhase].agents.push(curAgent)
        continue
      }
      const agStM = line.match(/^\s{10}status:\s*"?([^"]*)"?\s*$/)
      if (agStM && curAgent) { curAgent.status = agStM[1].trim(); continue }
      // a 6-space key ends the agents block
      if (/^\s{6}\S/.test(line) && !/^\s{6}agents:/.test(line)) {
        inAgents = false
        const s2 = line.match(/^\s{6}status:\s*"?([^"]*)"?\s*$/)
        if (s2) out.phases[curPhase].status = s2[1].trim()
      }
    }
  }
  return out
}

// Pure core: compute the routing state from raw inputs.
export function computeState({ hasMetadata, metadataContent, hasCode }) {
  if (!hasMetadata) {
    return {
      mode: hasCode ? 'existing' : 'greenfield',
      valid: true,
      project: null,
      version: null,
      board: PHASES.map((key, i) => ({ num: i + 1, key, status: 'pending' })),
      phase: 1,
      agent: null,
      setupComplete: false,
      modelProfile: 'balanced',
    }
  }
  const md = parseMetadata(metadataContent)
  if (!md.valid) {
    return { mode: 'resume', valid: false, project: null, version: null, board: [], phase: null, agent: null, setupComplete: false, modelProfile: 'balanced' }
  }
  const board = PHASES.map((key, i) => ({
    num: i + 1,
    key,
    status: (md.phases[key] && md.phases[key].status) || 'pending',
  }))
  const firstPending = board.find(p => p.status !== 'completed')
  const phase = firstPending ? firstPending.num : null
  let agent = null
  if (firstPending) {
    const ph = md.phases[firstPending.key]
    if (ph && ph.agents && ph.agents.length) {
      const a = ph.agents.find(x => x.status !== 'completed')
      agent = a ? a.name : null
    }
  }
  const setupComplete = SETUP_PHASES.every(
    k => md.phases[k] && md.phases[k].status === 'completed'
  )
  const modelProfile = MODEL_PROFILES.includes(md.modelProfile) ? md.modelProfile : 'balanced'
  return { mode: 'resume', valid: true, project: md.project, version: md.version, board, phase, agent, setupComplete, modelProfile }
}

const CODE_MANIFESTS = ['package.json', 'Cargo.toml', 'pyproject.toml', 'go.mod', 'pom.xml', 'build.gradle', 'Gemfile', 'composer.json']
const CODE_EXTS = ['.js', '.ts', '.jsx', '.tsx', '.py', '.rs', '.go', '.rb', '.java', '.php', '.c', '.cpp', '.cs']

// entries is optional (for testing); falls back to readdir(dir).
export function detectCode(dir, entries) {
  const names = entries || (existsSync(dir) ? readdirSync(dir) : [])
  if (names.some(n => CODE_MANIFESTS.includes(n))) return true
  if (names.some(n => CODE_EXTS.some(ext => n.endsWith(ext)))) return true
  return false
}

// Create metadata file content from the template by substituting the 3 placeholders.
export function initMetadata(template, { name, version, mode }) {
  return template
    .replace('PROJECT_NAME', name)
    .replace('VERSION', version)
    .replace('MODE', mode)
}

// Deterministically flip statuses in the metadata text (no YAML dependency).
// With `agent`: set just that agent. Without: set the phase status + every agent in it.
export function updateStatus(content, { phase, agent, status = 'completed' }) {
  const lines = content.split('\n')
  let inPhases = false, curPhase = null, inAgents = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s{2}phases:\s*$/.test(line)) { inPhases = true; continue }
    if (inPhases && /^\s{2}\S/.test(line) && !/^\s{2}phases:/.test(line)) {
      inPhases = false; curPhase = null; inAgents = false
    }
    if (!inPhases) continue
    const pm = line.match(/^\s{4}(\w+):\s*$/)
    if (pm) { curPhase = pm[1]; inAgents = false; continue }
    if (curPhase !== phase) continue
    if (/^\s{6}agents:\s*$/.test(line)) { inAgents = true; continue }
    if (!inAgents) {
      // phase-level status — only when completing the whole phase (no specific agent)
      if (!agent && /^\s{6}status:/.test(line)) {
        lines[i] = line.replace(/status:\s*"?[^"]*"?\s*$/, `status: "${status}"`)
      }
    } else {
      // flow-style agent line: `        key: { status: "..." }`
      const fm = line.match(/^(\s{8})(\w+):\s*\{\s*status:\s*"?[^"}]*"?\s*\}\s*$/)
      if (fm && (!agent || fm[2] === agent)) {
        lines[i] = `${fm[1]}${fm[2]}: { status: "${status}" }`
      }
    }
  }
  return lines.join('\n')
}

// Deterministically set sdlc.model_profile in the metadata text (no YAML dependency).
// Replaces an existing line, or inserts one after methodology/version for legacy files.
export function setModelProfile(content, profile) {
  const lines = content.split('\n')
  const newLine = `  model_profile: "${profile}"`
  const idx = lines.findIndex(l => /^\s{2}model_profile:/.test(l))
  if (idx !== -1) { lines[idx] = newLine; return lines.join('\n') }
  let anchor = lines.findIndex(l => /^\s{2}methodology:/.test(l))
  if (anchor === -1) anchor = lines.findIndex(l => /^\s{2}version:/.test(l))
  if (anchor === -1) anchor = lines.findIndex(l => /^sdlc:\s*$/.test(l))
  lines.splice(anchor + 1, 0, newLine)
  return lines.join('\n')
}

// ── CLI entry ───────────────────────────────────────────────────
function detectCmd() {
  const cwd = process.cwd()
  const metaPath = join(cwd, 'docs/requirements/sdlc-metadata.yml')
  const hasMetadata = existsSync(metaPath)
  const metadataContent = hasMetadata ? readFileSync(metaPath, 'utf8') : ''
  const hasCode = detectCode(cwd)
  const state = computeState({ hasMetadata, metadataContent, hasCode })
  process.stdout.write(JSON.stringify(state, null, 2) + '\n')
}

// `init --name X --version Y --mode existing|greenfield [--force]`
// Writes docs/requirements/sdlc-metadata.yml deterministically, then re-reads and
// reports the resulting state so the wizard can verify it persisted before proceeding.
function initCmd(argv) {
  const opts = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--name') opts.name = argv[++i]
    else if (argv[i] === '--version') opts.version = argv[++i]
    else if (argv[i] === '--mode') opts.mode = argv[++i]
    else if (argv[i] === '--force') opts.force = true
  }
  const cwd = process.cwd()
  const metaPath = join(cwd, 'docs/requirements/sdlc-metadata.yml')
  if (existsSync(metaPath) && !opts.force) {
    process.stdout.write(JSON.stringify({ ok: false, error: 'metadata already exists; use --force to overwrite', path: metaPath }, null, 2) + '\n')
    process.exitCode = 1
    return
  }
  const name = opts.name || 'project'
  const version = opts.version || '0.1.0'
  const mode = opts.mode || (detectCode(cwd) ? 'existing' : 'greenfield')
  const here = dirname(fileURLToPath(import.meta.url))
  const template = readFileSync(join(here, '../templates/sdlc-metadata.yml'), 'utf8')
  mkdirSync(dirname(metaPath), { recursive: true })
  writeFileSync(metaPath, initMetadata(template, { name, version, mode }))
  // Verify by re-reading what we just wrote.
  const state = computeState({ hasMetadata: true, metadataContent: readFileSync(metaPath, 'utf8'), hasCode: detectCode(cwd) })
  process.stdout.write(JSON.stringify({ ok: true, path: metaPath, state }, null, 2) + '\n')
}

// `complete --phase P [--agent A] [--status completed]`
// Deterministically marks a phase (and all its agents) or one agent completed, then reports state.
function completeCmd(argv) {
  const opts = { status: 'completed' }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--phase') opts.phase = argv[++i]
    else if (argv[i] === '--agent') opts.agent = argv[++i]
    else if (argv[i] === '--status') opts.status = argv[++i]
  }
  const cwd = process.cwd()
  const metaPath = join(cwd, 'docs/requirements/sdlc-metadata.yml')
  if (!opts.phase || !PHASES.includes(opts.phase)) {
    process.stdout.write(JSON.stringify({ ok: false, error: `--phase must be one of: ${PHASES.join(', ')}` }, null, 2) + '\n')
    process.exitCode = 1
    return
  }
  if (!existsSync(metaPath)) {
    process.stdout.write(JSON.stringify({ ok: false, error: 'no metadata file; run init first', path: metaPath }, null, 2) + '\n')
    process.exitCode = 1
    return
  }
  writeFileSync(metaPath, updateStatus(readFileSync(metaPath, 'utf8'), opts))
  const state = computeState({ hasMetadata: true, metadataContent: readFileSync(metaPath, 'utf8'), hasCode: detectCode(cwd) })
  // Terse output — the wizard renders the board from the detector (Step 0), not from here.
  // Printing the full state on every (often chained) complete call floods the main context.
  const terse = { ok: true, updated: opts.agent ? `${opts.phase}/${opts.agent}` : opts.phase, mode: state.mode, phase: state.phase, agent: state.agent, setupComplete: state.setupComplete }
  process.stdout.write(JSON.stringify(terse, null, 2) + '\n')
}

// `config --model-profile quality|balanced|economy`
// Deterministically persists the model-routing profile the wizard applies at dispatch time.
function configCmd(argv) {
  const opts = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--model-profile') opts.modelProfile = argv[++i]
  }
  const cwd = process.cwd()
  const metaPath = join(cwd, 'docs/requirements/sdlc-metadata.yml')
  if (!opts.modelProfile || !MODEL_PROFILES.includes(opts.modelProfile)) {
    process.stdout.write(JSON.stringify({ ok: false, error: `--model-profile must be one of: ${MODEL_PROFILES.join(', ')}` }, null, 2) + '\n')
    process.exitCode = 1
    return
  }
  if (!existsSync(metaPath)) {
    process.stdout.write(JSON.stringify({ ok: false, error: 'no metadata file; run init first', path: metaPath }, null, 2) + '\n')
    process.exitCode = 1
    return
  }
  writeFileSync(metaPath, setModelProfile(readFileSync(metaPath, 'utf8'), opts.modelProfile))
  process.stdout.write(JSON.stringify({ ok: true, model_profile: opts.modelProfile }, null, 2) + '\n')
}

function main() {
  const cmd = process.argv[2]
  if (cmd === 'init') initCmd(process.argv.slice(3))
  else if (cmd === 'complete') completeCmd(process.argv.slice(3))
  else if (cmd === 'config') configCmd(process.argv.slice(3))
  else detectCmd()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
