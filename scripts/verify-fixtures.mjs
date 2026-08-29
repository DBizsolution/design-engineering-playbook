#!/usr/bin/env node
/**
 * Fixture gate: every schema still parses the payloads it claims to describe.
 *
 * This is the cheapest high-value test in a TypeScript project, and most teams
 * do not have it. TypeScript checks the shape you *told* it about. It cannot
 * check that the shape matches what the API actually sends, because the data
 * arrives as `any` from res.json() and is asserted into existence.
 *
 * The discipline this enforces: schemas are parsers verified against real
 * payloads, not descriptions written from documentation. When someone adds a
 * field to a schema, they add a fixture that has it. When an upstream API
 * changes, you capture the new payload as a fixture and the gate tells you
 * exactly which schemas no longer fit.
 *
 * CONVENTION. A fixture at fixtures/<name>.json is parsed by the schema
 * exported as <Name>Schema (or <name>Schema) from schemas/index.ts. Variants
 * use a dot: fixtures/invoice.overdue.json also parses with InvoiceSchema. This
 * lets one schema own many cases (empty, minimal, full, the weird one from
 * production) without any per-fixture configuration.
 *
 * Usage:  node scripts/verify-fixtures.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { pathToFileURL } from 'node:url'

// ---------------------------------------------------------------- CONFIG ---

const CONFIG = {
  fixtureDir: 'packages/fixtures',
  // A module exporting every schema by name. Any object with .safeParse works,
  // so Zod, Valibot and ArkType are all fine.
  schemaModule: 'packages/schemas/index.js',
  // Fixtures that intentionally have no schema yet. Each needs a reason.
  unschemad: {
    // 'raw-webhook-dump.json': 'captured for reference before we model it. Ticket ABC-12.',
  },
}

// --------------------------------------------------------------- HELPERS ---

/** invoice.overdue.json -> InvoiceSchema */
function schemaNameFor(file) {
  const stem = basename(file).replace(/\.json$/, '').split('.')[0]
  const pascal = stem
    .split(/[-_]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')
  return `${pascal}Schema`
}

/** Turn a validation failure into something a person can act on. */
function describeIssues(result, fixtureName) {
  const issues = result.error?.issues ?? []
  return issues.slice(0, 8).map((i) => {
    const path = i.path.length ? i.path.join('.') : '(root)'
    return `      ${path}: ${i.message}${i.code ? `  [${i.code}]` : ''}`
  })
}

// ------------------------------------------------------------------ MAIN ---

async function main() {
  if (!existsSync(CONFIG.fixtureDir)) {
    console.error(`No fixture directory at ${CONFIG.fixtureDir}.`)
    process.exit(1)
  }
  if (!existsSync(CONFIG.schemaModule)) {
    console.error(`No schema module at ${CONFIG.schemaModule}.`)
    process.exit(1)
  }

  const schemas = await import(pathToFileURL(CONFIG.schemaModule).href)
  const fixtures = readdirSync(CONFIG.fixtureDir).filter((f) => f.endsWith('.json'))

  let passed = 0
  const failures = []
  const orphanFixtures = []
  const usedSchemas = new Set()

  for (const file of fixtures) {
    if (CONFIG.unschemad[file]) continue
    const name = schemaNameFor(file)
    const schema = schemas[name]

    if (!schema) {
      orphanFixtures.push({ file, expected: name })
      continue
    }
    usedSchemas.add(name)

    const raw = JSON.parse(readFileSync(join(CONFIG.fixtureDir, file), 'utf8'))
    const payloads = Array.isArray(raw) ? raw : [raw]

    payloads.forEach((payload, i) => {
      const label = payloads.length > 1 ? `${file}[${i}]` : file
      const result = schema.safeParse(payload)
      if (result.success) passed++
      else failures.push({ label, name, issues: describeIssues(result, label) })
    })
  }

  // A schema with no fixture is a schema nobody has ever run against real data.
  const declared = Object.keys(schemas).filter((k) => k.endsWith('Schema'))
  const unexercised = declared.filter((s) => !usedSchemas.has(s))

  // -------------------------------------------------------------- REPORT ---

  if (failures.length) {
    console.log(`\nfixtures: ${failures.length} failure(s)\n`)
    for (const f of failures) {
      console.log(`  ${f.label} does not parse with ${f.name}:`)
      f.issues.forEach((l) => console.log(l))
      console.log(
        `    One of the two is wrong. If the API changed, update the schema.\n` +
          `    If the fixture was hand-written, replace it with a real captured payload.\n`
      )
    }
  }

  if (orphanFixtures.length) {
    console.log(`  ${orphanFixtures.length} fixture(s) with no matching schema:\n`)
    for (const o of orphanFixtures) {
      console.log(`    ${o.file}  (expected an export named ${o.expected})`)
    }
    console.log(`    Add the schema, or record the reason in CONFIG.unschemad.\n`)
  }

  if (unexercised.length) {
    console.log(`  ${unexercised.length} schema(s) with no fixture. Not a failure, but each one`)
    console.log(`  has never been run against a real payload:\n`)
    for (const s of unexercised) console.log(`    ${s}`)
    console.log()
  }

  if (!failures.length && !orphanFixtures.length) {
    console.log(`fixtures: ok. ${passed} payload(s) parsed across ${fixtures.length} file(s).`)
    process.exit(0)
  }
  process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
