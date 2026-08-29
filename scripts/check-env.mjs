#!/usr/bin/env node
/**
 * Env gate: the validated schema, .env.example, and the deploy config all list
 * the same variables.
 *
 * Why this needs a gate. A missing environment variable in production is one of
 * the most common ways a deploy breaks, and it is entirely preventable. The
 * usual sequence: someone adds process.env.STRIPE_WEBHOOK_SECRET, it works
 * locally because their own .env.local has it, and it fails in production
 * because nothing told anyone to set it there. Nothing in the type system knows
 * that .env.example and the Vercel project settings exist.
 *
 * This assumes you validate env at boot with Zod, which you should do anyway:
 *
 *   // src/env.ts
 *   export const env = z.object({
 *     DATABASE_URL: z.string().url(),
 *     STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
 *     NEXT_PUBLIC_APP_URL: z.string().url(),
 *   }).parse(process.env)
 *
 * Three checks:
 *   1. IN-SCHEMA-NOT-EXAMPLE  a new clone cannot boot and nobody told them why.
 *   2. IN-EXAMPLE-NOT-SCHEMA  either dead, or being read unvalidated somewhere.
 *   3. NOT-IN-DEPLOY-LIST     the variable is not set where it has to run.
 *
 * Check 3 is optional and off unless deployListFile is set, because it needs a
 * file only someone with deploy access can produce. See the "gate or nag"
 * question in chapter 2: if the person committing cannot satisfy it, it does not
 * belong in the commit path.
 *
 * Usage:
 *   node scripts/check-env.mjs
 *   node scripts/check-env.mjs --check
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'

// ---------------------------------------------------------------- CONFIG ---

const CONFIG = {
  schemaFile: 'src/env.ts',
  exampleFile: '.env.example',
  // Optional. A plain text file, one variable name per line, listing what the
  // hosting platform has set. Produce it with `vercel env ls` or equivalent and
  // commit it. Leave null to skip check 3.
  deployListFile: null,
  // Variables that are legitimately absent from .env.example: injected by the
  // platform, or optional with a working default. Each entry needs a reason.
  exempt: {
    NODE_ENV: 'set by the runtime',
    VERCEL_URL: 'injected by the platform',
    PORT: 'injected by the platform',
  },
}

// ----------------------------------------------------------------- PARSE ---

/**
 * Pull variable names out of the Zod schema. Deliberately a regex over the
 * source rather than an import: importing env.ts runs .parse(process.env),
 * which throws in CI where the variables are not set, so the gate would fail
 * for the wrong reason. Matching UPPER_SNAKE keys followed by z. is precise
 * enough in practice, and a false negative here is caught by check 2.
 */
function schemaVars(file) {
  const text = readFileSync(file, 'utf8')
  const found = new Set()
  const re = /^\s*([A-Z][A-Z0-9_]*)\s*:\s*z\./gm
  let m
  while ((m = re.exec(text))) found.add(m[1])
  return found
}

/** Variable names from a dotenv file. Blank lines and comments ignored. */
function dotenvVars(file) {
  const text = readFileSync(file, 'utf8')
  const found = new Set()
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const m = trimmed.match(/^([A-Z][A-Z0-9_]*)\s*=/)
    if (m) found.add(m[1])
  }
  return found
}

/** Variable names from a plain list, one per line. */
function listVars(file) {
  const text = readFileSync(file, 'utf8')
  return new Set(
    text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
  )
}

/**
 * Every process.env.X read directly in source. A variable read this way but
 * absent from the schema is unvalidated: it will be undefined at runtime rather
 * than failing at boot with a clear message.
 */
function directReads(dirs) {
  const found = new Set()
  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      if (['node_modules', '.next', '.git', 'dist'].includes(entry)) continue
      const full = `${dir}/${entry}`
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) {
        const text = readFileSync(full, 'utf8')
        const re = /process\.env\.([A-Z][A-Z0-9_]*)/g
        let m
        while ((m = re.exec(text))) found.add(m[1])
      }
    }
  }
  dirs.forEach(walk)
  return found
}

// ------------------------------------------------------------------ MAIN ---

function main() {
  const strict = process.argv.includes('--check')
  const errors = []
  const warnings = []

  if (!existsSync(CONFIG.schemaFile)) {
    console.error(`No env schema at ${CONFIG.schemaFile}.`)
    console.error(`Create one, or point CONFIG.schemaFile at yours.`)
    process.exit(1)
  }
  if (!existsSync(CONFIG.exampleFile)) {
    console.error(`No ${CONFIG.exampleFile}. Create it: it is the only instruction`)
    console.error(`a new clone gets about what it needs to boot.`)
    process.exit(1)
  }

  const inSchema = schemaVars(CONFIG.schemaFile)
  const inExample = dotenvVars(CONFIG.exampleFile)

  // 1. In the schema, missing from the example.
  for (const name of inSchema) {
    if (!inExample.has(name) && !CONFIG.exempt[name]) {
      errors.push(
        `IN-SCHEMA-NOT-EXAMPLE  ${name}\n` +
          `    A fresh clone will fail to boot with no hint about this.\n` +
          `    fix: add "${name}=" to ${CONFIG.exampleFile}, with a comment saying where to get it`
      )
    }
  }

  // 2. In the example, missing from the schema.
  for (const name of inExample) {
    if (!inSchema.has(name) && !CONFIG.exempt[name]) {
      warnings.push(
        `IN-EXAMPLE-NOT-SCHEMA  ${name}\n` +
          `    Either dead, or read somewhere without validation.\n` +
          `    fix: add it to ${CONFIG.schemaFile}, or delete it from ${CONFIG.exampleFile}`
      )
    }
  }

  // 2b. Read directly without going through the schema.
  const reads = directReads(['src'])
  for (const name of reads) {
    if (!inSchema.has(name) && !CONFIG.exempt[name]) {
      warnings.push(
        `UNVALIDATED-READ  ${name}\n` +
          `    Read via process.env but not in the schema, so it is undefined at\n` +
          `    runtime instead of failing at boot with a clear message.\n` +
          `    fix: add it to ${CONFIG.schemaFile} and import env from there`
      )
    }
  }

  // 3. Missing from the deploy platform.
  if (CONFIG.deployListFile && existsSync(CONFIG.deployListFile)) {
    const deployed = listVars(CONFIG.deployListFile)
    for (const name of inSchema) {
      if (!deployed.has(name) && !CONFIG.exempt[name]) {
        errors.push(
          `NOT-IN-DEPLOY-LIST  ${name}\n` +
            `    In the schema, so the app will not boot in production without it.\n` +
            `    fix: set it on the platform, then refresh ${CONFIG.deployListFile}`
        )
      }
    }
  }

  // -------------------------------------------------------------- REPORT ---

  if (!errors.length && !warnings.length) {
    console.log(`env: ok. ${inSchema.size} variable(s), schema and example agree.`)
    process.exit(0)
  }

  if (errors.length) {
    console.log(`\nenv: ${errors.length} error(s)\n`)
    for (const e of errors) console.log(`  ${e}\n`)
  }
  if (warnings.length) {
    console.log(`env: ${warnings.length} warning(s)\n`)
    for (const w of warnings) console.log(`  ${w}\n`)
  }

  process.exit(strict && errors.length ? 1 : 0)
}

main()
