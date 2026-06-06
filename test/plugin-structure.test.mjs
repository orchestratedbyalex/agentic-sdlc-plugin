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

test('the full 34-agent roster is present', () => {
  const n = readdirSync(join(ROOT, 'agents')).filter(f => f.endsWith('.md')).length
  assert.equal(n, 34, `expected 34 agent files, found ${n}`)
})
