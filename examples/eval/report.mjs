/**
 * Turning scores into a verdict, and into something someone can act on.
 *
 * The rule this file exists for: an aggregate pass rate tells you something
 * broke. A per-segment breakdown tells you WHAT broke, which is the difference
 * between a red build you can fix and a red build you re-run hoping it passes.
 */
import { GATING_DIMENSIONS, MIN_DIMENSION_SCORE, PASS_RATE } from './types.mjs'

/**
 * A question passes when every GATING dimension it was scored on meets the
 * floor, and no mechanical check failed.
 *
 * Note `scores[d] === undefined` is skipped rather than treated as zero. A
 * negative case is only scored on two dimensions by design, and counting the
 * three it was never asked about as failures would fail every negative case.
 */
export function isPassing(result) {
  if (result.mechanicalFailures?.length) return false
  return GATING_DIMENSIONS.every((d) => {
    const score = result.scores?.[d]
    if (score === undefined) return true
    return score >= MIN_DIMENSION_SCORE
  })
}

export function summarise(results) {
  const passed = results.filter(isPassing)
  const passRate = results.length ? passed.length / results.length : 0

  // Average each dimension over the questions that were actually scored on it.
  const avgScores = {}
  for (const dim of new Set(results.flatMap((r) => Object.keys(r.scores ?? {})))) {
    const scored = results.map((r) => r.scores?.[dim]).filter((n) => typeof n === 'number')
    avgScores[dim] = scored.length ? Number((scored.reduce((a, b) => a + b, 0) / scored.length).toFixed(2)) : null
  }

  const group = (key) => {
    const out = {}
    for (const r of results) {
      const k = r[key] ?? 'unknown'
      out[k] ??= { passed: 0, total: 0 }
      out[k].total++
      if (isPassing(r)) out[k].passed++
    }
    for (const v of Object.values(out)) v.passRate = Number((v.passed / v.total).toFixed(2))
    return out
  }

  return {
    timestamp: new Date().toISOString(),
    total: results.length,
    passed: passed.length,
    failed: results.length - passed.length,
    passRate: Number(passRate.toFixed(3)),
    threshold: PASS_RATE,
    ok: passRate >= PASS_RATE,
    avgScores,
    bySegment: group('segment'),
    byCategory: group('category'),
    results,
  }
}

export function printReport(summary) {
  const pct = (n) => `${Math.round(n * 100)}%`

  console.log(`\n  Eval: ${summary.passed}/${summary.total} passed  (${pct(summary.passRate)}, floor ${pct(summary.threshold)})\n`)

  console.log(`  Average scores`)
  for (const [dim, avg] of Object.entries(summary.avgScores)) {
    const gating = GATING_DIMENSIONS.includes(dim)
    // Say which dimensions can actually fail the run, every time. Otherwise
    // somebody reads a low tone score as a failing build and starts tuning for it.
    console.log(`    ${dim.padEnd(14)} ${avg ?? '-'}  ${gating ? '(gating)' : '(reported only)'}`)
  }

  console.log(`\n  By category`)
  for (const [name, s] of Object.entries(summary.byCategory)) {
    console.log(`    ${name.padEnd(14)} ${s.passed}/${s.total}  ${pct(s.passRate)}`)
  }

  console.log(`\n  By segment`)
  for (const [name, s] of Object.entries(summary.bySegment).sort((a, b) => a[1].passRate - b[1].passRate)) {
    console.log(`    ${name.padEnd(14)} ${s.passed}/${s.total}  ${pct(s.passRate)}`)
  }

  const failures = summary.results.filter((r) => !isPassing(r))
  if (failures.length) {
    console.log(`\n  Failures\n`)
    for (const f of failures) {
      console.log(`    ${f.id}  [${f.category}/${f.segment}]  "${f.query}"`)
      if (f.mechanicalFailures?.length) {
        for (const m of f.mechanicalFailures) console.log(`      check: ${m}`)
      }
      for (const dim of GATING_DIMENSIONS) {
        const score = f.scores?.[dim]
        if (typeof score === 'number' && score < MIN_DIMENSION_SCORE) {
          console.log(`      ${dim} ${score}/5: ${f.reasoning?.[dim] ?? ''}`)
        }
      }
      console.log()
    }
  }

  if (!summary.ok) {
    console.log(`  FAIL: ${pct(summary.passRate)} is below the ${pct(summary.threshold)} floor.\n`)
  } else {
    console.log(`  PASS\n`)
  }
}
