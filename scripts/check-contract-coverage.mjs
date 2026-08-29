#!/usr/bin/env node
/**
 * Contract coverage: of everything the spec says the product has, how much has
 * the build actually implemented?
 *
 * This answers the question a client asks and nobody can answer honestly:
 * "are we about halfway?" A burndown chart measures tickets closed, which
 * measures activity. This measures the distance between the contract and the
 * code, which is the thing they are actually asking about.
 *
 * It scores each entity at three layers, because they fail differently:
 *
 *   type     the field exists in the app's TypeScript.        Missing = unbuilt.
 *   fixture  some fixture or seed actually populates it.      Missing = untested.
 *   ui       some component or page references it.            Missing = unsurfaced.
 *
 * A field that is in the type but in no fixture is a field nobody has ever seen
 * with data in it. A field in the fixture but on no screen is data the product
 * collects and never shows. Those are different problems with different fixes,
 * and one combined percentage hides both.
 *
 * Two design decisions worth understanding before you copy this.
 *
 * FIELD ALIASES. The contract is domain-shaped and usually snake_case. The app
 * is UI-shaped and usually camelCase, and it abbreviates: hbl_number becomes
 * ref, fee_amount becomes total. You have three options. Force the app to
 * rename, which is a fight you will lose. Report the mismatches as gaps, which
 * makes the number a lie. Or write the mapping down. A mapping table is an
 * honest artifact; a silent mismatch is a bug.
 *
 * BLIND SPOTS ARE REPORTED. Any contract entity with no mapping into the app is
 * printed at the bottom as unmeasured, not silently skipped. A coverage tool
 * that quietly ignores what it cannot see reports a number that goes up when
 * you add entities it does not understand.
 *
 * Uses the TypeScript compiler API, which is already installed in any TS
 * project. Regex over type declarations was the first attempt and it breaks on
 * generics, unions and nested objects, which is most real types.
 *
 * Usage:
 *   node scripts/check-contract-coverage.mjs
 *   node scripts/check-contract-coverage.mjs --json > coverage.json
 *   node scripts/check-contract-coverage.mjs --check    (fails below MIN_COVERAGE)
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')

// ---------------------------------------------------------------- CONFIG ---

const CONFIG = {
  // The spec. See the sample at docs/playbook/examples/contract.json.
  contractFile: 'contract.json',

  // Where the app's types live.
  typeDirs: ['src/types', 'src/lib', 'src/features'],
  // Where fixtures and seeds live.
  fixtureDirs: ['src/data', 'fixtures', 'prisma'],
  // Where UI lives.
  uiDirs: ['src/app', 'src/components'],

  ignoreDirs: ['node_modules', '.next', 'dist', '.git'],

  // Contract entity id -> the app type(s) that implement it. An entity absent
  // from this map is reported as unmeasured rather than skipped.
  entityTypeMap: {
    invoice: ['Invoice', 'InvoiceDetail'],
    customer: ['Customer'],
    subscription: ['Subscription'],
  },

  // Contract field name -> what the app calls it.
  fieldAliases: {
    invoice_number: ['ref', 'number'],
    total_amount: ['total', 'amount'],
    customer_id: ['customerId'],
    created_at: ['createdAt'],
    due_date: ['dueDate'],
    line_items: ['lines', 'items'],
  },

  // Fail --check below this fraction of type-layer coverage. Start at your
  // current number so the gate is green today, then ratchet it up. A threshold
  // nobody can meet is a threshold people delete.
  minCoverage: 0.0,
}

// --------------------------------------------------------------- HELPERS ---

function walk(dir, exts, acc = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return acc
  }
  for (const entry of entries) {
    if (CONFIG.ignoreDirs.includes(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, exts, acc)
    else if (exts.includes(extname(full))) acc.push(full)
  }
  return acc
}

const snakeToCamel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())

/** Every name the app might use for this contract field. */
function candidateNames(field) {
  return [field, snakeToCamel(field), ...(CONFIG.fieldAliases[field] || [])]
}

/**
 * Property names declared on the named types, read from the AST rather than the
 * text. Handles interfaces, type aliases with object literals, and intersections.
 */
function propertiesOfTypes(files, typeNames) {
  const wanted = new Set(typeNames)
  const props = new Set()

  const collectMembers = (members) => {
    for (const member of members) {
      if (ts.isPropertySignature(member) && member.name) props.add(member.name.getText())
    }
  }

  for (const file of files) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    ts.forEachChild(source, (node) => {
      if (ts.isInterfaceDeclaration(node) && wanted.has(node.name.text)) {
        collectMembers(node.members)
      } else if (ts.isTypeAliasDeclaration(node) && wanted.has(node.name.text)) {
        const t = node.type
        if (ts.isTypeLiteralNode(t)) collectMembers(t.members)
        else if (ts.isIntersectionTypeNode(t)) {
          for (const part of t.types) if (ts.isTypeLiteralNode(part)) collectMembers(part.members)
        }
      }
    })
  }
  return props
}

/** Crude but sufficient: does any file in these dirs mention the identifier? */
function mentionedIn(dirs, names) {
  const files = dirs.filter(existsSync).flatMap((d) => walk(d, ['.ts', '.tsx', '.json', '.js', '.jsx']))
  const haystack = files.map((f) => readFileSync(f, 'utf8')).join('\n')
  return (name) => names(name).some((n) => new RegExp(`\\b${n}\\b`).test(haystack))
}

const pct = (a, b) => (b === 0 ? 0 : Math.round((a / b) * 100))

function bar(n) {
  const filled = Math.round(n / 10)
  return '█'.repeat(filled) + '░'.repeat(10 - filled)
}

function status(typePct) {
  if (typePct >= 80) return 'green'
  if (typePct >= 50) return 'amber'
  return 'red'
}

// ------------------------------------------------------------------ MAIN ---

function main() {
  const asJson = process.argv.includes('--json')
  const strict = process.argv.includes('--check')

  if (!existsSync(CONFIG.contractFile)) {
    console.error(`No contract at ${CONFIG.contractFile}.`)
    process.exit(1)
  }
  const contract = JSON.parse(readFileSync(CONFIG.contractFile, 'utf8'))

  const typeFiles = CONFIG.typeDirs.filter(existsSync).flatMap((d) => walk(d, ['.ts', '.tsx']))
  const inFixtures = mentionedIn(CONFIG.fixtureDirs, candidateNames)
  const inUi = mentionedIn(CONFIG.uiDirs, candidateNames)

  const rows = []
  const unmeasured = []

  for (const entity of contract.entities) {
    const typeNames = CONFIG.entityTypeMap[entity.id]
    if (!typeNames) {
      unmeasured.push(entity.id)
      continue
    }
    const declared = propertiesOfTypes(typeFiles, typeNames)
    const fields = entity.fields || []

    const inType = fields.filter((f) => candidateNames(f).some((n) => declared.has(n)))
    const inFix = fields.filter(inFixtures)
    const inUiL = fields.filter(inUi)

    rows.push({
      id: entity.id,
      total: fields.length,
      type: pct(inType.length, fields.length),
      fixture: pct(inFix.length, fields.length),
      ui: pct(inUiL.length, fields.length),
      missingFromType: fields.filter((f) => !inType.includes(f)),
    })
  }

  // Journeys, if the contract declares them, are scored by hand and just
  // reported. Nothing can infer "is this flow built" from source.
  const journeys = contract.journeys || []

  const totalFields = rows.reduce((n, r) => n + r.total, 0)
  const weightedType = rows.reduce((n, r) => n + (r.type / 100) * r.total, 0)
  const overall = pct(weightedType, totalFields)

  if (asJson) {
    console.log(JSON.stringify({ overall, rows, journeys, unmeasured }, null, 2))
    process.exit(0)
  }

  // -------------------------------------------------------------- REPORT ---

  console.log(`\nContract coverage  (contract v${contract.version || '?'})\n`)
  console.log(`  Entity           Type   Fixture   UI     Status`)
  console.log(`  ${'-'.repeat(52)}`)
  for (const r of rows.sort((a, b) => a.type - b.type)) {
    console.log(
      `  ${r.id.padEnd(16)} ${String(r.type + '%').padStart(4)}   ` +
        `${String(r.fixture + '%').padStart(5)}   ${String(r.ui + '%').padStart(4)}   ${status(r.type)}`
    )
  }
  console.log(`\n  Overall type-layer coverage: ${overall}%  ${bar(overall)}\n`)

  const gaps = rows.filter((r) => r.missingFromType.length)
  if (gaps.length) {
    console.log(`  Named gaps:\n`)
    for (const r of gaps) {
      console.log(`    ${r.id}: ${r.missingFromType.join(', ')}`)
    }
    console.log()
  }

  if (journeys.length) {
    const built = journeys.filter((j) => j.state === 'built').length
    const partial = journeys.filter((j) => j.state === 'partial').length
    console.log(`  Journeys: ${built} built, ${partial} partial, ${journeys.length - built - partial} unbuilt\n`)
    for (const j of journeys.filter((j) => j.state !== 'built')) {
      const mark = j.state === 'partial' ? '~' : 'x'
      console.log(`    ${mark} ${j.id.padEnd(28)} ${j.gap || ''}`)
    }
    console.log()
  }

  if (unmeasured.length) {
    console.log(`  UNMEASURED. ${unmeasured.length} contract entit(ies) have no mapping in`)
    console.log(`  CONFIG.entityTypeMap, so they are not in the number above:`)
    console.log(`    ${unmeasured.join(', ')}`)
    console.log(`  Add them, or the score rises whenever the contract grows.\n`)
  }

  if (strict && overall < CONFIG.minCoverage * 100) {
    console.log(`  FAIL: ${overall}% is below the ${CONFIG.minCoverage * 100}% floor.\n`)
    process.exit(1)
  }
  process.exit(0)
}

main()
