// Runs every test in this folder: `npm test`.
//
// The simulation imports nothing from render/ or ui/, so it runs in Node as-is.
// Each *.test.ts is bundled by Vite (so `@game/...` imports and TypeScript just
// work, the same way the game is built) and then run in its own Node process,
// so one test switching a spell on or adding a condition can't leak into the
// next. A test fails if it exits non-zero or prints a FAIL. Before any of
// that, the tests and benches are type-checked like the game is, so a test
// that no longer matches the code it tests is caught rather than run.
//
// Needs no art: the simulation doesn't touch art-source/, so this works on a
// fresh clone before tools/extract-art.ps1 has ever run.
//
//   npm test                 everything
//   npm test -- enemies      only tests whose file name contains "enemies"

import { spawnSync } from 'node:child_process'
import { readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const outDir = join(here, '.out')
const filter = process.argv[2] ?? ''

const tests = readdirSync(here)
  .filter((name) => name.endsWith('.test.ts') && name.includes(filter))
  .sort()
if (tests.length === 0) {
  console.log(`No tests match "${filter}".`)
  process.exit(1)
}

const tsc = spawnSync(process.execPath, [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(here, 'tsconfig.json')], { cwd: root, encoding: 'utf8' })
if (tsc.status !== 0) {
  console.log('The tests no longer type-check against the game:\n')
  console.log(`${tsc.stdout}${tsc.stderr}`.trim())
  process.exit(1)
}

rmSync(outDir, { recursive: true, force: true })
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
      input: Object.fromEntries(tests.map((name) => [name.replace(/\.test\.ts$/, ''), join(here, name)])),
      output: { entryFileNames: '[name].mjs' },
    },
  },
})

// What a failure looks like in the output of the older, print-only tests.
const FAILED = /^\s*FAIL\b|: false\s*$|THREW/m
const results = []
for (const name of tests) {
  const label = name.replace(/\.test\.ts$/, '')
  const started = Date.now()
  const run = spawnSync(process.execPath, [join(outDir, `${label}.mjs`)], { cwd: root, encoding: 'utf8' })
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`
  const ok = run.status === 0 && !FAILED.test(output)
  results.push({ label, ok, seconds: (Date.now() - started) / 1000, output })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(18)} ${((Date.now() - started) / 1000).toFixed(1)}s`)
}

const failed = results.filter((r) => !r.ok)
for (const r of failed) {
  console.log(`\n--- ${r.label} ---------------------------------------------`)
  console.log(r.output.trim())
}
console.log(failed.length === 0 ? `\nAll ${results.length} test files passed.` : `\n${failed.length} of ${results.length} test files failed.`)
process.exitCode = failed.length === 0 ? 0 : 1
