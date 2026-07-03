// Production build: bundle the entry module into dist/.
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'

mkdirSync('dist', { recursive: true })
const entry = readFileSync('src/index.mjs', 'utf8')
writeFileSync('dist/app.mjs', `// eval production bundle\n${entry}`)
const { size } = statSync('dist/app.mjs')
console.log(`build ok: dist/app.mjs (${size} bytes)`)
