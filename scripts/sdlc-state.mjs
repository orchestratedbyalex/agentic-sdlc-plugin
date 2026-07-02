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
      const agFlowM = line.match(/^\s{8}([\w-]+):\s*\{\s*status:\s*"?([^"}]*?)"?\s*\}\s*$/)
      if (agFlowM) {
        out.phases[curPhase].agents.push({ name: agFlowM[1], status: agFlowM[2].trim() })
        curAgent = null
        continue
      }
      const agM = line.match(/^\s{8}([\w-]+):\s*$/)
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
  // A setup phase counts as complete only when its status says so AND it has a non-empty
  // agent roster with every agent completed. This stops a corrupt / partial / hand-edited
  // file from unlocking the build phases on a summary field alone — the gate must verify
  // the underlying agent evidence, not trust phase.status in isolation.
  const setupComplete = SETUP_PHASES.every(k => {
    const ph = md.phases[k]
    return !!ph && ph.status === 'completed' &&
      Array.isArray(ph.agents) && ph.agents.length > 0 &&
      ph.agents.every(a => a.status === 'completed')
  })
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
      const fm = line.match(/^(\s{8})([\w-]+):\s*\{\s*status:\s*"?[^"}]*"?\s*\}\s*$/)
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
  const newLine = `  model_profile: "${profile}"`
  // Strip EVERY existing model_profile line first, so a duplicate key can't survive and the
  // operation is idempotent. Then insert exactly one line after the anchor.
  const lines = content.split('\n').filter(l => !/^\s{2}model_profile:/.test(l))
  let anchor = lines.findIndex(l => /^\s{2}methodology:/.test(l))
  if (anchor === -1) anchor = lines.findIndex(l => /^\s{2}version:/.test(l))
  if (anchor === -1) anchor = lines.findIndex(l => /^sdlc:\s*$/.test(l))
  // No recognizable anchor (malformed file): append rather than splice at index -1, which
  // would insert the key as line 0 — above the root key — and produce invalid YAML.
  if (anchor === -1) lines.push(newLine)
  else lines.splice(anchor + 1, 0, newLine)
  return lines.join('\n')
}

// Quote a value as a single-line YAML double-quoted scalar.
function yamlQuote(value) {
  return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ') + '"'
}

// Drop a 2-space-indented block: its `  <key>:` line plus every deeper-indented line after it.
function stripTopBlock(lines, key) {
  const res = []
  let skipping = false
  for (const line of lines) {
    if (skipping && /^ {3,}\S/.test(line)) continue
    skipping = false
    if (new RegExp(`^ {2}${key}:`).test(line)) { skipping = true; continue }
    res.push(line)
  }
  return res
}

// Deterministically set the sdlc.brief block (no YAML dependency, idempotent).
// The greenfield wizard records the collected brief through this — never via hand-edit.
export function setBrief(content, { purpose = '', stack = '', users = '', keyFeatures = '' }) {
  const block = [
    '  brief:',
    `    purpose: ${yamlQuote(purpose)}`,
    `    stack: ${yamlQuote(stack)}`,
    `    users: ${yamlQuote(users)}`,
    `    key_features: ${yamlQuote(keyFeatures)}`,
  ]
  const lines = stripTopBlock(content.split('\n'), 'brief')
  let anchor = lines.findIndex(l => /^ {2}model_profile:/.test(l))
  if (anchor === -1) anchor = lines.findIndex(l => /^ {2}methodology:/.test(l))
  if (anchor === -1) anchor = lines.findIndex(l => /^ {2}mode:/.test(l))
  if (anchor === -1) anchor = lines.findIndex(l => /^ {2}version:/.test(l))
  if (anchor === -1) anchor = lines.findIndex(l => /^sdlc:\s*$/.test(l))
  if (anchor === -1) lines.push(...block)
  else lines.splice(anchor + 1, 0, ...block)
  return lines.join('\n')
}

// Deterministically set requirement_counts (no YAML dependency, idempotent).
// The wizard records the totals reported by Requirements Sync through this — never via hand-edit.
export function setRequirementCounts(content, { functional, nonfunctional, userStories }) {
  const block = [
    '  requirement_counts:',
    `    functional: ${functional}`,
    `    nonfunctional: ${nonfunctional}`,
    `    user_stories: ${userStories}`,
  ]
  const src = content.split('\n')
  const at = src.findIndex(l => /^ {2}requirement_counts:/.test(l))
  const lines = stripTopBlock(src, 'requirement_counts')
  if (at === -1) {
    // No existing block (legacy file): append under the single sdlc root, before trailing blanks.
    let end = lines.length
    while (end > 0 && lines[end - 1].trim() === '') end--
    lines.splice(end, 0, ...block)
  } else {
    lines.splice(at, 0, ...block)
  }
  return lines.join('\n')
}

// Deterministically append a plan id to develop.plans (no YAML dependency, idempotent).
// The wizard records the PLAN id in post-phase through this — the list has a single writer.
// Returns null when there is no develop phase to write under.
export function appendPlan(content, id) {
  const lines = content.split('\n')
  let inPhases = false, inDevelop = false, developStatusIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^ {2}phases:\s*$/.test(line)) { inPhases = true; continue }
    if (inPhases && /^ {2}\S/.test(line)) { inPhases = false; inDevelop = false }
    if (!inPhases) continue
    const pm = line.match(/^ {4}(\w+):\s*$/)
    if (pm) { inDevelop = pm[1] === 'develop'; continue }
    if (!inDevelop) continue
    const fm = line.match(/^ {6}plans:\s*\[(.*)\]\s*$/)
    if (fm) {
      const ids = fm[1].split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean)
      if (ids.includes(id)) return content
      ids.push(id)
      lines[i] = `      plans: [${ids.map(x => `"${x}"`).join(', ')}]`
      return lines.join('\n')
    }
    if (developStatusIdx === -1 && /^ {6}status:/.test(line)) developStatusIdx = i
  }
  if (developStatusIdx !== -1) {
    lines.splice(developStatusIdx + 1, 0, `      plans: ["${id}"]`)
    return lines.join('\n')
  }
  return null
}

export const ASSESSMENTS = ['stable', 'maintain', 'evolve', 'urgent']

// Which phases a cycle assessment resets to "pending" for the next cycle.
const CYCLE_RESETS = {
  stable: [],
  maintain: ['develop', 'verify', 'release', 'operate'],
  urgent: ['develop', 'verify', 'release', 'operate'],
  evolve: ['define', 'design', 'develop', 'verify', 'release', 'operate'],
}

// Locate the [start, end) line range of one phase's body under `  phases:`.
function phaseRange(lines, phase) {
  let inPhases = false, start = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^ {2}phases:\s*$/.test(line)) { inPhases = true; continue }
    if (inPhases && /^ {2}\S/.test(line)) inPhases = false
    if (!inPhases) {
      if (start !== -1) return [start, i]
      continue
    }
    const pm = line.match(/^ {4}(\w+):\s*$/)
    if (pm) {
      if (start !== -1) return [start, i]
      if (pm[1] === phase) start = i + 1
    }
  }
  return start === -1 ? null : [start, lines.length]
}

const CYCLE_FIELD_RE = /^ {6}(completed|assessment|next_cycle|next_cycle_scope):/

// Deterministically record the Operate cycle assessment (no YAML dependency, idempotent):
// completes operate, writes the cycle record under it, bumps the sdlc.cycle counter, and
// resets the per-assessment phases for the next cycle. The wizard records the feedback-loop's
// reported assessment through this — never via hand-edit. Returns null on unknown assessment
// or a file without an operate phase.
export function recordCycle(content, { assessment, nextCycle, scope, reason, date }) {
  if (!CYCLE_RESETS[assessment]) return null
  let lines = updateStatus(content, { phase: 'operate', status: 'completed' }).split('\n')

  // Strip any previous cycle record under operate so a re-record replaces, never duplicates.
  let range = phaseRange(lines, 'operate')
  if (!range) return null
  const kept = []
  let skipUrgent = false
  for (let i = 0; i < lines.length; i++) {
    if (i >= range[0] && i < range[1]) {
      if (skipUrgent && /^ {7,}\S/.test(lines[i])) continue
      skipUrgent = false
      if (/^ {6}urgent:\s*$/.test(lines[i])) { skipUrgent = true; continue }
      if (CYCLE_FIELD_RE.test(lines[i])) continue
    }
    kept.push(lines[i])
  }
  lines = kept

  // Insert the fresh record right after operate's status line (before agents — parse-safe).
  range = phaseRange(lines, 'operate')
  let statusIdx = -1
  for (let i = range[0]; i < range[1]; i++) {
    if (/^ {6}status:/.test(lines[i])) { statusIdx = i; break }
  }
  if (statusIdx === -1) return null
  const fields = [
    `      completed: ${yamlQuote(date)}`,
    `      assessment: ${yamlQuote(assessment)}`,
    `      next_cycle: ${nextCycle ? 'true' : 'false'}`,
  ]
  if (scope) fields.push(`      next_cycle_scope: ${yamlQuote(scope)}`)
  if (assessment === 'urgent') {
    fields.push('      urgent:', `        triggered: ${yamlQuote(date)}`, `        reason: ${yamlQuote(reason || '')}`)
  }
  lines.splice(statusIdx + 1, 0, ...fields)

  // Bump the one 2-space cycle counter under the sdlc root.
  let n = 0
  lines = lines.filter(l => {
    const m = l.match(/^ {2}cycle:\s*(\d+)\s*$/)
    if (m) { n = parseInt(m[1], 10); return false }
    return true
  })
  const counter = `  cycle: ${n + 1}`
  let anchor = lines.findIndex(l => /^ {2}model_profile:/.test(l))
  if (anchor === -1) anchor = lines.findIndex(l => /^ {2}methodology:/.test(l))
  if (anchor === -1) anchor = lines.findIndex(l => /^ {2}version:/.test(l))
  if (anchor === -1) anchor = lines.findIndex(l => /^sdlc:\s*$/.test(l))
  if (anchor === -1) lines.push(counter)
  else lines.splice(anchor + 1, 0, counter)

  // Reset the next cycle's phases (status + agents) — the record above survives, as history.
  let out = lines.join('\n')
  for (const p of CYCLE_RESETS[assessment]) out = updateStatus(out, { phase: p, status: 'pending' })
  return out
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
  const content = readFileSync(metaPath, 'utf8')
  // Fail loudly on an agent that doesn't exist in this phase, instead of silently writing
  // nothing and reporting success — a typo'd --agent must not look like a completed update.
  if (opts.agent) {
    const ph = parseMetadata(content).phases[opts.phase]
    if (!ph || !ph.agents.some(a => a.name === opts.agent)) {
      process.stdout.write(JSON.stringify({ ok: false, error: `unknown agent '${opts.agent}' in phase '${opts.phase}' — nothing updated`, path: metaPath }, null, 2) + '\n')
      process.exitCode = 1
      return
    }
  }
  writeFileSync(metaPath, updateStatus(content, opts))
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

function cliFail(error) {
  process.stdout.write(JSON.stringify({ ok: false, error }, null, 2) + '\n')
  process.exitCode = 1
}

// Read the metadata file for a mutating command, or fail loudly. Returns null on failure.
function readMetaOrFail() {
  const metaPath = join(process.cwd(), 'docs/requirements/sdlc-metadata.yml')
  if (!existsSync(metaPath)) {
    cliFail('no metadata file; run init first')
    return null
  }
  return { metaPath, content: readFileSync(metaPath, 'utf8') }
}

// `brief --purpose P --stack S --users U --key-features F`
// Deterministically records the greenfield brief under sdlc.brief — never hand-edited.
function briefCmd(argv) {
  const opts = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--purpose') opts.purpose = argv[++i]
    else if (argv[i] === '--stack') opts.stack = argv[++i]
    else if (argv[i] === '--users') opts.users = argv[++i]
    else if (argv[i] === '--key-features') opts.keyFeatures = argv[++i]
  }
  const missing = [
    opts.purpose === undefined && '--purpose',
    opts.stack === undefined && '--stack',
    opts.users === undefined && '--users',
    opts.keyFeatures === undefined && '--key-features',
  ].filter(Boolean)
  if (missing.length) return cliFail(`missing required flag(s): ${missing.join(', ')}`)
  const meta = readMetaOrFail()
  if (!meta) return
  writeFileSync(meta.metaPath, setBrief(meta.content, opts))
  process.stdout.write(JSON.stringify({ ok: true, updated: 'brief' }, null, 2) + '\n')
}

// `counts --functional N --nonfunctional N --user-stories N`
// Deterministically records the requirement totals reported by Requirements Sync.
function countsCmd(argv) {
  const raw = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--functional') raw.functional = argv[++i]
    else if (argv[i] === '--nonfunctional') raw.nonfunctional = argv[++i]
    else if (argv[i] === '--user-stories') raw.userStories = argv[++i]
  }
  const counts = {}
  for (const [flag, key] of [['--functional', 'functional'], ['--nonfunctional', 'nonfunctional'], ['--user-stories', 'userStories']]) {
    if (raw[key] === undefined || !/^\d+$/.test(raw[key])) {
      return cliFail(`${flag} must be a non-negative integer`)
    }
    counts[key] = parseInt(raw[key], 10)
  }
  const meta = readMetaOrFail()
  if (!meta) return
  writeFileSync(meta.metaPath, setRequirementCounts(meta.content, counts))
  process.stdout.write(JSON.stringify({ ok: true, requirement_counts: { functional: counts.functional, nonfunctional: counts.nonfunctional, user_stories: counts.userStories } }, null, 2) + '\n')
}

// `plan-add --id PLAN-NNN`
// Deterministically appends the plan id to develop.plans (idempotent, single writer).
function planAddCmd(argv) {
  const opts = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--id') opts.id = argv[++i]
  }
  if (!opts.id || !/^[A-Za-z0-9._-]+$/.test(opts.id)) {
    return cliFail('--id must be a plan id like PLAN-001 (letters, digits, . _ - only)')
  }
  const meta = readMetaOrFail()
  if (!meta) return
  const out = appendPlan(meta.content, opts.id)
  if (out === null) return cliFail('no develop phase found in metadata — nothing updated')
  if (out !== meta.content) writeFileSync(meta.metaPath, out)
  const m = out.match(/^ {6}plans:\s*\[(.*)\]\s*$/m)
  const plans = m ? m[1].split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean) : []
  process.stdout.write(JSON.stringify({ ok: true, plans }, null, 2) + '\n')
}

// `cycle --assessment stable|maintain|evolve|urgent --next-cycle true|false [--scope S] [--reason R] [--date YYYY-MM-DD]`
// Deterministically records the Operate cycle assessment and resets phases for the next cycle.
function cycleCmd(argv) {
  const opts = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--assessment') opts.assessment = argv[++i]
    else if (argv[i] === '--next-cycle') opts.nextCycle = argv[++i]
    else if (argv[i] === '--scope') opts.scope = argv[++i]
    else if (argv[i] === '--reason') opts.reason = argv[++i]
    else if (argv[i] === '--date') opts.date = argv[++i]
  }
  const assessment = (opts.assessment || '').toLowerCase()
  if (!ASSESSMENTS.includes(assessment)) {
    return cliFail(`--assessment must be one of: ${ASSESSMENTS.join(', ')}`)
  }
  if (opts.nextCycle !== 'true' && opts.nextCycle !== 'false') {
    return cliFail('--next-cycle must be true or false')
  }
  const nextCycle = opts.nextCycle === 'true'
  if (assessment === 'stable' && nextCycle) return cliFail('a stable assessment requires --next-cycle false')
  if (assessment !== 'stable' && !nextCycle) return cliFail(`a ${assessment} assessment requires --next-cycle true`)
  if (assessment === 'urgent' && !opts.reason) return cliFail('an urgent assessment requires --reason (e.g. incident ids)')
  const date = opts.date || new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return cliFail('--date must be YYYY-MM-DD')
  const meta = readMetaOrFail()
  if (!meta) return
  const out = recordCycle(meta.content, { assessment, nextCycle, scope: opts.scope, reason: opts.reason, date })
  if (out === null) return cliFail('no operate phase found in metadata — nothing updated')
  writeFileSync(meta.metaPath, out)
  const cyc = Number((out.match(/^ {2}cycle:\s*(\d+)\s*$/m) || [])[1])
  const state = computeState({ hasMetadata: true, metadataContent: out, hasCode: detectCode(process.cwd()) })
  process.stdout.write(JSON.stringify({ ok: true, assessment, next_cycle: nextCycle, cycle: cyc, phase: state.phase }, null, 2) + '\n')
}

const COMMANDS = ['detect', 'init', 'complete', 'config', 'brief', 'counts', 'plan-add', 'cycle']

function main() {
  const cmd = process.argv[2]
  const rest = process.argv.slice(3)
  if (cmd === undefined || cmd === 'detect') detectCmd()
  else if (cmd === 'init') initCmd(rest)
  else if (cmd === 'complete') completeCmd(rest)
  else if (cmd === 'config') configCmd(rest)
  else if (cmd === 'brief') briefCmd(rest)
  else if (cmd === 'counts') countsCmd(rest)
  else if (cmd === 'plan-add') planAddCmd(rest)
  else if (cmd === 'cycle') cycleCmd(rest)
  else cliFail(`unknown command '${cmd}' — expected one of: ${COMMANDS.join(', ')}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
