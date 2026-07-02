import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { decide } from '../scripts/sdlc-guard.mjs'

const GUARD = fileURLToPath(new URL('../scripts/sdlc-guard.mjs', import.meta.url))

const bash = command => ({ tool_name: 'Bash', tool_input: { command } })
const edit = (tool_name, file_path) => ({ tool_name, tool_input: { file_path } })

// --- Invariant 4: git stays human-gated → "ask" on publish/history commands ---

test('guard asks on git commit / git tag <name> / git push', () => {
  for (const cmd of ['git commit -m "feat: x"', 'git tag v1.0.0', 'git push origin main']) {
    const d = decide(bash(cmd))
    assert.equal(d?.decision, 'ask', `${cmd}: expected ask`)
    assert.ok(d.reason.length > 0, `${cmd}: empty reason`)
  }
})

test('guard asks when the publish command hides mid-chain, in a substitution, or behind git flags', () => {
  for (const cmd of [
    'npm test && git push',
    'echo $(git push origin main)',
    'git -C packages/core commit -m x',
    'FOO=1 env BAR=2 git push',
  ]) {
    assert.equal(decide(bash(cmd))?.decision, 'ask', `${cmd}: expected ask`)
  }
})

test('guard asks on gh release create and npm/pnpm/yarn publish', () => {
  for (const cmd of ['gh release create v1.0.0 --notes x', 'npm publish', 'pnpm publish', 'yarn publish']) {
    assert.equal(decide(bash(cmd))?.decision, 'ask', `${cmd}: expected ask`)
  }
})

test('guard stays silent on read-only git/gh/npm usage', () => {
  for (const cmd of [
    'git status', 'git log --oneline', 'git tag', 'git tag -l', 'git tag --list',
    'gh release list', 'gh release view v1.0.0',
    'npm test', 'npm view left-pad',
    'echo "git push is human-gated"',   // quoted prose, not a command
    'git log --grep "commit message"',  // 'commit' as an argument, not a subcommand
  ]) {
    assert.equal(decide(bash(cmd)), null, `${cmd}: expected no opinion`)
  }
})

test('guard stays silent on --dry-run variants', () => {
  for (const cmd of ['git push --dry-run', 'git commit --dry-run', 'npm publish --dry-run']) {
    assert.equal(decide(bash(cmd)), null, `${cmd}: expected no opinion`)
  }
})

// --- Invariant 2: sdlc-metadata.yml is script-owned → "deny" direct writes ---

test('guard denies Edit/Write/MultiEdit on sdlc-metadata.yml, pointing at the state script', () => {
  for (const tool of ['Edit', 'Write', 'MultiEdit']) {
    const d = decide(edit(tool, 'docs/requirements/sdlc-metadata.yml'))
    assert.equal(d?.decision, 'deny', `${tool}: expected deny`)
    assert.match(d.reason, /sdlc-state\.mjs/, `${tool}: reason must point at the state script`)
  }
})

test('guard leaves the plugin template and unrelated files alone', () => {
  assert.equal(decide(edit('Edit', 'templates/sdlc-metadata.yml')), null)
  assert.equal(decide(edit('Write', 'docs/requirements/functional/FR-001-x.md')), null)
})

test('guard denies Bash writes aimed at sdlc-metadata.yml', () => {
  for (const cmd of [
    'echo "sdlc:" > docs/requirements/sdlc-metadata.yml',
    'cat header.yml >> docs/requirements/sdlc-metadata.yml',
    "sed -i '' 's/pending/completed/' docs/requirements/sdlc-metadata.yml",
    'grep -v cycle meta.yml | tee docs/requirements/sdlc-metadata.yml',
    'cp backup.yml docs/requirements/sdlc-metadata.yml',
    'mv scratch.yml docs/requirements/sdlc-metadata.yml',
  ]) {
    const d = decide(bash(cmd))
    assert.equal(d?.decision, 'deny', `${cmd}: expected deny`)
    assert.match(d.reason, /sdlc-state\.mjs/, `${cmd}: reason must point at the state script`)
  }
})

test('guard allows Bash reads of sdlc-metadata.yml and the state script itself', () => {
  for (const cmd of [
    'cat docs/requirements/sdlc-metadata.yml',
    'grep -n cycle docs/requirements/sdlc-metadata.yml > /tmp/out.txt',
    'node /some/plugin/scripts/sdlc-state.mjs complete --phase develop',
    'cp docs/requirements/sdlc-metadata.yml /tmp/backup.yml',
  ]) {
    assert.equal(decide(bash(cmd)), null, `${cmd}: expected no opinion`)
  }
})

// The guard is defense-in-depth over the prompt contract, not a wall: on anything it
// doesn't positively recognize as gated, it stays silent so normal work never breaks.
test('guard fails open on unknown tools and malformed input', () => {
  assert.equal(decide({ tool_name: 'Read', tool_input: { file_path: 'docs/requirements/sdlc-metadata.yml' } }), null)
  assert.equal(decide({ tool_name: 'Bash', tool_input: {} }), null)
  assert.equal(decide({}), null)
  assert.equal(decide(null), null)
})

// --- CLI: the hook protocol (JSON on stdin → hookSpecificOutput on stdout, exit 0) ---

function runGuard(stdin) {
  return spawnSync(process.execPath, [GUARD], {
    input: typeof stdin === 'string' ? stdin : JSON.stringify(stdin),
    encoding: 'utf8',
  })
}

test('CLI: an ask decision is emitted as PreToolUse hookSpecificOutput JSON', () => {
  const r = runGuard(bash('git push origin main'))
  assert.equal(r.status, 0)
  const out = JSON.parse(r.stdout)
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse')
  assert.equal(out.hookSpecificOutput.permissionDecision, 'ask')
  assert.ok(out.hookSpecificOutput.permissionDecisionReason.length > 0)
})

test('CLI: a deny decision is emitted the same way', () => {
  const r = runGuard(edit('Write', 'docs/requirements/sdlc-metadata.yml'))
  assert.equal(r.status, 0)
  const out = JSON.parse(r.stdout)
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /sdlc-state\.mjs/)
})

test('CLI: no opinion means no output and exit 0 (normal permission flow applies)', () => {
  const r = runGuard(bash('ls -la'))
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
})

test('CLI: unparseable stdin fails open — exit 0, no output', () => {
  const r = runGuard('this is not json {{{')
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
})
