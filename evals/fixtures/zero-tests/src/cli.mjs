import { greet } from './greet.mjs'

const name = process.argv[2] ?? 'World'
console.log(greet(name))
