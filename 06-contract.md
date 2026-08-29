# The contract

A machine-readable description of what the product is, separate from the code
that implements it. Start at Tier 2, and start small: one JSON file listing your
entities, their fields, and your journeys.

The payoff arrives in a specific moment. Someone asks how far along you are, and
instead of "mostly done" you can say "we lift 80% of the contract, here are the
three named gaps, and one journey is entirely unbuilt".

## Start with this much

`examples/contract.json`:

```json
{
  "version": "0.3.0",
  "entities": [
    {
      "id": "invoice",
      "description": "A bill sent to a customer. Immutable once issued.",
      "fields": ["invoice_number", "total_amount", "customer_id", "due_date", "tax_rate", "pdf_url"],
      "states": ["draft", "issued", "paid", "overdue", "void"]
    }
  ],
  "journeys": [
    { "id": "create-invoice", "state": "built" },
    { "id": "send-invoice", "state": "partial", "gap": "no email preview, no resend. BR-014 requires both." },
    { "id": "refund-payment", "state": "unbuilt", "gap": "entirely unbuilt. No UI, no route." }
  ]
}
```

That is enough to run the coverage check. Do not model state machines and
mutation contracts on day one. Add them when something forces you to.

## Measuring what is built {#coverage}

`scripts/check-contract-coverage.mjs`

This is the highest-value thing in the chapter and the reason to start a contract
at all. It parses your real TypeScript with the compiler API, maps contract
entities to app types, and reports coverage at three layers.

```
  Entity           Type   Fixture   UI     Status
  ----------------------------------------------------
  invoice           75%     63%     63%   amber
  customer          75%     75%     25%   amber
  subscription     100%      0%      0%   green

  Overall type-layer coverage: 80%  ████████░░

  Named gaps:
    invoice: tax_rate, pdf_url
    customer: billing_address

  Journeys: 1 built, 1 partial, 1 unbuilt
    ~ send-invoice     no email preview, no resend (BR-014)
    x refund-payment   entirely unbuilt, no UI at all

  UNMEASURED. 1 contract entity has no mapping in CONFIG.entityTypeMap:
    payment
  Add them, or the score rises whenever the contract grows.
```

**Three layers, because they fail differently.**

- **Type**: the field exists in the app's TypeScript. Missing means unbuilt.
- **Fixture**: some fixture or seed populates it. Missing means nobody has ever
  seen it with data in it.
- **UI**: some component references it. Missing means the product collects it and
  never shows it.

`subscription` above is the case that makes the point: fully typed, in no fixture,
on no screen. Built, never exercised, never shown. One combined percentage hides
that completely.

**Field aliases are honest, not a workaround.** The contract is domain-shaped and
snake_case. The app is UI-shaped, camelCase, and abbreviates. You have three
options: force the app to rename, which is a fight you will lose; report the
mismatches as gaps, which makes the number a lie; or write the mapping down.

```js
fieldAliases: {
  invoice_number: ['ref', 'number'],
  total_amount: ['total', 'amount'],
  line_items: ['lines', 'items'],
}
```

A mapping table is an honest artifact. A silent mismatch is a bug.

**It reports its own blind spot.** Any contract entity with no mapping is printed
as unmeasured rather than skipped. A coverage tool that quietly ignores what it
cannot see reports a number that goes *up* when you add entities it does not
understand.

**Journey state is hand-maintained**, and that is correct. Nothing can infer "is
this flow built" from source. Update it when you finish something, and put the
specific gap in the `gap` field with the rule id it fails.

**Set the floor at your current number.** `CONFIG.minCoverage` starts at 0. Once
you know where you are, set it just below, so the check fails when coverage goes
backwards. Ratchet it up as you build. A threshold nobody can meet is a threshold
people delete.

**At Tier 3, run it per consuming app.** Coverage is a property of a consumer,
not of the contract. Three apps consuming one contract have three different
numbers, and a single shared score would be meaningless.

## Which source wins {#source-policy}

At Tier 3 and up you have several documents claiming to describe the product: a
contract or SOW, a PRD, tickets, the existing production behaviour, a competitor,
and an email from the client. They disagree. Write down which one wins, once, and
stop having the argument.

Put this at the top of the contract file:

```json
"source_policy": {
  "requirement_authority": "source.signed_sow",
  "authority_reason": "The SOW is the document both parties signed. A ticket is how work is scheduled, not how scope is agreed.",
  "context_rule": "The PRD and call notes explain intent, assumptions and candidate designs. They remain proposed until an authorised change order accepts them. They cannot override the SOW.",
  "conflict_rule": "Do not resolve conflicting sources silently. Preserve both statements and open an entry in OPEN-QUESTIONS.md.",
  "unknown_rule": "Represent an unknown as an open question, not as a default. Block the affected implementation. Do not substitute a conventional assumption.",
  "verbatim_rule": "This file paraphrases. Quote the source document when the exact wording matters."
}
```

Five clauses, each closing a specific failure.

**`authority_reason`, not just `requirement_authority`.** Naming the winning
document is cheap. Writing down *why* is what stops the next person relitigating
it in six months.

**`context_rule`** gives non-authoritative sources a real job. They may explain
and propose; they may not approve. Without it, whichever document is most
detailed quietly becomes the requirement, which is usually a vendor proposal or a
competitor's behaviour.

**`conflict_rule`.** A conflict between sources is a finding to record, never a
silent pick. The resolution is a written open question, not a judgement someone
made in their head on a Thursday.

**`unknown_rule` is the most valuable line.** The default behaviour of both
juniors and language models is to fill a gap with a plausible convention. This
makes that a policy violation rather than a style preference, and it gives people
permission to stop and ask.

**`verbatim_rule`** admits the contract is a paraphrase and says where to go when
exact wording is contractual. A model that pretends to be the source gets quoted
in a dispute.

Give each source a status field too. `"authority": "candidate"` and
`"release_status": "not_confirmed_as_released"` is the honest encoding of "this
looks like the spec but nobody has confirmed it is signed", which is the actual
state of most enterprise requirements documents most of the time.

One more rule from the same project, worth copying verbatim:

> Read-only sources establish what the platform does today, not what has been
> agreed. **Never promote an observed implementation to an approved decision.**

## Provenance on rules {#provenance}

Put the provenance on the rule itself, not only in a separate decisions log. A
rule is what someone reads while implementing. A separate log is what they read
never.

```json
{
  "id": "BR-014",
  "text": "An invoice can be resent to the same address any number of times, but changing the recipient requires voiding and reissuing, because the original is the legal record.",
  "applies_to": ["invoice"],
  "source": "Client call 2026-08-12. Finance lead: 'the address on the sent one has to be the address it went to.'",
  "status": "agreed"
}
```

Three habits, all cheap.

**Quote the person, with the date.** Six weeks later a paraphrase is
indistinguishable from a reconstruction. A quote is evidence.

**Flag an inference at the clause that is inferred**, not at the rule:

```json
"note": "Whether a seat REMOVAL credits at period end is an inference, not agreed. See OQ-009."
```

A rule is rarely wholly agreed or wholly derived. Marking the specific sentence
that is a guess, and pointing it at the question that would settle it, is worth
the extra line.

**Keep consolidation history when rules merge.**

```json
"source": "DECISIONS.md 2026-08-30. Consolidates former BR-007 and BR-018."
```

Never let an id die silently. Tickets, emails and code comments citing BR-007
still need to resolve to something.

**`applies_to`** lets a developer touching one entity filter to the rules that
bind it, which is what makes a hundred-rule list usable.

## Generating an implementation checklist

Once rules have ids and `applies_to`, generate a checklist from them rather than
maintaining one:

```markdown
# Business rules checklist
Version: 0.3.0 | Generated: 2026-08-30

| Status | ID | Rule | Applies to | Source |
|---|---|---|---|---|
| [ ] | BR-014 | An invoice can be resent to the same address... | invoice | Client call 2026-08-12 |
| [x] | BR-021 | Seat additions take effect immediately... | subscription | DECISIONS 2026-08-30 |
```

Generated and version-stamped, so it is disposable and always current rather than
a document someone has to keep up to date.

## Generating code {#codegen}

Tier 4, and only when the contract has earned it. The point at which it pays off
is when the same shape is written by hand in three places and they drift.

What is realistic to generate:

- **Zod schemas** from the contract's entity fields
- **TypeScript types** from the same
- **API route stubs** from journeys, with the validation and auth already wired
- **Migration skeletons** from entity changes
- **Test scaffolds** from rules

Two decisions to make before you start.

**Model in TypeScript or JSON?** TypeScript gets you type checking, autocomplete
while authoring, and refactoring tools for free. JSON is editable by tools and by
people outside the repo. Choose JSON when the contract is edited by non-engineers
or by other systems; choose TypeScript when it is primarily consumed by code.

**Mark what is safe to regenerate.** Every generated file carries a header:

```ts
// @generated-from: contract.json#invoice
// @regenerable: true
// @last-generated: 2026-08-30
```

`true` for schemas, types and test scaffolds. `false` for state machines,
edge-case handlers and permission mappers: generated once, then owned by hand.
Without this distinction, a regeneration pass silently destroys hand-tuned logic
and you find out in production.

### One validator across every representation

Once the same fact lives in the contract, the types, the generated schemas and
possibly a prompt, they can disagree. One script checks them all:

```
1. the contract validates against its own schema
2. the generated schemas match the types
3. enum values agree across all three
4. every reference resolves
5. no orphans: a journey naming an actor that no longer exists
```

Give every finding a `severity`, a `type`, a `message` and a **`fix`** string,
and make `fix` required in the type. Chapter 3 asks error messages to name the
remedy; making it a required field is how you guarantee one exists rather than
hoping each check author writes a good message.

### If a prompt in your product describes a schema, generate it

The sharpest idea in this chapter. If you have an AI feature whose system prompt
describes your data shapes, generate that part of the prompt from the types:

```
scripts/generate-prompt-types.mjs
  parses src/types/contract.ts
  emits src/lib/ai/type-definitions.ts
  which src/lib/ai/prompt.ts imports
```

Otherwise someone adds a field to the type, the prompt keeps describing the old
shape, the model keeps emitting the old shape, and the failure looks like a model
quality problem rather than a stale string. Treat prompt drift as a first-class
defect type sitting next to schema drift, not as a footnote.

### Hash the evidence a decision closes against

Found by a validator in one of these projects: an open question was marked
resolved, citing a meeting transcript that was never registered as a source and
never hashed. Every check was green, and the decision rested on nothing anyone
could find.

Two rules:

**Every citation resolves to a registered source, and the registry holds a
content hash.** If the source changes, the decision that cited it is flagged for
re-reading.

**A generator goes green by reconciling itself with the model, never by
regenerating over recorded content.** A tool that can overwrite human-authored
decisions to make its own check pass is not a gate.

## What not to do

**Do not model everything before building anything.** Model the domain you are
about to build. Add the next one when you get there.

**Do not let the contract become a second source of truth for the code.** It
describes intent. The code is the implementation. The coverage check measures the
distance, and a gap is information, not necessarily a bug.

**Do not make the contract a monolith.** At Tier 3 and up, one file per bounded
context, and load one at a time. A single enormous file is unreadable for people
and does not fit in an assistant's context window.
