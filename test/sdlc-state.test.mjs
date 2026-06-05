import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMetadata } from '../scripts/sdlc-state.mjs'

const SAMPLE = `sdlc:
  project: "demo"
  version: "1.2.3"
  phases:
    prepare:
      status: "completed"
    develop:
      status: "in_progress"
      agents:
        architect_planner:
          status: "completed"
        code_author:
          status: "pending"
`

test('parseMetadata reads project and version', () => {
  const md = parseMetadata(SAMPLE)
  assert.equal(md.valid, true)
  assert.equal(md.project, 'demo')
  assert.equal(md.version, '1.2.3')
})

test('parseMetadata reads phase status', () => {
  const md = parseMetadata(SAMPLE)
  assert.equal(md.phases.prepare.status, 'completed')
  assert.equal(md.phases.develop.status, 'in_progress')
})

test('parseMetadata reads per-agent status in order', () => {
  const md = parseMetadata(SAMPLE)
  assert.deepEqual(
    md.phases.develop.agents.map(a => [a.name, a.status]),
    [['architect_planner', 'completed'], ['code_author', 'pending']]
  )
})

test('parseMetadata marks empty content invalid', () => {
  assert.equal(parseMetadata('').valid, false)
})

import { computeState } from '../scripts/sdlc-state.mjs'

test('computeState: no metadata + no code = greenfield', () => {
  const s = computeState({ hasMetadata: false, metadataContent: '', hasCode: false })
  assert.equal(s.mode, 'greenfield')
  assert.equal(s.phase, 1)
  assert.equal(s.setupComplete, false)
  assert.equal(s.board.length, 7)
  assert.ok(s.board.every(p => p.status === 'pending'))
})

test('computeState: no metadata + code = existing', () => {
  const s = computeState({ hasMetadata: false, metadataContent: '', hasCode: true })
  assert.equal(s.mode, 'existing')
  assert.equal(s.phase, 1)
})

const MIDWAY = `sdlc:
  project: "midway"
  version: "0.2.0"
  phases:
    prepare:
      status: "completed"
    define:
      status: "completed"
    design:
      status: "completed"
    develop:
      status: "in_progress"
      agents:
        architect_planner:
          status: "completed"
        code_author:
          status: "completed"
        test_author:
          status: "pending"
    verify:
      status: "pending"
`

test('computeState: resume finds first non-completed phase', () => {
  const s = computeState({ hasMetadata: true, metadataContent: MIDWAY, hasCode: true })
  assert.equal(s.mode, 'resume')
  assert.equal(s.phase, 4) // develop
})

test('computeState: resume finds first non-completed agent (fine-grained)', () => {
  const s = computeState({ hasMetadata: true, metadataContent: MIDWAY, hasCode: true })
  assert.equal(s.agent, 'test_author')
})

test('computeState: setupComplete true when prepare+define+design done', () => {
  const s = computeState({ hasMetadata: true, metadataContent: MIDWAY, hasCode: true })
  assert.equal(s.setupComplete, true)
})

test('computeState: reads project/version on resume', () => {
  const s = computeState({ hasMetadata: true, metadataContent: MIDWAY, hasCode: true })
  assert.equal(s.project, 'midway')
  assert.equal(s.version, '0.2.0')
})

test('computeState: corrupt metadata = valid false', () => {
  const s = computeState({ hasMetadata: true, metadataContent: '', hasCode: true })
  assert.equal(s.valid, false)
})

import { detectCode } from '../scripts/sdlc-state.mjs'

test('detectCode: manifest present', () => {
  assert.equal(detectCode('/x', ['README.md', 'package.json']), true)
})

test('detectCode: source extension present', () => {
  assert.equal(detectCode('/x', ['main.py']), true)
})

test('detectCode: docs only = no code', () => {
  assert.equal(detectCode('/x', ['README.md', 'notes.txt']), false)
})
