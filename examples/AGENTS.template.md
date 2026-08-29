# AGENTS.md / CLAUDE.md template

> Copy this to your repo root as `AGENTS.md`, then `ln -s AGENTS.md CLAUDE.md`.
> One file, read by every tool and skimmed once by every human. Delete the
> sections marked for tiers above yours. Replace everything in `<angle brackets>`.
>
> Keep it under about 400 lines. Past that people stop reading it, and an agent
> spends context on it every single turn.

---

# <Project name>

<One paragraph: what this is, who uses it, what makes it different from the
obvious thing. If you cannot write this paragraph, that is the finding.>

**Stack.** <Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4,
shadcn/ui on Radix, Postgres via Drizzle, deployed on Vercel.>

**Status.** <Pre-launch / live with N customers / maintenance.> This matters:
it tells a reader whether a breaking change is cheap or expensive.

## Who decides what

<Ownership by name and by directory. An agent that knows a decision is not its
to make will ask instead of guessing. So will a junior.>

- **<Name>** owns product decisions, copy, and the design system. Directories:
  `src/components/`, `src/app/globals.css`.
- **<Name>** owns data architecture, migrations, and anything touching money.
  Directories: `src/lib/db/`, `drizzle/`.
- **AI assistants** help everywhere inside the rules below.

**Never change without asking:** <auth and session handling, payment code,
migrations that touch existing rows, anything under `src/lib/security/`.>
Mark these in the file itself with `// @ai-policy: read-only` so the marker
travels with the code when it moves.

## Hard rules

<Numbered, short, each one enforceable, each one carrying the reason. Number
them because the lint message, the review comment and the PR template all cite
the number, and "hard rule 3" is a shorter conversation than a paragraph.>

1. **Every user-visible string goes through `t()`.** Add the key to every file
   in `messages/` in the same change. Accessibility copy counts: `aria-label`,
   `placeholder` and `alt` are read aloud by a screen reader and are the ones
   that get forgotten, because they never appear in a screenshot review.
   *Enforced by: `pnpm i18n:check`.*

2. **No hardcoded colour.** Colour is authored in `src/app/globals.css` and
   nowhere else. No `bg-[#hex]`, no hex in a style object. If the colour you
   need does not exist, add a token.
   *Enforced by: `pnpm lint`.*

3. **No arbitrary type sizes.** Use the scale. `text-[13px]` bypasses the
   accessibility text-size setting.
   *Enforced by: `pnpm lint`.*

4. **Logical spacing, never physical.** `ps-4` not `pl-4`, `me-2` not `mr-2`,
   `start-0` not `left-0`. This costs nothing today and is the whole difference
   between supporting a right-to-left language in a week and in a quarter.
   *Enforced by: `pnpm lint`.*
   <Tier 1 and 2 with no RTL plan: keep this rule anyway. It is free now and
   expensive to retrofit. Drop it only if you are certain, and record why.>

5. **No raw `fetch` in feature code.** Reads go through the query layer in
   `src/lib/api/`, writes through server actions. Everything crossing the
   network is parsed by a Zod schema at the boundary.
   *Enforced by: review, plus `pnpm api:check` for the route side.*

6. **Every API route validates its input, checks who is calling, and declares a
   rate limit.** An exemption is a comment in the file saying why.
   *Enforced by: `pnpm api:check`.*

7. **Every environment variable is in `src/env.ts` and `.env.example`.**
   *Enforced by: `pnpm env:check`.*

8. **No em dash in user-facing copy.** Use a period, comma, colon, or
   parentheses. Em dashes read as machine-written and do not translate cleanly.
   Code comments and docs are exempt.
   *Enforced by: `pnpm lint`.*

## What enforces what

<Fill this table in. A rule with an empty right-hand cell is either promoted to
a gate or moved into the judgement section below. There is no third category.
Writing the table is the forcing function.>

| Command | Enforces | Runs |
|---|---|---|
| `pnpm typecheck` | Types | pre-commit, CI |
| `pnpm lint` | Rules 2, 3, 4, 8 | pre-commit, CI |
| `pnpm i18n:check` | Rule 1 | pre-commit, CI |
| `pnpm env:check` | Rule 7 | pre-commit, CI |
| `pnpm api:check` | Rule 6 | pre-commit, CI |
| `pnpm ds:check` | No component stranded in one route, none defined twice | pre-commit |
| `pnpm verify:fixtures` | Every schema still parses its fixtures | pre-commit, CI |
| `pnpm probes` | Every lint rule above actually fires | CI, and locally when lint config changes |

**Deliberate non-gates.** These detect real drift but cannot block a commit,
because someone with a clean clone and no credentials cannot clear them. They
print at session start instead. A gate you cannot satisfy is one people learn to
skip, and that habit spreads to the gates that matter.

| `pnpm coverage` | How much of the contract is built | session-start note |
| `pnpm flags:check` | Feature flags past their removal date | CI, nightly |

## Judgement calls no check can make

<This section is the one that stops a team from being individually compliant and
collectively inconsistent. Every rule above is about what a VALUE may be, so
code can use only tokens, only `t()` keys, only logical spacing, and still be
assembled wrong. Every piece of a bad assembly is legal on its own.>

**Before writing a new page, open the nearest existing one that does the same
kind of thing and copy its structure.** A settings page copies a settings page.
A list page copies a list page. This one line prevents more inconsistency than
any rule above, and it costs nothing.

**Where a message goes** is decided by `src/lib/errors/errorToSurface.ts`, not
per feature. Four surfaces, asked in order, stop at the first yes:
1. Nothing to show at all? Full-page empty state with one retry.
2. One specific value wrong? Inline, at that value.
3. Still true while they are looking at it? A persistent banner.
4. Over and done? A toast.

Tie-breakers: a condition outliving four seconds is never a toast; a toast
carries no recovery action except undo; if the page already has the control that
would retry, the banner states the reason and offers nothing; the same kind of
message takes the same surface everywhere in the product.

**<Add your own here as you find them.> Each one gets the incident that produced
it, in one sentence.** That sentence is what stops the next person deleting the
rule when it annoys them, and it tells them the rule's real boundary.

## When you change something

<Keyed by the kind of change, not by the file. This is the section agents follow
most reliably, because it turns "keep things consistent" into a checklist.>

- **New user-facing string** -> the key lands in every file in `messages/` in
  the same commit.
- **New component** -> if two routes will use it, it goes in `src/components/`
  from the start, not in one route's folder.
- **New API route** -> Zod input schema, auth check, rate limit, and a fixture
  for the response shape.
- **New env var** -> `src/env.ts`, `.env.example`, and the hosting platform, in
  that order.
- **New DB column** -> migration, schema, seed factory, and a header comment on
  the migration answering: is it reversible, does it lock, what is the backfill,
  how do we roll back.
- **New feature flag** -> the registry, with an owner and a removal date.
- **Changed the contract** -> run `pnpm coverage` and note what it moved.

## Decisions

Settled decisions live in `docs/DECISIONS.md`. Read it before re-opening
something. If you disagree with one, that is a new dated entry, not an edit to
the old one.

Open questions live in `docs/OPEN-QUESTIONS.md`. A feature that touches one
surfaces it rather than guessing past it. **If you do not know something, say
so and stop. Do not fill the gap with a plausible default:** a convention that
enters the codebase as a guess is indistinguishable from a decision six weeks
later.

## Running it

```
pnpm install     also wires the git hooks
pnpm doctor      what your machine is missing, and the command that fixes it
pnpm dev         http://localhost:3000
pnpm check       every gate, the way CI runs them
```

<Tier 3 and 4 only:>
## Repo layout

```
src/app/          routes. A route's own components go in _components/
src/components/   anything two routes use. Presentation only, no data fetching
src/lib/          server/  never imported from a client component
                  api/     the only place fetch is called
                  errors/  the surface classifier
packages/         shared across apps. Must not import next or react
```

**Boundaries that are enforced, not conventions:** nothing outside
`src/experiments/` may import from inside it; nothing in `src/lib/server/` may
be imported by a client component; `packages/core` must not import `next`.
