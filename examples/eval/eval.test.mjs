/**
 * Tests for the eval harness itself.
 *
 * Yes, tests for the tests. The scoring logic decides whether your build is red,
 * and a bug here is worse than no harness at all: it either blocks good releases
 * or silently passes bad ones. Two of the assertions below are for bugs that are
 * easy to write and hard to notice.
 *
 * Run:  node --test examples/eval/eval.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isPassing, summarise } from './report.mjs'
import { mechanicalChecks, judge } from './judge.mjs'
import { GATING_DIMENSIONS, MIN_DIMENSION_SCORE } from './types.mjs'

const positive = (over = {}) => ({
  id: 'q1',
  query: 'refund window?',
  category: 'positive',
  segment: 'billing',
  scores: { grounding: 5, relevance: 5, calibration: 5, citations: 5, tone: 5 },
  ...over,
})

// ------------------------------------------------------------- gating -------

test('a low score on a gating dimension fails the question', () => {
  assert.equal(isPassing(positive({ scores: { grounding: 2, relevance: 5, calibration: 5, citations: 5 } })), false)
})

test('a low score on a NON-gating dimension does not fail the question', () => {
  // The whole point of the gating/reported split. If this ever starts failing,
  // someone has added `tone` to GATING_DIMENSIONS and the suite is about to
  // become flaky.
  assert.equal(isPassing(positive({ scores: { grounding: 5, relevance: 5, calibration: 5, citations: 5, tone: 1 } })), true)
})

test('a negative case scored on only two dimensions still passes', () => {
  // The easy bug: treating an unscored dimension as zero. That fails every
  // negative case in the suite, and since negative cases are the ones that
  // catch fabrication, you would then delete them to get green.
  const negative = {
    id: 'q2',
    category: 'negative',
    segment: 'billing',
    query: 'what is our stance on quantum computing?',
    scores: { grounding: 5, calibration: 5 },
  }
  assert.equal(isPassing(negative), true)
})

test('a mechanical failure fails the question regardless of scores', () => {
  assert.equal(isPassing(positive({ mechanicalFailures: ['contains forbidden claim: "90 days"'] })), false)
})

test('the floor is inclusive', () => {
  const atFloor = Object.fromEntries(GATING_DIMENSIONS.map((d) => [d, MIN_DIMENSION_SCORE]))
  assert.equal(isPassing(positive({ scores: atFloor })), true)
  const belowFloor = { ...atFloor, grounding: MIN_DIMENSION_SCORE - 1 }
  assert.equal(isPassing(positive({ scores: belowFloor })), false)
})

// ---------------------------------------------------- mechanical checks -----

test('mustMention and mustNotMention are enforced without a model', () => {
  const q = { rubric: { shouldAnswer: true, mustMention: ['30 days'], mustNotMention: ['90 days'] } }
  assert.deepEqual(mechanicalChecks(q, { answer: 'You have 30 days to request a refund.' }), [])
  assert.equal(mechanicalChecks(q, { answer: 'You have 90 days.' }).length, 2)
})

test('answering an out-of-corpus question with confidence is a mechanical failure', () => {
  const q = { rubric: { shouldAnswer: false } }
  const bad = mechanicalChecks(q, { answer: 'Our policy is 45 days.', confidence: 'high' })
  assert.equal(bad.length, 1)
  const good = mechanicalChecks(q, { answer: null, confidence: 'none' })
  assert.equal(good.length, 0)
})

// ------------------------------------------------------------- summary ------

test('the summary breaks down by segment, worst first in the report', () => {
  const s = summarise([
    positive({ id: 'a', segment: 'billing' }),
    positive({ id: 'b', segment: 'billing', scores: { grounding: 1, relevance: 5, calibration: 5, citations: 5 } }),
    positive({ id: 'c', segment: 'onboarding' }),
  ])
  assert.equal(s.total, 3)
  assert.equal(s.passed, 2)
  assert.equal(s.bySegment.billing.passRate, 0.5)
  assert.equal(s.bySegment.onboarding.passRate, 1)
})

test('averages skip dimensions a question was not scored on', () => {
  const s = summarise([
    positive({ scores: { grounding: 4, relevance: 4, calibration: 4, citations: 4, tone: 2 } }),
    { id: 'n', category: 'negative', segment: 'x', scores: { grounding: 5, calibration: 5 } },
  ])
  // grounding averages over both, tone over only the one that had it.
  assert.equal(s.avgScores.grounding, 4.5)
  assert.equal(s.avgScores.tone, 2)
})

test('the suite verdict uses the pass rate, not the average score', () => {
  // A suite can have good averages and still be failing, if the failures are
  // concentrated. Averaging hides that; the pass rate does not.
  const results = Array.from({ length: 10 }, (_, i) =>
    positive({ id: `q${i}`, scores: i < 8 ? { grounding: 5, relevance: 5, calibration: 5, citations: 5 } : { grounding: 1, relevance: 1, calibration: 1, citations: 1 } })
  )
  const s = summarise(results)
  assert.equal(s.passRate, 0.8)
  assert.equal(s.ok, false, '80% is below the 90% floor even though 8 of 10 are perfect')
})

// --------------------------------------------------------------- judge ------

test('the judge tolerates a fenced JSON response', async () => {
  const stub = async () => '```json\n{"scores":{"grounding":5},"reasoning":{"grounding":"fine"}}\n```'
  const out = await judge({ query: 'x', rubric: { shouldAnswer: true } }, { answer: 'y' }, stub)
  assert.equal(out.scores.grounding, 5)
})

test('the judge retries once before giving up', async () => {
  let calls = 0
  const flaky = async () => {
    calls++
    if (calls === 1) throw new Error('rate limited')
    return '{"scores":{"grounding":4},"reasoning":{"grounding":"ok"}}'
  }
  const out = await judge({ query: 'x', rubric: { shouldAnswer: true } }, { answer: 'y' }, flaky)
  assert.equal(calls, 2)
  assert.equal(out.scores.grounding, 4)
})

test('a negative question gets the negative judge prompt', async () => {
  let systemSeen = ''
  const spy = async ({ system }) => {
    systemSeen = system
    return '{"scores":{"grounding":5,"calibration":5},"reasoning":{}}'
  }
  await judge({ query: 'x', rubric: { shouldAnswer: false } }, { answer: null }, spy)
  assert.match(systemSeen, /does NOT cover/, 'a negative case must not be scored on relevance or tone')
})
