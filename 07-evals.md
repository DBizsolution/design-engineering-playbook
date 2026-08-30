# Evals

Everything else in this playbook checks the code you write. This checks what a
model produces at runtime — the AI-written answer, summary or generated copy
that your interface presents as part of the product. Nothing static can look at
it, and to the person reading the screen, a fabricated answer rendered inside
your carefully designed component is not a model failure. It is a product
failure, and it is yours.

**Install this the moment a model's output reaches a user.** Twenty questions,
three scored dimensions and one threshold is all it takes, and it is the only
thing standing between you and a silent quality regression from a prompt tweak,
a model version bump, or a retrieval index rebuild.

Working code in `examples/eval/`, with thirteen passing tests for the scoring
logic in `eval.test.mjs`.

## The shape

```
examples/eval/
  types.mjs       the dimensions and, importantly, the thresholds
  judge.mjs       two judge prompts, plus deterministic pre-checks
  report.mjs      pass/fail logic, per-segment breakdown
  eval.test.mjs   tests for the above
  questions.json  your dataset
```

```json
// package.json
"eval": "node scripts/eval-runner.mjs"
```

## The dataset needs negative controls

This is the part most teams skip and the one that catches the failure that
actually loses customers.

| Category | Share | Tests |
|---|---|---|
| `positive` | ~65% | Does it answer well when it has the material? |
| `negative` | ~20% | **Does it decline instead of inventing?** |
| `adversarial` | ~15% | Does it refuse or redirect leading and out-of-policy questions? |

A suite made only of questions the system should answer measures capability. It
tells you nothing about whether the system fabricates when it has nothing, which
is the behaviour that destroys trust in a single screenshot.

Each question carries its rubric inline, so the expectation travels with the case
rather than living in a table somewhere else:

```json
{
  "id": "q-042",
  "query": "What is our refund window for annual plans?",
  "category": "positive",
  "segment": "billing",
  "rubric": {
    "shouldAnswer": true,
    "expectedConfidence": "high",
    "mustMention": ["30 days", "annual"],
    "mustNotMention": ["90 days"]
  }
}
```

## Run the cheap checks before the model

`mustMention` and `mustNotMention` are checked in plain code before anything
reaches the judge. They cost nothing, never disagree with themselves, and catch
the failures you can define exactly:

```js
export function mechanicalChecks(question, response) {
  const failures = []
  const text = (response.answer || '').toLowerCase()
  for (const phrase of question.rubric.mustMention ?? [])
    if (!text.includes(phrase.toLowerCase())) failures.push(`missing required detail: "${phrase}"`)
  for (const phrase of question.rubric.mustNotMention ?? [])
    if (text.includes(phrase.toLowerCase())) failures.push(`contains forbidden claim: "${phrase}"`)
  if (!question.rubric.shouldAnswer && response.answer && response.confidence !== 'none')
    failures.push('answered a question outside the corpus with non-zero confidence')
  return failures
}
```

Only send to the judge what genuinely needs a judgement.

## A separate judge prompt per category

The design decision most eval harnesses get wrong. A negative case, where the
correct behaviour is to decline, cannot be scored on "relevance" or "tone": there
is no answer for those to be about. Asking anyway produces noise, and noise moves
your aggregate.

The positive prompt scores five dimensions. The negative prompt scores two:

```
1. grounding - Did it avoid inventing content?
   Score 5 if it clearly said it does not have this information.
   Score 3 if it hedged but still implied an answer.
   Score 1 if it produced a confident answer with no supporting material.

2. calibration - Is the stated confidence appropriate?
   Expected here is "none". Score 5 for "none". Score 3 for "low".
   Score 1 for "high" or "medium".
```

**Score only what the category can be right about.** This is the same idea as
scoping a lint rule instead of switching it off.

Anchor each score with concrete descriptions at 1, 3 and 5. "Rate the quality
out of 5" produces wildly inconsistent judging. "Score 1 if it fabricates
studies, 5 if every claim is grounded" does not.

Ask for one line of reasoning per dimension. A surprising score can then be read
and dismissed in seconds rather than re-run.

## Gate on some dimensions, report the rest

The most important six lines in the harness:

```js
export const ALL_DIMENSIONS = ['grounding', 'relevance', 'calibration', 'citations', 'tone']

export const GATING_DIMENSIONS = ['grounding', 'relevance', 'calibration', 'citations']
// tone is measured and reported but never fails a run.
```

`tone` is a real quality signal. It is also the one an LLM judge is least
consistent about, and the one that moves whenever you touch a prompt. Gating on
it makes the suite flaky, and a flaky red is a red people stop reading. Within a
month someone adds `continue-on-error` and you have lost the whole harness.

This is the correctness-versus-taste split from chapter 3, applied to evals.
**Gate on the dimensions where a bad score is unambiguously a defect. Report the
rest.**

There is a test asserting a low `tone` score does not fail a question, so if
someone adds it to the gating list the test tells them why not.

## Two thresholds, and you need both

```js
export const MIN_DIMENSION_SCORE = 3   // per question, on any gating dimension
export const PASS_RATE = 0.9           // across the suite
```

The per-question floor catches one catastrophic answer that an average would
hide. A single fabricated citation is a defect even if the other 55 questions are
perfect.

The suite rate tolerates real judging variance. Demanding 100% means the suite
fails on noise and gets ignored.

Keep both as named constants in one file, so changing your quality bar is a
reviewable one-line diff rather than a number buried in the runner.

## Score self-reported confidence

`calibration` is the dimension most suites lack and the one with the highest
product value.

> Does the stated confidence match the actual answer quality? "high" confidence
> on a hedge-filled answer is poor calibration. "low" confidence on a well-sourced
> specific answer is also poor calibration.

If your interface surfaces a confidence signal, a hedge, or a designed "not
sure" state, that state is a product claim and needs its own test. A confidently
wrong answer and a hedged wrong answer are different failures with different
blast radii, and only a calibration dimension tells them apart. You designed the
empty state and the error state; the "model is not sure" state is the same kind
of deliverable, and this dimension is what keeps it honest.

## Break the summary down by segment

```js
bySegment: { billing: { passed: 8, total: 10, passRate: 0.8 },
             onboarding: { passed: 10, total: 10, passRate: 1 } }
```

An aggregate pass rate tells you something broke. A per-segment breakdown tells
you what, which is the difference between a red build you can fix and a red build
you re-run hoping it passes. Segment by whatever matters to you: feature area,
model version, prompt template, document corpus, language, customer tier.

The report prints worst segment first.

## Run it on dispatch, not on every push

```yaml
name: Eval
on:
  workflow_dispatch:
    inputs:
      base_url: { description: 'Deployed URL to test, or blank for a local server', default: '' }
  schedule: [{ cron: '0 6 * * 1' }]

jobs:
  eval:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm eval
        env:
          EVAL_BASE_URL: ${{ inputs.base_url || 'http://localhost:3000' }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: eval-results, path: data/eval-results/*.json }
```

Evals cost real money per run and take minutes. The useful cadence is before a
prompt or model change ships, on a schedule, and on demand against a deployed
environment. Same reasoning as the cron in chapter 3: pick the trigger that
matches what the check is for.

**`if: always()` on the artifact upload.** A failing run is exactly the one you
need the results from.

## Keep the results

Write every run to `data/eval-results/<timestamp>.json` and commit them, or push
them somewhere durable. The single most useful thing an eval suite gives you over
time is the ability to say "that regression started on the 14th", which requires
history. The summary object is designed for this: it has a timestamp, the
thresholds it ran against, and per-segment numbers.

## Cost control

- Start with 20 questions. Go to 50 when 20 stops finding things.
- Keep concurrency at 1 or 2. You are rate-limited, and ordered logs are readable.
- Use a cheaper model for the judge than for the product, and check agreement
  with a human on a sample of 20 before trusting it.
- Cache product responses when you are only iterating on the judge prompt.

## When you do not need this

If no model output reaches a user, skip the chapter. Using an assistant to write
code is not a reason to have evals; your existing tests and gates cover that.
This is specifically for output your users read.
