import { bonusProspect, describeBonus } from '../sim/buildBonus'
import { pendingSpellTier, tierCount, tierUnlockLevel } from '../sim/spellTiers'
import { weaponStat } from '../sim/stats'
import type { WeaponInstance, World } from '../sim/world'
import { spellIcon } from './spellIcons'

/**
 * The spell bar: one slot per tier, top centre.
 *
 * A chosen spell shows its icon, with its recharge sweeping round it. An empty
 * slot shows the level it opens at, and glows once it's open and waiting —
 * clicking it opens the choice, same as the New spell! button.
 *
 * Rebuilt only when what's in the slots changes; every other frame just moves
 * the recharge sweeps.
 */

const STYLES = `
.spell-bar {
  position: fixed; top: 10px; left: 50%; transform: translateX(-50%); z-index: 9;
  display: flex; gap: 8px; align-items: center; pointer-events: none;
  font: 11px ui-monospace, Consolas, monospace;
}
.spell-bar[hidden] { display: none; }
.spell-slot {
  position: relative; width: 44px; height: 44px; border-radius: 7px;
  border: 2px solid #2a3540; background: #0d1218cc; overflow: hidden;
  display: flex; align-items: center; justify-content: center; color: #6f8090;
}
.spell-slot img { width: 100%; height: 100%; display: block; }
.spell-slot.owned { border-color: var(--element); }
.spell-slot.empty { border-style: dashed; }
.spell-slot.waiting {
  border: 2px solid #c9a6ff; color: #e6d6ff; cursor: pointer; pointer-events: auto;
  animation: slot-glow 1.6s ease-in-out infinite;
}
@keyframes slot-glow {
  0%, 100% { box-shadow: 0 0 3px #c9a6ff66; }
  50% { box-shadow: 0 0 12px #c9a6ffcc; }
}
.build-badge {
  margin-left: 6px; padding: 5px 9px; border-radius: 6px; pointer-events: auto;
  border: 1px solid var(--badge); color: var(--badge); background: #0d1218cc;
  letter-spacing: 0.04em; white-space: nowrap;
}
.build-badge.hint { opacity: 0.55; border-style: dashed; }
.build-badge.prismatic {
  --badge: #e6d6ff;
  background: linear-gradient(90deg, #ff8a3d33, #8fd8ff33, #f1e05a33), #0d1218cc;
}
.spell-sweep {
  position: absolute; inset: 0; pointer-events: none;
  background: conic-gradient(rgba(6, 9, 12, 0.72) var(--left), transparent 0);
}
`

/**
 * Below this recharge the sweep would just flicker — the aura and the orbit
 * "cast" several times a second — so those show as always ready.
 */
const MIN_SWEEP_SECONDS = 0.6

const ELEMENT_COLOURS: Record<string, string> = { fire: '#ff8a3d', frost: '#8fd8ff', lightning: '#f1e05a' }

export class SpellBar {
  private readonly bar: HTMLDivElement
  private signature = ''
  private sweeps: { weapon: WeaponInstance; element: HTMLElement }[] = []

  constructor(
    private readonly getWorld: () => World,
    private readonly openChoice: () => void,
  ) {
    const style = document.createElement('style')
    style.textContent = STYLES
    document.head.appendChild(style)

    this.bar = document.createElement('div')
    this.bar.className = 'spell-bar'
    this.bar.hidden = true
    document.body.appendChild(this.bar)
  }

  update(visible: boolean): void {
    this.bar.hidden = !visible
    if (!visible) return

    const world = this.getWorld()
    const pending = pendingSpellTier(world)
    const signature = `${world.weapons.map((w) => w.def.id).join()}|${pending}|${world.level >= tierUnlockLevel(2)}|${JSON.stringify(world.buildBonus)}`
    if (signature !== this.signature) {
      this.signature = signature
      this.rebuild(world, pending)
    }

    for (const { weapon, element } of this.sweeps) {
      const total = weaponStat(world, weapon, 'cooldown') / Math.max(0.1, weaponStat(world, weapon, 'cooldownRecovery', 1))
      const left = total < MIN_SWEEP_SECONDS ? 0 : Math.max(0, Math.min(1, weapon.cooldownRemaining / total))
      element.style.setProperty('--left', `${(left * 100).toFixed(1)}%`)
    }
  }

  private rebuild(world: World, pending: number | null): void {
    this.bar.replaceChildren()
    this.sweeps = []

    for (let tier = 1; tier <= tierCount(); tier++) {
      const slot = document.createElement('div')
      slot.className = 'spell-slot'
      const weapon = world.weapons.find((w) => w.def.tier === tier)

      if (weapon) {
        slot.classList.add('owned')
        slot.style.setProperty('--element', weapon.def.colour)
        slot.title = `${weapon.def.displayName}\n${weapon.def.description}`
        slot.appendChild(spellIcon(weapon.def.id, weapon.def.colour, 44))
        const sweep = document.createElement('div')
        sweep.className = 'spell-sweep'
        slot.appendChild(sweep)
        this.sweeps.push({ weapon, element: sweep })
      } else if (tier === pending) {
        slot.classList.add('waiting')
        slot.textContent = 'NEW'
        slot.title = 'A new spell is ready to choose'
        slot.addEventListener('click', () => this.openChoice())
      } else {
        slot.classList.add('empty')
        slot.textContent = `Lv ${tierUnlockLevel(tier)}`
        slot.title = `Another spell opens at level ${tierUnlockLevel(tier)}`
      }

      this.bar.appendChild(slot)
    }

    this.addBadge(world)
  }

  /** The build bonus: bright once earned, faded while it's still on the way. */
  private addBadge(world: World): void {
    const earned = world.buildBonus
    const prospect = earned ? null : bonusProspect(world, tierCount())
    const bonus = earned ?? prospect?.bonus
    if (!bonus) return

    const { name, effect } = describeBonus(bonus)
    const badge = document.createElement('div')
    badge.className = 'build-badge'
    if (bonus.kind === 'prismatic') badge.classList.add('prismatic')
    else badge.style.setProperty('--badge', ELEMENT_COLOURS[bonus.element] ?? '#e8c468')

    if (earned) {
      badge.textContent = name
      badge.title = effect
    } else {
      badge.classList.add('hint')
      badge.textContent = `${name} ${prospect!.have}/${tierCount()}`
      badge.title = `Still possible: ${name} — ${effect}`
    }
    this.bar.appendChild(badge)
  }
}
