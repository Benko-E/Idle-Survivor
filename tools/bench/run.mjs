// Measuring tools, for tuning by numbers instead of by eye: `npm run bench`.
//
//   npm run bench -- survival              15 bot runs of up to 15 minutes, one
//                                          process per starting spell, in parallel
//        --seeds=1,2,3,4,5  --max=900      which runs, and how long each may last
//        --name=before                     save as results/before_*.jsonl
//        --env=OLDROSTER=1                 anything balanceBench.ts reads (repeatable)
//   npm run bench -- report before [after] survival and who hurt him, for saved results
//   npm run bench -- movement              movement quality: wobble, stutter, skipped coins
//   npm run bench -- audit                 what every upgrade actually changes
//
// Results go to tools/bench/results/, which git ignores. Like the tests, these
// are bundled by Vite first; unlike the tests, movement needs the art
// (it reads the sprite facing code), so run tools/extract-art.ps1 once first.

import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const outDir = join(here, '.out')
const resultsDir = join(here, 'results')
const [command = 'survival', ...rest] = process.argv.slice(2)

const options = { seeds: '1,2,3,4,5', max: '900', name: 'latest', env: [] }
const positional = []
for (const arg of rest) {
  const match = /^--([^=]+)=(.*)$/.exec(arg)
  if (!match) positional.push(arg)
  else if (match[1] === 'env') options.env.push(match[2])
  else options[match[1]] = match[2]
}

// The tier 1 spells, one process each.
const STARTERS = (options.starters ?? 'spell_bolt_01,spell_frostbolt_01,spell_chain_01').split(',')

async function bundle(entries) {
  await build({
    root,
    configFile: false,
    logLevel: 'warn',
    resolve: { alias: { '@game': join(root, 'src') } },
    build: {
      ssr: true,
      outDir,
      emptyOutDir: true,
      target: 'node20',
      rollupOptions: {
        input: Object.fromEntries(entries.map((name) => [name, join(here, `${name}.ts`)])),
        output: { entryFileNames: '[name].mjs' },
      },
    },
  })
}

function report(names) {
  for (const name of names) {
    const files = readdirSync(resultsDir).filter((f) => f.startsWith(`${name}_`) && f.endsWith('.jsonl')).map((f) => join(resultsDir, f))
    if (files.length === 0) {
      console.log(`No results saved as "${name}".`)
      continue
    }
    console.log(`\n=== ${name}`)
    spawnSync(process.execPath, [join(here, 'survival.mjs'), ...files], { stdio: 'inherit' })
    spawnSync(process.execPath, [join(here, 'takenReport.mjs'), ...files], { stdio: 'inherit' })
  }
}

function run(entry, env) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [join(outDir, `${entry}.mjs`)], { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' })
    child.on('exit', done)
  })
}

mkdirSync(resultsDir, { recursive: true })

if (command === 'survival') {
  await bundle(['balanceBench'])
  const extra = Object.fromEntries(options.env.map((pair) => pair.split('=')))
  console.log(`${STARTERS.length} starters x seeds ${options.seeds}, up to ${options.max}s each, saved as "${options.name}"...`)
  for (const file of readdirSync(resultsDir)) if (file.startsWith(`${options.name}_`)) rmSync(join(resultsDir, file))
  await Promise.all(
    STARTERS.map(
      (starter) =>
        new Promise((done) => {
          const out = join(resultsDir, `${options.name}_${starter}.jsonl`)
          const child = spawn(process.execPath, [join(outDir, 'balanceBench.mjs')], {
            cwd: root,
            env: { ...process.env, ...extra, STARTERS: starter, SEEDS: options.seeds, MAX: options.max },
          })
          const chunks = []
          child.stdout.on('data', (chunk) => chunks.push(chunk))
          child.stderr.pipe(process.stderr)
          child.on('exit', async () => {
            const { writeFileSync } = await import('node:fs')
            writeFileSync(out, Buffer.concat(chunks))
            done()
          })
        }),
    ),
  )
  report([options.name])
} else if (command === 'report') {
  report(positional.length > 0 ? positional : ['latest'])
} else if (command === 'movement') {
  await bundle(['moveBench'])
  await run('moveBench', Object.fromEntries(options.env.map((pair) => pair.split('='))))
} else if (command === 'audit') {
  await bundle(['upgradeAudit'])
  await run('upgradeAudit', {})
} else {
  console.log(`Unknown bench "${command}". Try survival, report, movement or audit.`)
  process.exitCode = 1
}
