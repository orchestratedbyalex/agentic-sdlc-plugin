#!/usr/bin/env node
// sdlc-guard.mjs — PreToolUse hook guard for the Agentic SDLC plugin.
// Zero dependencies. Pure decision core (decide) + stdin/stdout CLI.
//
// Makes two design invariants deterministic instead of prompt-enforced:
//   4 — git stays human-gated: publish/history commands (git commit/tag/push,
//       gh release, npm publish) get an "ask" — the human approving the
//       permission prompt IS the gate, so ask, never deny.
//   2 — sdlc-metadata.yml has exactly one writer (scripts/sdlc-state.mjs):
//       direct edits are denied with a pointer at the state script.
//
// Fails open by design: on anything not positively recognized as gated the guard
// stays silent (normal permission flow applies). It is defense-in-depth over the
// prompt contract, not a wall — shell parsing here is approximate on purpose.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const STATE_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'sdlc-state.mjs')

const METADATA = /sdlc-metadata\.ya?ml/
// the plugin's own template file is not the state file
const isMeta = t => METADATA.test(t) && !t.includes('templates/')

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const GIT_GATED = new Set(['commit', 'tag', 'push'])
const GH_RELEASE_READONLY = new Set(['list', 'view', 'download'])
const NPM_LIKE = new Set(['npm', 'pnpm', 'yarn'])
const WRAPPERS = new Set(['env', 'command', 'sudo', 'nohup', 'time'])

function askReason(matched) {
  return `Human gate (Agentic SDLC invariant 4): "${matched}" publishes or rewrites shared ` +
    'history. SDLC agents stage and suggest — the human approving this prompt is the gate.'
}

function denyReason(what) {
  return `${what} blocked (Agentic SDLC invariant 2): sdlc-metadata.yml has exactly one ` +
    `writer. Use the state script instead: node ${STATE_SCRIPT} ` +
    '<init|complete|config|brief|counts|plan-add|cycle|gate-log|plan-active|clarifier-round|loop-reset|reopen>.'
}

// Split into simple-command segments across chains, pipes, and substitutions,
// then tokenize past env assignments and transparent wrappers.
function segments(command) {
  return command.split(/\|\||&&|;|\||\n|\$\(|`|\(|\)/).map(s => s.trim()).filter(Boolean)
}

function tokens(segment) {
  const toks = segment.split(/\s+/)
  let i = 0
  while (i < toks.length &&
    (/^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[i]) || WRAPPERS.has(toks[i]))) i++
  return toks.slice(i)
}

// First non-flag token after argv[0]; skips the argument of git's -C / -c.
function subcommand(toks) {
  for (let j = 1; j < toks.length; j++) {
    const t = toks[j]
    if (t === '-C' || t === '-c') { j++; continue }
    if (t.startsWith('-')) continue
    return { sub: t, rest: toks.slice(j + 1) }
  }
  return { sub: null, rest: [] }
}

function checkBashPublish(command) {
  for (const seg of segments(command)) {
    const toks = tokens(seg)
    const cmd = toks[0]
    if (!cmd) continue
    const { sub, rest } = subcommand(toks)
    if (cmd === 'git' && GIT_GATED.has(sub)) {
      if (rest.includes('--dry-run')) continue
      // bare `git tag` / `git tag -l` only lists — the Release agents do that a lot
      if (sub === 'tag' && (rest.length === 0 || rest.includes('-l') || rest.includes('--list'))) continue
      return { decision: 'ask', reason: askReason(`git ${sub}`) }
    }
    if (cmd === 'gh' && sub === 'release') {
      const ghSub = rest.find(t => !t.startsWith('-'))
      if (!ghSub || GH_RELEASE_READONLY.has(ghSub)) continue
      return { decision: 'ask', reason: askReason(`gh release ${ghSub}`) }
    }
    if (NPM_LIKE.has(cmd) && sub === 'publish') {
      if (rest.includes('--dry-run')) continue
      return { decision: 'ask', reason: askReason(`${cmd} publish`) }
    }
  }
  return null
}

function checkBashMetadataWrite(command) {
  if (!METADATA.test(command)) return null
  const redirect = command.match(/>{1,2}\s*["']?(\S*sdlc-metadata\.ya?ml)/)
  if (redirect && isMeta(redirect[1])) {
    return { decision: 'deny', reason: denyReason('Shell redirect into sdlc-metadata.yml') }
  }
  for (const seg of segments(command)) {
    const toks = tokens(seg)
    const cmd = toks[0]
    if (!cmd) continue
    const args = toks.slice(1)
    if (cmd === 'sed' && args.some(t => t.startsWith('-i')) && args.some(isMeta)) {
      return { decision: 'deny', reason: denyReason('In-place sed of sdlc-metadata.yml') }
    }
    if (cmd === 'tee' && args.some(isMeta)) {
      return { decision: 'deny', reason: denyReason('tee into sdlc-metadata.yml') }
    }
    if ((cmd === 'cp' || cmd === 'mv') && args.length > 0 && isMeta(args[args.length - 1])) {
      return { decision: 'deny', reason: denyReason(`${cmd} onto sdlc-metadata.yml`) }
    }
  }
  return null
}

function checkFileEdit(toolName, toolInput) {
  const path = toolInput.file_path ?? toolInput.notebook_path
  if (typeof path !== 'string' || !isMeta(path)) return null
  return { decision: 'deny', reason: denyReason(`Direct ${toolName} of ${path}`) }
}

// decide(hookInput) → null (no opinion — fail open) | { decision: 'ask'|'deny', reason }
export function decide(input) {
  if (!input || typeof input !== 'object') return null
  const tool = input.tool_name
  const toolInput = input.tool_input
  if (!toolInput || typeof toolInput !== 'object') return null
  if (tool === 'Bash' && typeof toolInput.command === 'string') {
    return checkBashMetadataWrite(toolInput.command) ?? checkBashPublish(toolInput.command)
  }
  if (EDIT_TOOLS.has(tool)) return checkFileEdit(tool, toolInput)
  return null
}

async function main() {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  let input
  try { input = JSON.parse(raw) } catch { return }
  const d = decide(input)
  if (!d) return
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: d.decision,
      permissionDecisionReason: d.reason,
    },
  }) + '\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
