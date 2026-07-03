// The labelled outcome matrix: one entry per fixture × agent pair, asserting on the
// machine-parsable VERDICT line (and, where the label warrants it, on the verbatim
// execution-evidence contract). Pure data — imported by the structure tests, which
// verify every case names a real agent and a complete fixture.
//
// Slice 1 covers ONE gate agent (the Verify static & dynamic analyzer) across three
// labelled fixtures. Extending the matrix = adding a fixture dir + a row here.
export const CASES = [
  {
    id: 'analyzer-clean-pass',
    agent: 'sdlc-verify-static-dynamic-analyzer',
    fixture: 'clean',
    note: 'healthy project — must PASS (guards against a gate that fails everything)',
    expect: {
      verdict: 'PASS',
      // the evidence contract: a verbatim Execution Evidence section quoting the
      // build's own output line, not a paraphrased count
      mustMatch: ['Execution Evidence', 'build ok: dist/greet\\.mjs'],
    },
  },
  {
    id: 'analyzer-broken-build-fail',
    agent: 'sdlc-verify-static-dynamic-analyzer',
    fixture: 'broken-build',
    note: 'unit tests are green but the production build exits 1 — the proxy trap (invariant 3): must FAIL',
    expect: {
      verdict: 'FAIL',
      mustMatch: ['Execution Evidence', 'BLOCKER'],
    },
  },
  {
    id: 'analyzer-no-build-honest-pass',
    agent: 'sdlc-verify-static-dynamic-analyzer',
    fixture: 'no-build',
    note: 'interpreted project with no build step — must say so explicitly and smoke-run instead of inventing a build',
    expect: {
      verdict: 'PASS',
      mustMatch: ['interpreted|no build step'],
    },
  },
]
