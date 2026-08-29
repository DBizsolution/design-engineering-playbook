/**
 * LLM-as-judge scoring.
 *
 * TWO JUDGE PROMPTS, NOT ONE. This is the design decision most eval harnesses
 * get wrong. A negative case, where the correct behaviour is to decline, cannot
 * be scored on "relevance" or "tone": there is no answer for those to be about,
 * and asking the judge anyway produces noise that moves your aggregate. Score
 * only what the category can be right about.
 *
 * The judge is a model, so it is wrong sometimes. Two things keep that
 * manageable. It scores on a 1 to 5 scale with concrete anchors at each end,
 * which is much more stable than "rate the quality". And it returns a one-line
 * reason per dimension, so a surprising score can be read and dismissed in
 * seconds rather than re-run.
 */

// ------------------------------------------------------------- PROMPTS -----

export const POSITIVE_JUDGE_PROMPT = `You are evaluating an answer produced by a retrieval-based assistant. It searches a corpus of the company's own documents and answers from what it finds.

Score each dimension from 1 (worst) to 5 (best). Give one short line of reasoning for each.

1. grounding - Does the answer only assert things the retrieved sources support?
   Score 1 if it states facts, figures or policies that are not in the sources.
   Score 5 if every claim traces to something retrieved.

2. relevance - Did retrieval find the right material for this question?
   Score 1 if the answer is vague or evasive on a topic the corpus covers well.
   Score 5 if the answer is specific and directly addresses what was asked.

3. calibration - Does the stated confidence match the actual answer quality?
   "high" confidence on a hedge-filled answer is poor calibration.
   "low" confidence on a well-sourced specific answer is also poor calibration.
   Score 5 when the confidence claim matches what the answer actually delivers.

4. citations - Are citations present, real, and supporting the specific claims?
   Score 1 if citations are missing, or point somewhere unrelated to the claim.
   Score 5 if each significant claim carries a citation that supports it.

5. tone - Does it sound like a clear internal document rather than a chatbot?
   Score 1 for filler, hedging boilerplate, or "I'd be happy to help".
   Score 5 for direct, specific prose.

Return ONLY JSON:
{"scores":{"grounding":N,"relevance":N,"calibration":N,"citations":N,"tone":N},
 "reasoning":{"grounding":"...","relevance":"...","calibration":"...","citations":"...","tone":"..."}}`

export const NEGATIVE_JUDGE_PROMPT = `You are evaluating a retrieval-based assistant that was asked a question its document corpus does NOT cover. The correct behaviour is to say so plainly rather than construct a plausible answer.

Score only these two dimensions, 1 (worst) to 5 (best), with one line of reasoning each.

1. grounding - Did it avoid inventing content?
   Score 5 if it clearly said it does not have this information.
   Score 3 if it hedged but still implied an answer.
   Score 1 if it produced a confident answer with no supporting material.

2. calibration - Is the stated confidence appropriate?
   Expected confidence here is "none".
   Score 5 for "none". Score 3 for "low". Score 1 for "high" or "medium".

Return ONLY JSON:
{"scores":{"grounding":N,"calibration":N},
 "reasoning":{"grounding":"...","calibration":"..."}}`

// -------------------------------------------------------------- SCORING ----

export function buildUserPrompt(question, response) {
  const citations = response.citations?.length
    ? response.citations.map((c, i) => `  ${i + 1}. ${c.title} (${c.source})`).join('\n')
    : '  (none provided)'

  return [
    `## Question`,
    question.query,
    ``,
    `## Expected to answer`,
    question.rubric.shouldAnswer ? 'yes' : 'no, this is outside the corpus',
    ``,
    question.rubric.mustMention?.length ? `## Should mention\n${question.rubric.mustMention.join(', ')}\n` : '',
    `## Stated confidence`,
    response.confidence ?? '(none reported)',
    ``,
    `## Answer`,
    response.answer || '(declined to answer)',
    ``,
    `## Citations`,
    citations,
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Deterministic pre-checks, run before the judge. These cost nothing, never
 * disagree with themselves, and catch the failures you can define exactly. Only
 * send to the judge what genuinely needs a judgement.
 */
export function mechanicalChecks(question, response) {
  const failures = []
  const text = (response.answer || '').toLowerCase()

  for (const phrase of question.rubric.mustMention ?? []) {
    if (!text.includes(phrase.toLowerCase())) failures.push(`missing required detail: "${phrase}"`)
  }
  for (const phrase of question.rubric.mustNotMention ?? []) {
    if (text.includes(phrase.toLowerCase())) failures.push(`contains forbidden claim: "${phrase}"`)
  }
  if (question.rubric.shouldAnswer && !response.answer) {
    failures.push('declined a question the corpus covers')
  }
  if (!question.rubric.shouldAnswer && response.answer && response.confidence !== 'none') {
    failures.push('answered a question outside the corpus with non-zero confidence')
  }
  return failures
}

/**
 * Call the judge. Kept behind one function so you can swap the provider, or
 * stub it in tests, without touching the runner.
 *
 * `judgeFn` takes { system, user } and returns the model's text. Inject it so
 * the harness is testable without network access, which is how the scoring and
 * reporting logic in this directory was verified.
 */
export async function judge(question, response, judgeFn) {
  const isNegative = !question.rubric.shouldAnswer
  const system = isNegative ? NEGATIVE_JUDGE_PROMPT : POSITIVE_JUDGE_PROMPT
  const user = buildUserPrompt(question, response)

  let raw
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      raw = await judgeFn({ system, user })
      break
    } catch (e) {
      if (attempt === 1) throw e
    }
  }

  // Models occasionally wrap JSON in a fence despite instructions.
  const cleaned = String(raw).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const parsed = JSON.parse(cleaned)
  return { scores: parsed.scores, reasoning: parsed.reasoning }
}
