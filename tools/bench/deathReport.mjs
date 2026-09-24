// What was he doing when he died? node deathReport.mjs file1.jsonl [...]
import { readFileSync } from 'node:fs'

const runs = process.argv.slice(2).flatMap((f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)))
let banking = 0
let deaths = 0
for (const r of runs) {
  if (!r.death) continue
  deaths++
  const d = r.death
  if (d.intent === 'banking') banking++
  const defence = Object.keys(d.upgrades).filter((k) => /vigour|regen|ward/.test(k)).map((k) => `${k.replace('up_', '').replace('_01', '')}x${d.upgrades[k]}`).join(',') || 'none'
  console.log(
    `${r.starter.replace('spell_', '').padEnd(14)} seed ${r.seed} t ${String(r.survived).padStart(4)} | ${d.intent.padEnd(8)} gold ${String(d.gold).padStart(4)} crowd<150 ${String(d.enemiesWithin150).padStart(3)} shop ${String(d.shopDistance).padStart(4)} | hp ${d.hpLast12s.join(' ')} / ${d.maxHp} | defence: ${defence}`,
  )
}
console.log(`\n${deaths} deaths, ${banking} while on a bank trip`)
