// Drives the real core/loop.ts with a fake clock and a fake requestAnimationFrame,
// to check it survives errors thrown by update() and render().
export {}

const frames: ((t: number) => void)[] = []
let now = 0
;(globalThis as any).requestAnimationFrame = (cb: (t: number) => void) => { frames.push(cb) }
;(globalThis as any).performance = { now: () => now }

const { startLoop, stats } = await import('@game/core/loop')

let updates = 0
let renders = 0
let breakUpdate = false
let breakRender = false
const errors: unknown[] = []
const origError = console.error
console.error = (...a: unknown[]) => { errors.push(a[1]) }

startLoop(
  () => { if (breakUpdate) throw new Error('update broke'); updates++ },
  () => { if (breakRender) throw new Error('render broke'); renders++ },
)

function tick(n: number): void {
  for (let i = 0; i < n; i++) {
    now += 1000 / 60
    const cb = frames.shift()
    if (!cb) { origError('LOOP STOPPED: no frame scheduled'); process.exit(1) }
    cb(now)
  }
}

tick(60)
const healthy = { updates, renders }

breakUpdate = true
tick(60)
const whileUpdateBroken = { updates, renders, errors: stats.errors }
breakUpdate = false
tick(60)
const afterUpdateFixed = { updates, renders }

breakRender = true
tick(60)
const whileRenderBroken = { updates, renders, errors: stats.errors }
breakRender = false
tick(60)
const afterRenderFixed = { updates, renders }

console.error = origError
console.log('healthy 1s:            ', healthy)
console.log('update throwing 1s:    ', whileUpdateBroken, '<- renders keep going, updates stall')
console.log('update fixed 1s:       ', afterUpdateFixed, '<- updates resume')
console.log('render throwing 1s:    ', whileRenderBroken, '<- sim keeps running')
console.log('render fixed 1s:       ', afterRenderFixed)
console.log('distinct errors logged:', errors.length, '(of', stats.errors, 'failed frames)')

// What each phase has to show, not just print.
const checks: [string, boolean][] = [
  ['healthy: about 60 updates and renders a second', healthy.updates >= 58 && healthy.renders >= 58],
  ['update throwing: renders keep going', whileUpdateBroken.renders - healthy.renders >= 58],
  ['update fixed: updates resume', afterUpdateFixed.updates - whileUpdateBroken.updates >= 58],
  ['render throwing: the sim keeps running', whileRenderBroken.updates - afterUpdateFixed.updates >= 58],
  ['render fixed: renders resume', afterRenderFixed.renders - whileRenderBroken.renders >= 58],
  ['each distinct error logged once, not every frame', errors.length <= 2],
]
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) process.exitCode = 1
}
