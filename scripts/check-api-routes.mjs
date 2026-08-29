#!/usr/bin/env node
/**
 * API contract gate: every route handler validates its input, checks who is
 * calling, and declares a rate limit.
 *
 * Why presence checks are worth it. These three are the most common API defects
 * and all three are invisible to the type system. TypeScript will happily let
 * you write `const body = await req.json()` and treat the result as whatever
 * you claim it is, because `json()` returns `any`. Nothing warns you that a
 * handler has no auth check. Nothing counts requests.
 *
 * This does not verify the checks are correct. It verifies they are present.
 * That is a much weaker claim and still catches the overwhelming majority of
 * real cases, because the usual failure is not a subtly wrong auth check, it is
 * no auth check at all in a handler somebody added at 6pm.
 *
 * Four checks:
 *   1. NO-INPUT-SCHEMA   a body-taking method that never calls .parse/.safeParse
 *   2. NO-AUTH           no recognised auth call, and not declared public
 *   3. NO-RATE-LIMIT     no recognised rate-limit call, and not exempt
 *   4. UNDECLARED-PUBLIC a route marked public with no reason given
 *
 * Check 4 matters more than it looks. Making a route public is a real decision
 * and it should read like one. A bare marker with no sentence next to it is how
 * an endpoint ends up public because someone was debugging.
 *
 * Declare an exemption in the route file itself, so it travels with the code
 * and shows up in the diff that makes it true:
 *
 *   // @api-public: Stripe calls this before any session exists. Signature
 *   //              verified below via stripe.webhooks.constructEvent.
 *   // @api-no-rate-limit: Stripe retries with backoff and we must not drop them.
 *
 * Usage:
 *   node scripts/check-api-routes.mjs
 *   node scripts/check-api-routes.mjs --check
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

// ---------------------------------------------------------------- CONFIG ---

const CONFIG = {
  // Next.js App Router. For Pages Router use ['src/pages/api'] and drop the
  // filename filter below.
  routeDirs: ['src/app'],
  routeFileNames: ['route.ts', 'route.tsx', 'route.js'],
  ignoreDirs: ['node_modules', '.next', 'dist', '.git'],

  // Methods that carry a body and therefore need input validation.
  bodyMethods: ['POST', 'PUT', 'PATCH'],
  allMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],

  // Anything that counts as validating input. Add your own helper names.
  validationCalls: [/\.\s*safeParse\s*\(/, /\.\s*parse\s*\(/, /validate(?:Body|Input|Request)\s*\(/],

  // Anything that counts as establishing who is calling. Add your own.
  authCalls: [
    /\bauth\s*\(/,
    /getServerSession\s*\(/,
    /requireUser\s*\(/,
    /requireSession\s*\(/,
    /currentUser\s*\(/,
    /getUser\s*\(/,
    /verifyWebhook\s*\(/,
    /constructEvent\s*\(/,
  ],

  // Anything that counts as a rate limit.
  rateLimitCalls: [/rateLimit\s*\(/, /ratelimit\s*\./, /limiter\s*\./, /checkRateLimit\s*\(/],

  // In-file exemption markers.
  //
  // [ \t]* and [^\n]*, never \s* and .*, because \s matches a newline: an
  // earlier version of this let `// @api-public` with no reason swallow the
  // NEXT line's text as its reason and pass the length check. The rule this
  // proves is in chapter 2: write a probe that must fail before you trust a
  // new check, or you ship something that reads as coverage and is not.
  markers: {
    public: /@api-public:?[ \t]*([^\n]*)/,
    noRateLimit: /@api-no-rate-limit:?[ \t]*([^\n]*)/,
    noSchema: /@api-no-schema:?[ \t]*([^\n]*)/,
  },

  // A reason shorter than this reads as no reason.
  minReasonLength: 20,
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
    else if (CONFIG.routeFileNames.includes(entry)) acc.push(full)
  }
  return acc
}

/** Which HTTP methods this file exports. */
function methodsIn(text) {
  return CONFIG.allMethods.filter((m) =>
    new RegExp(`export\\s+(?:async\\s+)?(?:function\\s+${m}\\b|const\\s+${m}\\s*[:=])`).test(text)
  )
}

const anyMatch = (patterns, text) => patterns.some((p) => p.test(text))

/** Read a marker and its reason. Returns null, or { reason }. */
function marker(text, re) {
  const m = text.match(re)
  if (!m) return null
  return { reason: (m[1] || '').trim() }
}

// ------------------------------------------------------------------ MAIN ---

function main() {
  const strict = process.argv.includes('--check')
  const files = CONFIG.routeDirs.filter(existsSync).flatMap((d) => walk(d))
  const findings = []

  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const where = relative(process.cwd(), file)
    const methods = methodsIn(text)
    if (!methods.length) continue

    const isPublic = marker(text, CONFIG.markers.public)
    const noRateLimit = marker(text, CONFIG.markers.noRateLimit)
    const noSchema = marker(text, CONFIG.markers.noSchema)

    // 1. Input validation on body-carrying methods.
    const bodyMethods = methods.filter((m) => CONFIG.bodyMethods.includes(m))
    if (bodyMethods.length && !anyMatch(CONFIG.validationCalls, text) && !noSchema) {
      findings.push({
        level: 'error',
        code: 'NO-INPUT-SCHEMA',
        where,
        msg:
          `${bodyMethods.join('/')} accepts a body but nothing validates it.\n` +
          `    req.json() returns any, so the handler trusts whatever arrives.\n` +
          `    fix: define a Zod schema and call schema.safeParse(await req.json()),\n` +
          `         returning 400 on failure. If this genuinely takes no structured\n` +
          `         body, add: // @api-no-schema: <reason>`,
      })
    }

    // 2. Auth.
    if (!anyMatch(CONFIG.authCalls, text) && !isPublic) {
      findings.push({
        level: 'error',
        code: 'NO-AUTH',
        where,
        msg:
          `${methods.join('/')} has no recognised auth check.\n` +
          `    fix: call your session helper and return 401 when there is no user.\n` +
          `         If this route is deliberately public, add:\n` +
          `         // @api-public: <why, and what protects it instead>`,
      })
    }

    // 3. Rate limit.
    if (!anyMatch(CONFIG.rateLimitCalls, text) && !noRateLimit) {
      findings.push({
        level: 'warning',
        code: 'NO-RATE-LIMIT',
        where,
        msg:
          `${methods.join('/')} declares no rate limit.\n` +
          `    fix: wrap it in your limiter, or add:\n` +
          `         // @api-no-rate-limit: <reason>`,
      })
    }

    // 4. A public route with no stated reason.
    for (const [name, found] of [
      ['@api-public', isPublic],
      ['@api-no-rate-limit', noRateLimit],
      ['@api-no-schema', noSchema],
    ]) {
      if (found && found.reason.length < CONFIG.minReasonLength) {
        findings.push({
          level: 'error',
          code: 'UNDECLARED-EXEMPTION',
          where,
          msg:
            `${name} is set but says nothing useful.\n` +
            `    An exemption with no reason becomes permanent. Write the sentence:\n` +
            `    what makes this safe, or what protects it instead.`,
        })
      }
    }
  }

  // -------------------------------------------------------------- REPORT ---

  const errors = findings.filter((f) => f.level === 'error')
  const warnings = findings.filter((f) => f.level === 'warning')

  if (!findings.length) {
    console.log(`api: ok. ${files.length} route file(s), all validated, authed and limited.`)
    process.exit(0)
  }

  if (errors.length) {
    console.log(`\napi: ${errors.length} error(s)\n`)
    for (const f of errors) console.log(`  ${f.code}  ${f.where}\n    ${f.msg}\n`)
  }
  if (warnings.length) {
    console.log(`api: ${warnings.length} warning(s)\n`)
    for (const f of warnings) console.log(`  ${f.code}  ${f.where}\n    ${f.msg}\n`)
  }

  process.exit(strict && errors.length ? 1 : 0)
}

main()
