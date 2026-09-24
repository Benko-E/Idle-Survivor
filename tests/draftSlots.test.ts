// Do the draft slots lean the way they should?
import { config } from '@game/config'
import { UPGRADE_DEFS } from '@game/data/upgrades'
import { currentOffers } from '@game/sim/draft'
import { createWorld } from '@game/sim/world'

const kind = (tags: string[]) => (tags.includes('utility') ? 'comfort' : 'fight')
const counts = [0, 1, 2].map(() => ({ fight: 0, comfort: 0 }))
let drafts = 0
for (let seed = 1; seed <= 3000; seed++) {
  const w = createWorld(seed)
  w.pendingLevelUps = 1
  const offers = currentOffers(w)
  if (offers.length < 3) continue
  drafts++
  offers.forEach((o, i) => counts[i][kind(o.def.tags)]++)
}
const pools = { fight: UPGRADE_DEFS.filter((u) => !u.tags.includes('utility')).length, comfort: UPGRADE_DEFS.filter((u) => u.tags.includes('utility')).length }
console.log(`slot bias ${config.draft.slotBias}, ${drafts} drafts (pool at level 1 has fight and comfort cards; comfort is 4 of ${UPGRADE_DEFS.length} upgrades total)`)
;['left ', 'middle', 'right'].forEach((name, i) => {
  const c = counts[i]
  console.log(`  ${name}: ${((c.fight / drafts) * 100).toFixed(0)}% fight/defence, ${((c.comfort / drafts) * 100).toFixed(0)}% comfort`)
})
const left = counts[0].fight / drafts, right = counts[2].comfort / drafts
console.log(left > 0.85 && right > 0.7 ? 'PASS  left leans fight, right leans comfort' : 'FAIL')

// When comfort has run dry, the right slot still deals a card.
{
  const w = createWorld(1)
  for (const u of UPGRADE_DEFS) if (u.tags.includes('utility')) w.upgradesTaken[u.id] = u.maxStacks
  let ok = true
  for (let i = 0; i < 200; i++) {
    w.pendingLevelUps = 1
    w.draftOffers = null
    const offers = currentOffers(w)
    if (offers.length !== 3 || offers.some((o) => o.def.tags.includes('utility'))) ok = false
  }
  console.log(ok ? 'PASS  comfort maxed out: right slot falls back, still 3 cards' : 'FAIL  fallback')
}
void pools
