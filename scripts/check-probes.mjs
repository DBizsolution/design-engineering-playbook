#!/usr/bin/env node
/**
 * Probe runner: asserts that every lint rule actually fires.
 *
 * Reads scripts/probes/*.probe.tsx, lints it, and checks that every line marked
 * FAIL produced at least one error and every line marked OK produced none.
 *
 * This is the check that makes the other checks trustworthy. Without it, a rule
 * whose selector matches nothing is indistinguishable from a rule with no
 * violations to find, and you will believe you have coverage that does not
 * exist. Run it in CI and in pre-commit whenever the lint config changes.
 *
 * Usage:  node scripts/check-probes.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ESLint } from 'eslint'

const PROBE_DIR = 'scripts/probes'

/** Lines annotated with a trailing // FAIL <tag> or // OK comment. */
function expectationsFor(file) {
  const lines = readFileSync(file, 'utf8').split('\n')
  const expect = new Map() // 1-indexed line -> 'fail' | 'ok'
  lines.forEach((line, i) => {
    // Ignore the explanatory prose at the top of the file: only annotate lines
    // that contain actual code before the marker.
    const m = line.match(/\/\/\s*(FAIL|OK)\b/)
    if (!m) return
    const code = line.slice(0, m.index).trim()
    if (!code || code.startsWith('*') || code.startsWith('//')) return
    expect.set(i + 1, m[1] === 'FAIL' ? 'fail' : 'ok')
  })
  return expect
}

async function main() {
  if (!existsSync(PROBE_DIR)) {
    console.error(`No ${PROBE_DIR}. Create it and add at least one *.probe.tsx.`)
    process.exit(1)
  }

  const probes = readdirSync(PROBE_DIR).filter((f) => f.endsWith('.probe.tsx') || f.endsWith('.probe.ts'))
  if (!probes.length) {
    console.error(`No probe files in ${PROBE_DIR}.`)
    process.exit(1)
  }

  // Probe files are normally ignored by the project's lint config, since they
  // contain deliberate violations. warnIgnored:false plus an explicit override
  // is how we lint them anyway.
  const eslint = new ESLint({ errorOnUnmatchedPattern: false })
  let failures = 0
  let checked = 0

  for (const name of probes) {
    const file = join(PROBE_DIR, name)
    const expect = expectationsFor(file)
    const [result] = await eslint.lintFiles([file])
    if (!result) {
      console.error(`  Could not lint ${file}. Is it excluded by your eslint config?`)
      process.exit(1)
    }

    const errorsByLine = new Map()
    for (const msg of result.messages) {
      if (msg.severity !== 2) continue
      if (!errorsByLine.has(msg.line)) errorsByLine.set(msg.line, [])
      errorsByLine.get(msg.line).push(msg.ruleId || 'parse-error')
    }

    for (const [line, kind] of expect) {
      checked++
      const got = errorsByLine.get(line) || []
      const source = readFileSync(file, 'utf8').split('\n')[line - 1].trim()

      if (kind === 'fail' && got.length === 0) {
        failures++
        console.log(`\n  RULE DID NOT FIRE   ${file}:${line}`)
        console.log(`    ${source}`)
        console.log(`    This line is meant to be a violation and the linter said nothing.`)
        console.log(`    The selector probably matches nothing. Check for the numeric-literal`)
        console.log(`    trap: esquery regex tests do not apply to numeric values, so match`)
        console.log(`    on 'raw' rather than 'value'.`)
      }

      if (kind === 'ok' && got.length > 0) {
        failures++
        console.log(`\n  FALSE POSITIVE      ${file}:${line}`)
        console.log(`    ${source}`)
        console.log(`    This line is legitimate and the linter flagged it: ${got.join(', ')}`)
        console.log(`    A rule that fires on correct code gets disabled, and then it protects`)
        console.log(`    nothing. Narrow the selector.`)
      }
    }
  }

  console.log()
  if (failures) {
    console.log(`  probes: ${failures} of ${checked} expectation(s) not met.\n`)
    process.exit(1)
  }
  console.log(`  probes: ok. ${checked} expectation(s) met across ${probes.length} file(s).\n`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
