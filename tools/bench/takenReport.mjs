// Who hurt him: totals over all runs, and what hit him in the last 5s of each death.
import { readFileSync } from 'node:fs'
const runs = process.argv.slice(2).flatMap((f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)))
const total = {}
for (const r of runs) for (const [k, v] of Object.entries(r.takenBy ?? {})) total[k] = (total[k] ?? 0) + v
const sum = Object.values(total).reduce((a, b) => a + b, 0)
console.log('damage taken, all runs:')
for (const [k, v] of Object.entries(total).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(22)} ${String(v).padStart(6)}  ${((v / sum) * 100).toFixed(1)}%`)
console.log('last 5s before each death:')
for (const r of runs) if (r.death) console.log(`  ${r.starter.replace('spell_', '').padEnd(13)} seed ${r.seed} t ${r.survived}: ` + Object.entries(r.death.last5s).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '))
