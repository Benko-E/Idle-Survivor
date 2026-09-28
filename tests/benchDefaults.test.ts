// The measuring tools default to the new build's starters, so a plain
// `npm run bench -- survival` measures the game as it is.
import { DEFAULT_CLASS } from '@game/data/classes'
import { spellsOfTier } from '@game/sim/spellTiers'
import source from '../tools/bench/run.mjs?raw'

let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(52)} ${detail}`)
  if (!ok) failures++
}

const defaults = /options\.starters \?\? '([^']*)'/.exec(source)?.[1]?.split(',') ?? []
const starters = spellsOfTier(DEFAULT_CLASS, 1).map((def) => def.id)
check("the bench's default starters are the new build's", defaults.length === starters.length && starters.every((id) => defaults.includes(id)), defaults.join(', ') || 'none found')

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exitCode = 1
