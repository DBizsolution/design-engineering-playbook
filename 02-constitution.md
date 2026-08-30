# The constitution

One file at the repo root that every person and every tool reads before touching
a component, a token, or a line of copy. Template: `examples/AGENTS.template.md`.

```bash
cp examples/AGENTS.template.md AGENTS.md
ln -s AGENTS.md CLAUDE.md
```

The symlink takes ten seconds and removes a whole class of "the other tool did
not know" problems. Different assistants look for different filenames. One file,
several names.

## Keep it under 400 lines

Past that, people stop reading it and an assistant burns context on it every
turn. If it is growing, that is a signal that something in it belongs somewhere
else: long rationale goes in `DECISIONS.md`, setup detail goes in a runbook,
architecture goes in its own document that the constitution links to.

## The shape

Seven sections, in this order. The order is not arbitrary: it goes from what
someone needs to know first to what they need to know when they are already
working.

```
1. What this is        one paragraph. If you cannot write it, that is the finding.
2. Who decides what    ownership by name and directory, plus what not to touch
3. Hard rules          numbered, short, each with its check and its reason
4. What enforces what  the table
5. Judgement calls     the rules no check can make
6. When you change X   a checklist keyed by kind of change
7. Running it          the four commands
```

## Number the rules

Because the lint message, the review comment and the pull request template all
cite the number. "Hard rule 3" is a shorter conversation than a paragraph, and
it means a lint error can point at the constitution rather than repeating it.

Keep each rule to two or three lines: what, why, and which command enforces it.

```markdown
1. **Every user-visible string goes through `t()`.** Add the key to every file
   in `messages/` in the same change. Accessibility copy counts: `aria-label`,
   `placeholder` and `alt` are read aloud by a screen reader and are the ones
   that get forgotten, because they never appear in a screenshot review.
   *Enforced by: `pnpm i18n:check`.*
```

The "why" clause is doing real work. Someone who knows this rule exists because
of screen readers understands that it applies to `aria-label` and not to a
Storybook specimen string, without having to ask.

## Write the enforcement table, including the empty cells

| Command | Enforces | Runs |
|---|---|---|
| `pnpm typecheck` | Types | pre-commit, CI |
| `pnpm lint` | Rules 2, 3, 4, 8 | pre-commit, CI |
| `pnpm i18n:check` | Rule 1 | pre-commit, CI |
| `pnpm api:check` | Rule 6 | pre-commit, CI |

Fill it in for every rule you have. A rule with an empty cell has two futures:
it becomes a check, or it moves into the judgement section that says out loud
that it is enforced by review. There is no third option, and the exercise of
filling in the table is where you find out which of your conventions were never
actually rules.

List the deliberate non-gates in the same table, with the reason, so nobody
promotes one back into the commit path without understanding why it was demoted.

## State ownership by name and by directory

```markdown
- **Priya** owns product decisions, copy, and the design system.
  Directories: `src/components/`, `src/app/globals.css`.
- **Sam** owns data architecture, migrations, and anything touching money.
  Directories: `src/lib/db/`, `drizzle/`.
- **AI assistants** help everywhere inside the rules below.
```

An assistant that knows a decision is not its to make will ask instead of
guessing. So will a person who joined last week. This is three lines and it
prevents a specific, expensive failure: someone quietly re-deciding a settled
thing — a spacing scale, a tone of voice, an empty-state pattern — in a pull
request that looks routine.

Pair it with the do-not-touch list:

```markdown
**Never change without asking:** auth and session handling, payment code,
migrations that touch existing rows, anything under `src/lib/security/`.
```

Mark those files with `// @ai-policy: read-only` at the top. An in-file marker
travels with the code when it gets moved or renamed; a path list in a document
does not.

The list should be roughly: authentication and authorisation, cryptography,
payment handling, anything touching personal data, migrations that modify
existing rows, and anything with a compliance auditor attached.

## The "when you change something" checklist

Keyed by the kind of change, not by the file. In practice this is the section
assistants follow most reliably, because it converts a vague instruction into a
list.

```markdown
- **New shared component** -> it lives with the design system, uses tokens only,
  and the PR names the existing sibling it copies its structure from.
- **New user-facing string** -> the key lands in every file in `messages/` in
  the same commit.
- **New API route** -> Zod input schema, auth check, rate limit, and a fixture
  for the response shape.
- **New env var** -> `src/env.ts`, `.env.example`, and the hosting platform.
- **New DB column** -> migration, schema, seed factory, and a header comment on
  the migration answering: is it reversible, does it lock, what is the backfill,
  how do we roll back.
- **New feature flag** -> the registry, with an owner and a removal date.
```

Add to this list whenever you find yourself explaining the same propagation
twice.

## Handling the unknown

One paragraph, and it is the most valuable one in the file:

```markdown
If you do not know something, say so and stop. Do not fill the gap with a
plausible default. A convention that enters the codebase as a guess is
indistinguishable from a decision six weeks later.
```

The default behaviour of both juniors and language models is to fill a gap with
a reasonable-looking convention: an 8px that should have been a token, an English
string where a key belongs. That is usually fine and occasionally very expensive,
and you cannot tell which from the diff. Making it an explicit policy
violation changes the behaviour, because it gives people permission to stop.

Pair it with somewhere for the question to go: `docs/OPEN-QUESTIONS.md`, or
issues with a label. A question with nowhere to go becomes a guess.

## Framework-written sections

Newer framework versions have started writing into `AGENTS.md` themselves:

```markdown
<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know
This version has breaking changes. Read the relevant guide in
node_modules/next/dist/docs/ before writing any code.
This block is written and re-added by `next dev`. Removing it from a diff only
re-creates the uncommitted change; committing it with your work keeps the tree
clean.
<!-- END:nextjs-agent-rules -->
```

Two things follow. Keep your own content clearly below the vendor block rather
than interleaved with it, so a regeneration cannot eat it. And copy that last
sentence's approach for any tool that regenerates a tracked file: say what
regenerates it and what happens if you fight it, or someone spends an afternoon
on an endlessly dirty worktree.

## By tier

**Tier 1.** Ten lines. Stack, three conventions, what not to touch. Skip
ownership, the table, and the judgement section.

**Tier 2.** Add the enforcement table, the change checklist, and the unknown
paragraph. This is where most projects should land.

**Tier 3.** Add ownership by name, the repo layout with its enforced boundaries,
and the source policy from [chapter 6](06-contract.md#source-policy).

**Tier 4.** Add the research protocol from [chapter 9](09-onboarding.md#research)
and keep the judgement section actively maintained, since at this size it is
where most of the value is.
