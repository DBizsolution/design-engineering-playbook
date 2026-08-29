/**
 * Eval harness: the thresholds and the shape of a result.
 *
 * Everything else in this playbook gates the code you write. This gates what a
 * model produces at runtime, which nothing static can check. If a model output
 * reaches a user, you need this, and twenty questions is enough to start.
 *
 * The constants below are the whole quality policy, in one place, so changing
 * your bar is a reviewable one-line diff rather than a number buried in a runner.
 */

/**
 * Dimensions the judge scores. Keep the list short: every dimension you add is
 * another thing the judge can be inconsistent about.
 */
export const ALL_DIMENSIONS = [
  'grounding', // does the answer only use what the sources actually say
  'relevance', // did retrieval find the right material
  'calibration', // does the stated confidence match the actual answer quality
  'citations', // are citations present, correct and supporting the claims
  'tone', // does it sound like the product's voice
]

/**
 * THE MOST IMPORTANT LINE IN THIS FILE. Only these dimensions can fail a run.
 *
 * `tone` is measured and reported but never gates, and it is deliberately
 * excluded rather than forgotten. It is a real quality signal, it is also the
 * one an LLM judge is least consistent about, and it moves whenever you tweak a
 * prompt. Gating on it makes the suite flaky, and a flaky red is a red people
 * stop reading. Within a month someone adds `continue-on-error` and you have
 * lost the whole harness.
 *
 * The general rule: gate on the dimensions where a bad score is unambiguously a
 * defect. Report the rest. This is the same correctness-versus-taste split that
 * governs the lint rules.
 */
export const GATING_DIMENSIONS = ['grounding', 'relevance', 'calibration', 'citations']

/**
 * Two thresholds, and you need both.
 *
 * MIN_DIMENSION_SCORE is a per-question floor. It catches one catastrophic
 * answer that an average would hide: a single fabricated citation is a defect
 * even if the other 55 questions are perfect.
 *
 * PASS_RATE is a suite-level tolerance. LLM judging has real variance, and
 * demanding 100% means the suite fails on noise and gets ignored.
 */
export const MIN_DIMENSION_SCORE = 3 // out of 5
export const PASS_RATE = 0.9

/** Keep concurrency low. You are rate-limited, and ordering makes logs readable. */
export const CONCURRENCY = 2
export const REQUEST_TIMEOUT_MS = 90_000
export const MAX_RETRIES = 1

/**
 * Question categories. The `negative` category is the one most teams skip and
 * the one that catches the failure that actually destroys trust.
 *
 * A suite made only of questions the system should answer well measures
 * capability. It tells you nothing about whether the system invents an answer
 * when it has no material, which is the behaviour that loses you a customer.
 * Aim for at least a fifth of the suite to be negative cases.
 */
export const CATEGORIES = {
  positive: 'The system has the material and should answer well.',
  negative: 'The system has no material and must decline rather than invent.',
  adversarial: 'Leading, loaded, or out-of-policy questions it should refuse or redirect.',
}

/** A question in the dataset. The rubric travels with the case, not in a table elsewhere. */
export const QUESTION_SHAPE = `
{
  "id": "q-042",
  "query": "What is our refund window for annual plans?",
  "category": "positive",
  "segment": "billing",              // used for the per-segment breakdown
  "rubric": {
    "shouldAnswer": true,
    "expectedConfidence": "high",     // high | medium | low | none
    "mustMention": ["30 days", "annual"],
    "mustNotMention": ["90 days"]
  }
}
`
