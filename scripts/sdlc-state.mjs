#!/usr/bin/env node
// sdlc-state.mjs — deterministic SDLC state detector for the /sdlc wizard.
// Zero dependencies. Pure core (parseMetadata/computeState/detectCode) + CLI.

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PHASES = ['prepare', 'define', 'design', 'develop', 'verify', 'release', 'operate']
export const SETUP_PHASES = ['prepare', 'define', 'design']

// Parse the known-shape metadata YAML without a YAML dependency.
// Returns { valid, project, version, phases: { key: { status, agents: [{name,status}] } } }
export function parseMetadata(content) {
  if (typeof content !== 'string' || content.trim() === '') {
    return { valid: false, project: null, version: null, phases: {} }
  }
  const out = { valid: true, project: null, version: null, phases: {} }
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
    }
  }
  const md = parseMetadata(metadataContent)
  if (!md.valid) {
    return { mode: 'resume', valid: false, project: null, version: null, board: [], phase: null, agent: null, setupComplete: false }
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
  return { mode: 'resume', valid: true, project: md.project, version: md.version, board, phase, agent, setupComplete }
}
