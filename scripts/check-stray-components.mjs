#!/usr/bin/env node
/**
 * Design-system drift gate: a reusable component should not live inside one
 * route's private folder.
 *
 * Two separate checks, because they fail differently.
 *
 * CHECK 1, REUSE. A component defined under a route's private folder
 * (src/app/**\/_components/) but imported by two or more other places is
 * shared in practice while living somewhere private by name. The next person
 * looking for it will not find it, and will write a second one.
 *
 * CHECK 2, DUPLICATES. The same component name defined in two or more files.
 * This is the worse failure, because there is no single source at all, and
 * check 1 cannot see it: check 1 works by counting importers, and two
 * copy-pasted components have zero importers each. In the Synacor repo a row
 * component was defined twice, in two different sheets, with the same anatomy
 * and the same explanatory comment pasted into both. Every gate was green.
 *
 * Neither check is a proof. Both are prompts for a human decision: promote it,
 * or add it to ALLOWLIST with a reason. The reason is the point. An allowlist
 * entry with no explanation becomes permanent within a month.
 *
 * Usage:
 *   node scripts/check-stray-components.mjs
 *   node scripts/check-stray-components.mjs --check
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, basename, relative, sep } from 'node:path'

// ---------------------------------------------------------------- CONFIG ---

const CONFIG = {
  // Folders whose components are meant to be private to one route or feature.
  // A component here that gets shared is the drift this catches.
  privateDirs: ['src/app', 'src/features'],
  // Where a promoted component belongs.
  sharedDir: 'src/components',
  // Everything scanned for imports, to count who uses what.
  scanDirs: ['src'],
  ignoreDirs: ['node_modules', '.next', 'dist', 'build', '.git'],
  // Names that look like components but are compositions, not primitives.
  // A page or a layout is not something you promote.
  compositionSuffixes: ['Page', 'Layout', 'Template', 'Provider', 'Boundary', 'Route'],
  // Files that re-export or catalogue rather than consume. An index barrel
  // importing something is not evidence of reuse.
  barrelNames: ['index.ts', 'index.tsx'],
}

/**
 * Intentional exceptions. Every entry needs a reason, and the reason should say
 * why this is genuinely local rather than why nobody has got round to moving it.
 */
const ALLOWLIST = {
  // 'InvoiceRow': 'bound to the billing fixtures and the invoice status enum, not a
  //                tenant-neutral primitive. Shared by the list and the detail drawer
  //                on purpose so the two never drift.',
}

// --------------------------------------------------------------- HELPERS ---

function walk(dir, acc = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return acc
  }
  for (const entry of entries) {
    if (CONFIG.ignoreDirs.includes(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, acc)
    else if (/\.(tsx|jsx)$/.test(entry)) acc.push(full)
  }
  return acc
}

/**
 * Component names declared in a file. Matches the four shapes people write:
 * export function X, export const X = , function X, const X = , where X is
 * PascalCase. Non-exported declarations are included on purpose: check 2 needs
 * them, since a copy-pasted component is usually not exported.
 */
function componentsDeclaredIn(file) {
  const text = readFileSync(file, 'utf8')
  const found = new Map() // name -> exported?
  const patterns = [
    { re: /export\s+(?:default\s+)?function\s+([A-Z][A-Za-z0-9]*)/g, exported: true },
    { re: /export\s+const\s+([A-Z][A-Za-z0-9]*)\s*[:=]/g, exported: true },
    { re: /^\s*function\s+([A-Z][A-Za-z0-9]*)/gm, exported: false },
    { re: /^\s*const\s+([A-Z][A-Za-z0-9]*)\s*[:=]\s*(?:\(|function|React\.memo|forwardRef)/gm, exported: false },
  ]
  for (const { re, exported } of patterns) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text))) {
      const name = m[1]
      if (CONFIG.compositionSuffixes.some((s) => name.endsWith(s))) continue
      if (!found.has(name) || exported) found.set(name, exported)
    }
  }
  // Only count it as a component if the file actually renders JSX. A PascalCase
  // const in a plain .ts helper is a type or a constant, not a component.
  if (!/<[A-Za-z]/.test(text)) return new Map()
  return found
}

/** Named imports in a file, as a flat list of imported identifiers. */
function importsIn(file) {
  const text = readFileSync(file, 'utf8')
  const found = new Set()
  const re = /import\s+(?:type\s+)?\{([^}]+)\}\s+from/g
  let m
  while ((m = re.exec(text))) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim()
      if (/^[A-Z]/.test(name)) found.add(name)
    }
  }
  return found
}

function isPrivate(file) {
  return CONFIG.privateDirs.some((d) => file.startsWith(d + sep) || file.startsWith(d + '/'))
}

// ------------------------------------------------------------------ MAIN ---

function main() {
  const strict = process.argv.includes('--check')
  const files = CONFIG.scanDirs.filter(existsSync).flatMap((d) => walk(d))

  // name -> [files that declare it]
  const declaredIn = new Map()
  for (const file of files) {
    for (const [name] of componentsDeclaredIn(file)) {
      if (!declaredIn.has(name)) declaredIn.set(name, [])
      declaredIn.get(name).push(file)
    }
  }

  // name -> [files that import it], excluding barrels and the declaring file.
  const importedBy = new Map()
  for (const file of files) {
    if (CONFIG.barrelNames.includes(basename(file))) continue
    for (const name of importsIn(file)) {
      if (!declaredIn.has(name)) continue
      if (declaredIn.get(name).includes(file)) continue
      if (!importedBy.has(name)) importedBy.set(name, [])
      importedBy.get(name).push(file)
    }
  }

  const findings = []

  // CHECK 1: private but reused.
  for (const [name, sites] of declaredIn) {
    if (ALLOWLIST[name]) continue
    if (sites.length !== 1) continue // handled by check 2
    const home = sites[0]
    if (!isPrivate(home)) continue
    const users = importedBy.get(name) || []
    if (users.length >= 2) {
      findings.push({
        kind: 'REUSED-BUT-PRIVATE',
        name,
        detail:
          `    defined in ${rel(home)}\n` +
          `    imported by ${users.length}: ${users.map(rel).join(', ')}\n` +
          `    fix: move it to ${CONFIG.sharedDir}/, or add it to ALLOWLIST with the\n` +
          `         reason it is genuinely local to one route`,
      })
    }
  }

  // CHECK 2: defined more than once.
  for (const [name, sites] of declaredIn) {
    if (ALLOWLIST[name]) continue
    if (sites.length < 2) continue
    findings.push({
      kind: 'DEFINED-TWICE',
      name,
      detail:
        `    defined in ${sites.length} files: ${sites.map(rel).join(', ')}\n` +
        `    There is no single source for this component. Copy-paste is the worse\n` +
        `    failure: the two copies will drift and nobody will notice.\n` +
        `    fix: keep one, in ${CONFIG.sharedDir}/, and import it in both places`,
    })
  }

  // -------------------------------------------------------------- REPORT ---

  if (!findings.length) {
    console.log(`components: ok. ${declaredIn.size} component(s) across ${files.length} files.`)
    process.exit(0)
  }

  console.log(`\ncomponents: ${findings.length} finding(s)\n`)
  for (const f of findings) {
    console.log(`  ${f.kind}  ${f.name}`)
    console.log(f.detail)
    console.log()
  }
  console.log(`  These are prompts for a decision, not proofs. Promote, or allowlist`)
  console.log(`  with a reason in ${rel('scripts/check-stray-components.mjs')}.\n`)

  process.exit(strict ? 1 : 0)
}

function rel(f) {
  return relative(process.cwd(), f)
}

main()
