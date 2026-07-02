import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  return m ? m[1] : null
}

test('every agent file has name + description + tools', () => {
  const dir = join(ROOT, 'agents')
  for (const f of readdirSync(dir).filter(f => f.endsWith('.md'))) {
    const fm = frontmatter(readFileSync(join(dir, f), 'utf8'))
    assert.ok(fm, `${f}: no frontmatter`)
    assert.match(fm, /name:\s*\S+/, `${f}: no name`)
    assert.match(fm, /description:\s*\S+/, `${f}: no description`)
    assert.match(fm, /tools:\s*\S+/, `${f}: no tools`)
  }
})

test('agent name matches its filename', () => {
  const dir = join(ROOT, 'agents')
  for (const f of readdirSync(dir).filter(f => f.endsWith('.md'))) {
    const fm = frontmatter(readFileSync(join(dir, f), 'utf8'))
    const name = fm.match(/name:\s*(\S+)/)[1]
    assert.equal(name, f.replace(/\.md$/, ''), `${f}: name/filename mismatch`)
  }
})

test('every agent referenced in a phase playbook exists', () => {
  const phasesDir = join(ROOT, 'phases')
  const agentNames = new Set(
    readdirSync(join(ROOT, 'agents')).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))
  )
  for (const f of readdirSync(phasesDir).filter(f => f.endsWith('.md'))) {
    const fm = frontmatter(readFileSync(join(phasesDir, f), 'utf8'))
    // Extract agent names only from the `agents: [ ... ]` lists in the group frontmatter,
    // so unrelated `sdlc-*` tokens in prose fields (e.g. "sdlc-metadata.yml") are ignored.
    const refs = [...fm.matchAll(/agents:\s*\[([^\]]*)\]/g)]
      .flatMap(m => m[1].split(',').map(s => s.trim()).filter(Boolean))
    assert.ok(refs.length > 0, `${f}: no agents listed in frontmatter`)
    for (const r of refs) {
      assert.ok(agentNames.has(r), `${f} references missing agent ${r}`)
    }
  }
})

test('all 7 phase playbooks exist', () => {
  for (const n of ['phase-1-prepare', 'phase-2-define', 'phase-3-design', 'phase-4-develop',
                   'phase-5-verify', 'phase-6-release', 'phase-7-operate']) {
    assert.ok(existsSync(join(ROOT, 'phases', `${n}.md`)), `missing ${n}.md`)
  }
})

test('the full 35-agent roster is present', () => {
  const n = readdirSync(join(ROOT, 'agents')).filter(f => f.endsWith('.md')).length
  assert.equal(n, 35, `expected 35 agent files, found ${n}`)
})

// Gate reports must carry verbatim execution evidence (audit item 3): every agent that
// runs commands (tests / build / lint) has to quote the exact command, exit code, and the
// runner's own summary lines — counts without a verbatim block are claims, not evidence.
test('command-running gate reviewers require a verbatim Execution Evidence block', () => {
  const files = [
    'sdlc-develop-code-reviewer.md',
    'sdlc-verify-coverage-analyst.md',
    'sdlc-verify-static-dynamic-analyzer.md',
    'sdlc-verify-regression-tester.md',
    'sdlc-verify-validation-reviewer.md',
  ]
  for (const f of files) {
    const text = readFileSync(join(ROOT, 'agents', f), 'utf8')
    assert.match(text, /^#{2,3} Execution Evidence/m,
      `${f}: report template lacks an Execution Evidence section`)
    assert.match(text, /verbatim/i, `${f}: no verbatim-quoting requirement`)
  }
})

test('the validation reviewer independently re-runs the suite instead of trusting reported counts', () => {
  const text = readFileSync(join(ROOT, 'agents', 'sdlc-verify-validation-reviewer.md'), 'utf8')
  assert.match(text, /independent(ly)? re-run/i,
    'validation reviewer has no independent re-run instruction')
  assert.match(text, /\bd2\b/,
    'no d2 gate condition covering the independent re-run')
})

// Failure routing is a playbook↔orchestrator contract (audit item 4): every playbook marks
// its routing with a bolded **Gate FAIL** and bounds the loop with HUMAN_REVIEW_REQUIRED —
// one sentinel name everywhere, no unnamed "escalate to the user" variants.
test('every phase playbook carries **Gate FAIL** routing bounded by HUMAN_REVIEW_REQUIRED', () => {
  const dir = join(ROOT, 'phases')
  for (const f of readdirSync(dir).filter(f => f.endsWith('.md'))) {
    const text = readFileSync(join(dir, f), 'utf8')
    assert.match(text, /\*\*Gate FAIL/, `${f}: no **Gate FAIL** routing marker`)
    assert.match(text, /HUMAN_REVIEW_REQUIRED/, `${f}: gate loop has no HUMAN_REVIEW_REQUIRED bound`)
    assert.doesNotMatch(text, /escalate to the user/i,
      `${f}: unnamed escalation phrasing — use the HUMAN_REVIEW_REQUIRED sentinel`)
  }
})

test('the orchestrator dispatch loop references contracts that exist in the playbooks', () => {
  const text = readFileSync(join(ROOT, 'commands', 'sdlc.md'), 'utf8')
  assert.doesNotMatch(text, /"On failure"|"Depends on"/,
    'sdlc.md references playbook sections that exist in no playbook')
  assert.match(text, /`groups:`/, 'sdlc.md does not reference the playbook groups: frontmatter for ordering')
  assert.match(text, /\*\*Gate FAIL\*\*/, 'sdlc.md does not reference the playbooks\' **Gate FAIL** routing')
})

test('the HUMAN_REVIEW_REQUIRED escalation protocol is defined in the orchestrator', () => {
  const text = readFileSync(join(ROOT, 'commands', 'sdlc.md'), 'utf8')
  assert.match(text, /^\s*HUMAN_REVIEW_REQUIRED\s*$/m, 'no HUMAN_REVIEW_REQUIRED block template')
  for (const field of ['Trigger:', 'Open blockers:', 'Artifacts:']) {
    assert.match(text, new RegExp(field), `escalation block lacks the "${field}" field`)
  }
  for (const option of ['guidance', 'waive', 'abort']) {
    assert.match(text, new RegExp(`\\*\\*${option}\\*\\*`), `escalation protocol lacks the "${option}" outcome`)
  }
})
