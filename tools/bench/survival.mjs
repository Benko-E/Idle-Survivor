import { readFileSync } from 'node:fs'
const runs = process.argv.slice(2).flatMap((f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)))
const t = runs.map((r) => r.survived / 60).sort((a, b) => a - b)
const q = (p) => t[Math.min(t.length - 1, Math.floor(p * (t.length - 1)))].toFixed(1)
const bucket = (lo, hi) => runs.filter((r) => r.survived / 60 >= lo && r.survived / 60 < hi).length
console.log(`n=${runs.length}  died ${runs.filter((r) => r.dead).length}  min ${q(0)}  p25 ${q(0.25)}  median ${q(0.5)}  p75 ${q(0.75)}  max ${q(1)} min`)
console.log(`  <10: ${bucket(0, 10)}  10-15: ${bucket(10, 15)}  15-20: ${bucket(15, 20)}  20-25: ${bucket(20, 25)}  25-30: ${bucket(25, 30)}  30-40: ${bucket(30, 40)}  alive at 40: ${runs.filter((r) => !r.dead).length}`)
