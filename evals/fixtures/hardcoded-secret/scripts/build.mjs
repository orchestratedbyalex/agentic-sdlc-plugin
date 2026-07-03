// Production build: bundle src/ into dist/ (single-module copy with a banner).
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'

mkdirSync('dist', { recursive: true })
const src = readFileSync('src/greet.mjs', 'utf8')
writeFileSync('dist/greet.mjs', `// eval-hardcoded-secret production bundle\n${src}`)
const { size } = statSync('dist/greet.mjs')
console.log(`build ok: dist/greet.mjs (${size} bytes)`)
