# The Design Engineering Playbook

A set of mechanisms for keeping a product's interface in good shape when several
people and several AI assistants are building it. Design engineering is the work
of making the shipped UI as considered as the design: the tokens stay tokens, the
components stay consistent, the copy stays translatable, and none of it depends
on one person remembering. Everything here is running in a real project. The
scripts in `scripts/` are tested and work as written.

The playbook is written for Next.js, React, TypeScript, Tailwind and shadcn/ui,
because that is where most of this will be used. Where React Native differs, the
chapter says so.

## Using it

This repo is meant to be read and copied out of, not installed as a dependency.

```bash
git clone <this repo> ~/engineering-playbook
cd your-project
# then follow 01-start-here.md, which uses PB=~/engineering-playbook
```

Everything in `scripts/` is plain Node with no dependencies beyond what your
project already has. Copy the ones you want into your own `scripts/` folder and
edit the `CONFIG` block at the top of each.

To check the examples still work:

```bash
npm test     # 23 tests: the eval harness and the error-surface classifier
```

## What is in here

```
README.md            this file: the tiers, and what to install for each
01-start-here.md     the setup path for your project's shape. Start here.
02-constitution.md   the one file every person and tool reads
03-gates.md          the hook system, and when a check should not be a gate
04-checks.md         each check: what it catches, how to install, how to tune
05-judgement.md      the rules no check can enforce, and how to write them down
06-contract.md       the spec layer, and measuring how much of it is built
07-evals.md          gating what a model produces, if you ship AI features
08-memory.md         decisions, build log, and picking up where you left off
09-onboarding.md     doctor script, onboarding, and how to research before building

scripts/             the working scripts. Copy the ones you need.
examples/            templates and worked examples.

survey.md            where all of this came from, and why each rule exists
```

`survey.md` is the earlier, longer piece of writing that this playbook was
distilled from. It surveys five real projects and records, for each mechanism,
the specific failure that produced it. Read it when you want the reasoning behind
a rule, or when you need to argue for one. The chapters here are the
implementation; the survey is the evidence.

## Four project shapes

Most advice fails because it assumes one shape. A design spike does not need a
contract model. A four-year product with six contributors and a shared design
system does not survive without one. Find your column and use it.

| | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---|---|---|---|
| **Shape** | Prototype, landing page, design spike | One product UI, fixed scope | Several apps sharing a design system | Long-lived product and its design system |
| **People** | 1 | 1 to 3 | 3 to 8, maybe split across repos | 4+, changing over time |
| **Lifespan** | Weeks | Months | A year or more | Years |
| **Someone will ask** | nothing | "are we on track?" | "who agreed to that?" | "why is it like this?" |

The right amount of process is set by what you will be asked to account for, not
by how much code there is. That is the single most useful idea in this playbook,
and it is why the tiers are defined by accountability rather than by size.

## What to install, by tier

Each item links to the chapter that explains it. Do them in order. Every tier
includes everything from the tiers before it.

### Tier 1: prototype, landing page, design spike

You are protecting against your own future self, six weeks from now, having
forgotten why the spacing is hand-tuned on that one section.

1. `AGENTS.md` with ten lines: stack, three conventions, and what not to touch.
   Symlink `CLAUDE.md` to it. ([chapter 2](02-constitution.md))
2. A pre-commit hook running `tsc --noEmit` and `eslint`. ([chapter 3](03-gates.md))
3. `.env.example`, kept honest by `check-env.mjs`. ([chapter 4](04-checks.md#env))
4. `DECISIONS.md`, with your first three entries written from memory.
   ([chapter 8](08-memory.md))

Skip everything else. A contract model on a two-week prototype is cosplay.

### Tier 2: one product UI, fixed scope, a client who will ask about progress

You are protecting against the moment somebody asks how far along you are, and
against the second builder — human or assistant — whose output quietly diverges
from yours in month three.

Everything from Tier 1, plus:

5. The full path-dispatched pre-commit hook. ([chapter 3](03-gates.md))
6. Design token and copy rules in ESLint, **plus the probe file that proves they
   fire**. ([chapter 4](04-checks.md#lint))
7. `check-api-routes.mjs`: every route behind your UI validates, authenticates
   and rate limits. ([chapter 4](04-checks.md#api))
8. `verify-fixtures.mjs`: every schema parses a real captured payload, so the
   data your screens render stays real. ([chapter 4](04-checks.md#fixtures))
9. `errorToSurface.ts`: decide once which surface each kind of message gets —
   toast, inline, banner. ([chapter 5](05-judgement.md))
10. `doctor.sh` and a short onboarding page. ([chapter 9](09-onboarding.md))
11. A `contract.json` listing entities and journeys, and `check-contract-coverage.mjs`.
    This is what turns "mostly done" into a number. ([chapter 6](06-contract.md))

If you ship any AI-generated output to users, add [chapter 7](07-evals.md) here.
It is not optional once a model is talking to a customer.

### Tier 3: several apps sharing a design system

You are protecting against two teams building the same pattern differently, and
against nobody being able to say who agreed to what.

Everything above, plus:

12. `i18n` gate, if you have more than one language or ever will.
    ([chapter 4](04-checks.md#i18n))
13. `check-stray-components.mjs`, so shared UI does not get stranded in one app.
    ([chapter 4](04-checks.md#components))
14. Import boundaries enforced by lint and by a resolving script.
    ([chapter 4](04-checks.md#boundaries))
15. Contract coverage **per consuming app**, since coverage is a property of a
    consumer, not of the contract. ([chapter 6](06-contract.md))
16. A source policy: which document can approve a requirement, and what happens
    when two sources disagree. ([chapter 6](06-contract.md#source-policy))
17. Rules with provenance: every business rule carries who agreed it and when.
    ([chapter 6](06-contract.md#provenance))

### Tier 4: long-lived product and its design system

You are protecting against turnover, against decisions being silently re-made,
and against the UI becoming something only three people can change safely.

Everything above, plus:

18. The build log fed by a post-commit hook. ([chapter 8](08-memory.md#build-log))
19. Session state with a hard size cap, and a session-start banner.
    ([chapter 8](08-memory.md#session))
20. Generated schemas, API stubs and types from the contract, plus one validator
    across every representation. ([chapter 6](06-contract.md#codegen))
21. A research protocol: what to read before building, and which source wins
    when they conflict. ([chapter 9](09-onboarding.md#research))
22. Graduating warnings, so a new rule can land today on a codebase that would
    fail it. ([chapter 3](03-gates.md#graduating))

## Three ideas underneath all of it

Everything in the chapters follows from these. If you read nothing else, read
this section.

### 1. A rule with no check is not a rule

A design convention that lives only in a style guide decays at exactly the rate
people join the team. "Use tokens, not hex values" is a wish until a commit that
breaks it fails. So the constitution carries a table with two columns: the rule,
and the command that fails when it is broken. Writing the table is the forcing
function. A rule with an empty cell either becomes a check, or gets moved into
the section that says out loud that it is enforced by review. There is no third
category, and the exercise of filling in the table is where you find out which of
your conventions were never really rules.

### 2. Checks belong in git, not only in CI

CI catches problems after you have moved on and after a reviewer has spent
attention on them. Put the checks in a committed git hook instead:

```json
"prepare": "git config core.hooksPath scripts/git-hooks"
```

That one line does something worth more than it looks. It makes the checks
independent of any particular tool. Claude Code, Cursor, Codex, Copilot and a
person on the command line all run the same checks, because the enforcement is
in git rather than in one assistant's config. Say so at the top of the
constitution, and symlink `CLAUDE.md` to `AGENTS.md` so whichever filename a tool
looks for, it finds the same rules.

### 3. Every rule carries the incident that produced it

Not "prefer logical properties" but:

```js
// pl-4 does not mirror in Arabic, it just sits on the wrong side. This shipped
// on the invoice header for two months before an Arabic-speaking customer
// pointed it out.
```

Three things follow, and they are worth the extra sentence every time.

The rule survives the next person who finds it annoying, because the diff that
deletes it also deletes the evidence. It tells you the rule's real boundary: if
you know the rule exists because of screen readers, you know it applies to
`aria-label` and not to a Storybook specimen. And it turns knowledge that
currently lives in one person's head into something the repo owns, which is the
actual problem with a codebase that has been through three teams.

Do this in lint messages, allowlist entries, CI workflow headers, and decision
log entries. It is the highest-return habit in the playbook and it costs one
sentence.

## What this covers, and what it does not

This playbook covers the mechanics of keeping a UI codebase honest: conventions
that enforce themselves, a spec you can measure against, quality gates for AI
output, and memory that survives turnover.

It does not yet cover accessibility auditing, visual regression testing,
performance budgets, or observability. That is deliberate rather than an
oversight: every mechanism here exists because something specific went wrong in
a real project, and each chapter says what. When one of those areas produces its
first real failure, it earns its chapter and its check — written the same way,
with the incident attached. If you cannot point at the failure a check is
preventing, you probably do not need that check yet. Adding all of it to a
two-week project would be a mistake, and the tier table above exists so you do
not.
