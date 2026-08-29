#!/usr/bin/env node
/**
 * i18n gate: every translation key a component asks for actually exists, and
 * the locale files stay in step with each other.
 *
 * Why this needs its own script. TypeScript cannot catch it, because t() takes
 * any string. ESLint cannot catch it, because t('nav.settings') is a perfectly
 * well formed call. And a missing key does not crash: i18next renders the key
 * itself, so the screen shows "nav.settings" where a label should be. If the
 * key was on an aria-label, nothing shows at all and a screen reader reads the
 * dotted path aloud. Nobody catches that in a screenshot review.
 *
 * Four checks:
 *   1. USED-BUT-UNDEFINED  a literal t('key') with no entry in the base locale.
 *   2. MISSING-IN-<locale> a key in the base locale absent from another locale.
 *   3. BAD-PLURAL         a plural set without at least _one and _other.
 *   4. Unused keys, reported as info only, never a failure.
 *
 * On 4: some call sites build keys at runtime, t(`errors.${code}.title`), so a
 * key with no literal call site is not proof of a dead string. Failing on it
 * would train people to delete keys that are in use.
 *
 * Config lives in the CONFIG block below. No dependencies.
 *
 * Usage:
 *   node scripts/check-locale-keys.mjs           report everything, exit 0
 *   node scripts/check-locale-keys.mjs --check   exit 1 on any error
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname, relative } from 'node:path'

// ---------------------------------------------------------------- CONFIG ---

const CONFIG = {
  // Where the locale JSON files live, one file per language.
  localeDir: 'messages',
  // The language everything else is compared against.
  baseLocale: 'en',
  // Directories scanned for t() calls.
  sourceDirs: ['src'],
  // File types scanned.
  sourceExts: ['.ts', '.tsx', '.js', '.jsx'],
  // Directory names never scanned.
  ignoreDirs: ['node_modules', '.next', 'dist', 'build', '.git', 'coverage'],
  // Languages allowed to hold keys the base locale does not have. Arabic and
  // Polish have plural categories English lacks, so extra keys there are
  // correct. The reverse, a key missing from a translation, is always a bug.
  allowExtraKeysIn: ['ar', 'pl', 'ru', 'cs'],
}

// ----------------------------------------------------------------- REGEX ---

// t('a.b.c') or t("a.b.c"). Literal first argument only: a template literal is
// dynamic and deliberately out of scope.
const T_CALL = /\bt\(\s*['"]([A-Za-z0-9_.-]+)['"]/g

// A key passed to a component as a prop rather than resolved at the call site:
// <Banner titleKey="offline.title" />. The component calls t() on it, so the
// literal never appears inside a t() and the scanner above cannot see it. Every
// *Key prop in a codebase like this is a locale key, so the shape is enough.
const KEY_PROP = /\b[a-zA-Z]+Key\s*=\s*['"]([A-Za-z0-9_.-]+)['"]/g

// i18next plural and context suffixes (CLDR categories).
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

// --------------------------------------------------------------- HELPERS ---

/** Flatten { a: { b: 1 } } to { 'a.b': 1 } so keys compare as dotted paths. */
function flatten(node, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, out)
    else out[path] = value
  }
  return out
}

function walkFiles(dir, acc = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return acc
  }
  for (const entry of entries) {
    if (CONFIG.ignoreDirs.includes(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walkFiles(full, acc)
    else if (CONFIG.sourceExts.includes(extname(full))) acc.push(full)
  }
  return acc
}

/** Every key the file asks for, with the line it asks on. */
function keysUsedIn(file) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  const found = []
  lines.forEach((line, i) => {
    for (const re of [T_CALL, KEY_PROP]) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(line))) found.push({ key: m[1], file, line: i + 1 })
    }
  })
  return found
}

/**
 * A key resolves if it is present, or if it is a plural base whose variants are
 * present. t('items') with items_one and items_other defined is correct.
 */
function resolves(key, defined) {
  if (defined.has(key)) return true
  return [...defined].some((d) => d.startsWith(`${key}_`) && PLURAL_SUFFIX.test(d))
}

function loadLocales() {
  const files = readdirSync(CONFIG.localeDir).filter((f) => f.endsWith('.json'))
  const locales = {}
  for (const file of files) {
    const name = file.replace(/\.json$/, '')
    locales[name] = flatten(JSON.parse(readFileSync(join(CONFIG.localeDir, file), 'utf8')))
  }
  return locales
}

// ------------------------------------------------------------------ MAIN ---

function main() {
  const strict = process.argv.includes('--check')
  const locales = loadLocales()
  const base = locales[CONFIG.baseLocale]

  if (!base) {
    console.error(`No base locale at ${CONFIG.localeDir}/${CONFIG.baseLocale}.json`)
    process.exit(1)
  }

  const baseKeys = new Set(Object.keys(base))
  const errors = []
  const info = []

  // 1. Used but undefined.
  const files = CONFIG.sourceDirs.flatMap((d) => walkFiles(d))
  const used = new Map()
  for (const file of files) {
    for (const hit of keysUsedIn(file)) {
      if (!used.has(hit.key)) used.set(hit.key, [])
      used.get(hit.key).push(hit)
    }
  }
  for (const [key, hits] of used) {
    if (!resolves(key, baseKeys)) {
      const where = hits.map((h) => `${relative(process.cwd(), h.file)}:${h.line}`).join(', ')
      errors.push(`USED-BUT-UNDEFINED  ${key}\n    called at ${where}\n    fix: add it to ${CONFIG.localeDir}/${CONFIG.baseLocale}.json and every other locale`)
    }
  }

  // 2. Missing in a translation.
  for (const [name, keys] of Object.entries(locales)) {
    if (name === CONFIG.baseLocale) continue
    const theirs = new Set(Object.keys(keys))
    const missing = [...baseKeys].filter((k) => !theirs.has(k))
    for (const key of missing) {
      errors.push(`MISSING-IN-${name.toUpperCase()}  ${key}\n    fix: add it to ${CONFIG.localeDir}/${name}.json`)
    }
    if (!CONFIG.allowExtraKeysIn.includes(name)) {
      const extra = [...theirs].filter((k) => !baseKeys.has(k))
      for (const key of extra) {
        errors.push(`EXTRA-IN-${name.toUpperCase()}  ${key}\n    fix: remove it, or add it to the base locale if it is real`)
      }
    }
  }

  // 3. Incomplete plural sets in the base locale.
  const pluralBases = new Set()
  for (const key of baseKeys) {
    const m = key.match(PLURAL_SUFFIX)
    if (m) pluralBases.add(key.slice(0, -m[0].length))
  }
  for (const stem of pluralBases) {
    const has = (suffix) => baseKeys.has(`${stem}_${suffix}`)
    if (!has('one') || !has('other')) {
      errors.push(`BAD-PLURAL  ${stem}\n    fix: an English plural set needs at least ${stem}_one and ${stem}_other`)
    }
  }

  // 4. Unused, info only.
  for (const key of baseKeys) {
    const stem = key.replace(PLURAL_SUFFIX, '')
    if (!used.has(key) && !used.has(stem)) info.push(key)
  }

  // -------------------------------------------------------------- REPORT ---

  if (errors.length) {
    console.log(`\ni18n: ${errors.length} problem(s)\n`)
    for (const e of errors) console.log(`  ${e}\n`)
  } else {
    console.log(`i18n: ok. ${baseKeys.size} keys, ${Object.keys(locales).length} locales, ${files.length} files scanned.`)
  }

  if (info.length && !strict) {
    console.log(`\n  info: ${info.length} key(s) with no literal call site. Not a failure:`)
    console.log(`  some call sites build keys at runtime. Check by hand before deleting.`)
    for (const k of info.slice(0, 20)) console.log(`    ${k}`)
    if (info.length > 20) console.log(`    ... and ${info.length - 20} more`)
  }

  process.exit(strict && errors.length ? 1 : 0)
}

main()
