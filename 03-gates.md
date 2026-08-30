# Gates

How to run checks so people, and the assistants working beside them, do not
route around them.

The stakes for a design engineer are concrete. A hardcoded hex ships and the
token system becomes a suggestion. `pl-4` lands in an RTL product and sits on
the wrong side of the screen. An AI assistant that breaks a convention breaks
it at scale, in confident, well-formed code. Gates are how a design system
survives volume.

The template is `scripts/git-hooks/pre-commit`, which is tested and works as
written. This chapter explains the decisions inside it, and the two questions
that decide whether a check belongs there at all.

## Why the hook and not just CI

CI tells you about a problem after you have moved on to something else, and often
after a reviewer has already spent attention on the pull request. The same check
in a pre-commit hook tells you while the code is still in your head.

More importantly, a committed hook is tool-independent:

```json
"prepare": "git config core.hooksPath scripts/git-hooks"
```

The hooks live in `scripts/git-hooks/` and are committed. `pnpm install` wires
them. Every assistant and every person gets the same checks, because the
enforcement lives in git rather than in one tool's configuration. Say this at the
top of `AGENTS.md`, and symlink `CLAUDE.md` to it, so whichever filename a tool
reads, it finds the same rules.

Keep CI too. The hook can be bypassed and should be. CI is the backstop.

## Dispatch on the staged files

The single decision that makes a hook survivable. Do not run everything on every
commit:

```bash
staged="$(git diff --cached --name-only --diff-filter=ACMR)"

run_gate "i18n" '^(messages/|src/)' \
  'node scripts/check-locale-keys.mjs --check' \
  'Add the key to every locale file, then re-stage.'
```

A commit that only touches the README runs nothing. A commit that touches one
component runs the type check and the design lint, not the API audit. This
keeps the median commit to a couple of seconds, and commit speed is the whole
game. A hook that takes forty seconds gets bypassed, and a bypassed hook
enforces nothing.

Three details in that snippet that are easy to miss:

**`--diff-filter=ACMR`** covers added, copied, modified and renamed, and excludes
deletions. Without it, a commit that only removes files trips checks that then
try to read files that are gone.

**Stop at the first failure.** `run_gate` returns early when `status` is already
1. One actionable message beats a wall of output, and the second failure is
usually caused by the first.

**The fix hint is a required argument.** This is a design choice, not decoration.
"Validation failed" is a gate people route around. "Add the key to every locale
file, then re-stage" is a gate people thank you for. Making the hint mandatory in
the function signature is how you guarantee every check has one, rather than
hoping each author writes a good message.

## Document the bypass

`git commit --no-verify` is written in the header of the hook file. Put it there.

People discover the bypass eventually. If they discover it during an incident,
at 11pm, while frustrated, it becomes the thing they reach for by default
afterwards. If they find it in a comment that also explains when it is
appropriate, it stays an emergency tool.

## Gate or nag

This is the question that decides whether your enforcement system is trusted or
worked around. Ask it about every check:

> Can everyone who might trip this check clear it, right now, offline, with what
> is in a fresh clone?

If yes, it can be a gate. If no, it must be a nag.

A gate someone cannot satisfy teaches them `--no-verify`, and that habit does not
stay confined to the one check that deserved it. It spreads to the checks that
matter, which is how a whole enforcement system quietly stops working.

Checks that usually fail this test:

- anything needing an API token (pushing links to a ticket tracker, syncing
  flags to a feature flag service)
- anything needing the network
- anything needing a tool that is not in `package.json`, like a Python library
  or a design tool export
- anything needing deploy access, like checking that env vars are set on the
  hosting platform

Those go in `scripts/session-status.sh` and print when someone opens the repo.
That is a good moment for them: it is when a person has just arrived and can act.

Say which checks are deliberate non-gates, in the same table as the gates, with
the reason. Otherwise the next person promotes one to a gate and reintroduces the
problem.

## A nag nobody acts on is not a control

The corollary, learned the hard way on one of the projects this playbook came
from. A check was correctly demoted to a nag because clearing it needed
credentials. Then for thirteen days the underlying data drifted through sixteen
commits and nobody cleared it once, because the nag asked for work that was
nobody's specific job. Fifty-two tickets ended up in a state where they looked
finished and were not, and nothing anywhere looked broken.

The fix was not to promote the nag back to a gate. It was to give the nag an
actor: a scheduled CI job that does the work, but only when the offline check
reports drift.

```yaml
# .github/workflows/sync.yml
on:
  schedule: [{ cron: '0 3 * * *' }]     # nightly, not on merge
  workflow_dispatch:

jobs:
  sync:
    steps:
      - run: node scripts/check-external-sync.mjs || echo "drift=true" >> $GITHUB_ENV
      - if: env.drift == 'true'
        run: node scripts/push-external-sync.mjs --apply
```

Three things in that shape are worth copying.

**Cron, not merge trigger.** If the thing you are pushing points at a deployed
artifact, firing on merge publishes a link before the deploy that makes it valid
has finished. Anything that caches URLs, and most things do, will cache the
wrong version. A night's delay removes the race entirely, and a day of lag on a
sync job costs nothing.

**Check first, act second.** The apply step usually writes everything rather than
just the delta, so running it unconditionally does a lot of work for nothing. The
offline check is free.

**Write the loop-safety note in the workflow header.** Which paths it commits,
what triggers on those paths, and whether the commit is `[skip ci]`. The next
person editing the file will otherwise create an infinite loop, and will do it
while trying to be helpful.

## Landing a check on a codebase that fails it {#graduating}

The standard reason a good check never gets installed: you write it, run it,
find 340 violations, and give up.

The answer is to land it as a warning with a stated condition for becoming an
error, and to track the debt visibly:

```markdown
## Checks not yet at error level

| Check | Violations | Becomes an error when |
|---|---|---|
| `no-raw-fetch` | 41 (2026-08-30) | all reads move to `src/lib/api/` |
| `aria-label-i18n` | 12 (2026-08-30) | the settings screens are translated |

## Graduated, kept so the history is readable

- `no-hex-colour` became an error on 2026-07-14. The 88-violation backlog was
  cleared over three weeks alongside the token migration.
```

Keeping the graduated section matters. It shows the table is something that
empties, not a list of things you have given up on.

Two rules for exemptions:

**Allowlist the specific thing, never the whole rule.** One named component, one
named file. Not a directory, not a rule switched off.

**Every exemption carries a reason, in the file.** An allowlist entry with no
explanation is permanent within a month, because nobody can tell whether it was
a considered decision or a shortcut.

```js
const ALLOWLIST = {
  InvoiceRow: 'bound to the billing fixtures and the invoice status enum, not a ' +
              'tenant-neutral primitive. Shared by the list and the detail drawer ' +
              'on purpose so the two never drift.',
}
```

## Prove the check actually fires

A check that matches nothing looks exactly like a check with nothing to
complain about. Both print green. For design rules this is the worst failure
mode there is, because it reads as token coverage that does not exist while
hardcoded values quietly accumulate.

Two real examples from the projects this playbook came from, both of which
survived for weeks:

```js
// Matched NOTHING, for a month. esquery regex tests do not apply to numeric
// attribute values, so this is silently always false on a number.
"Property[key.name='padding'] > Literal[value=/^(4|8|12|16)$/]"

// Correct: match on `raw`, the literal's source text.
"Property[key.name='padding'] > Literal[raw=/^(4|8|12|16)$/]"
```

```js
// Caught `fontSize: 12` and sailed straight past `fontSize: compact ? 9 : 11`,
// which is the form that actually appears in real code.
"Property[key.name='fontSize'] > Literal[raw=/^[0-9.]+$/]"

// Correct: a descendant selector, so any numeric literal anywhere inside the
// value is caught however it is wrapped.
"Property[key.name='fontSize'] Literal[raw=/^[0-9.]+$/]"
```

Neither was found by reading the config. Both were found by writing a violation
and checking that the linter noticed.

So: **every check ships with a fixture it must fail on and one it must pass.**
For lint rules, that is `scripts/probes/rules.probe.tsx` and
`scripts/check-probes.mjs`, both in this playbook and both working. The probe
file is annotated:

```tsx
const rtlFail1 = <div className="pl-4 flex" />       // FAIL physical-padding
const rtlOk1   = <div className="ps-4 flex" />       // OK
const rtlOk6   = <div className="place-items-center" />  // OK  (contains "pl", must not fire)
```

and the runner asserts every FAIL produced an error and every OK produced none.
Reintroducing either bug above makes it fail with a specific message:

```
  RULE DID NOT FIRE   scripts/probes/rules.probe.tsx:63
    const tokFail6 = { padding: 16 }                    // FAIL on-scale-spacing
    This line is meant to be a violation and the linter said nothing.
    The selector probably matches nothing. Check for the numeric-literal
    trap: esquery regex tests do not apply to numeric values, so match
    on 'raw' rather than 'value'.
```

The OK lines matter as much as the FAIL lines. A rule that fires on correct code
gets disabled, and then it protects nothing. `place-items-center` contains the
letters `pl`, and a careless selector flags it.

Run the probes in CI, and in pre-commit whenever the lint config changes.

## Scope a rule instead of switching it off

When a rule is right in general and wrong in one place, the instinct is
`/* eslint-disable */`. Do not. Split the rules into named groups and re-declare
the subset that applies:

```js
export const rtlRules = [ /* correctness: logical properties */ ]
export const tokenRules = [ /* taste: no hex, no arbitrary sizes */ ]
export const copyRules = [ /* i18n: no hardcoded user-visible strings */ ]

export const designRules = [...tokenRules, ...rtlRules]
```

```js
// eslint.config.mjs
{
  files: ['**/*.{ts,tsx}'],
  rules: { 'no-restricted-syntax': ['error', ...designRules, ...copyRules] },
},
{
  // A component catalogue renders specimens. Localising "you@company.com" is
  // meaningless. Note this re-declares the rule WITHOUT the copy group rather
  // than switching it off: a hardcoded hex in the catalogue still fails.
  files: ['**/*.stories.tsx'],
  rules: { 'no-restricted-syntax': ['error', ...designRules] },
}
```

Three moves worth internalising.

**Separate correctness from taste, and never let an exemption drop the
correctness half.** RTL mirroring is correctness: `pl-4` is wrong in Arabic
regardless of context. Token discipline is taste: a hex renders fine, it is just
unmaintainable. A sandbox may relax taste. Nothing relaxes correctness.

**Move the authoring point down rather than removing the rule.** If an
experimental area needs its own colours, let it have a local `tokens.ts` that is
the only file there allowed to write a hex, and keep the rule everywhere else.
The invention is allowed; the habit survives.

**Put escape hatches in the filesystem path, not in a config flag.**

```js
{
  // experiments/<name>.freeform/ drops the token rules entirely. A path rather
  // than a flag, because the opt-out is then visible in every import and every
  // diff, and turning it on is a deliberate `git mv` rather than a comment
  // somebody adds quietly. RTL rules still apply: freeform buys design freedom,
  // not a screen that cannot be read in Arabic.
  files: ['**/*.freeform/**/*.tsx'],
  rules: { 'no-restricted-syntax': ['error', ...rtlRules] },
}
```

An inline `eslint-disable` is invisible three weeks later. A directory name is
not.

## The order to run checks in

Cheapest first, so a broken commit fails fast:

1. `tsc --noEmit`, which catches the most and costs the least
2. `eslint` on staged files only
3. the single-purpose scripts, in whatever order
4. nudges that never set failure status

The nudge section at the bottom of the hook template is worth keeping. It prints
things worth knowing that the person committing cannot necessarily act on right
now, like contract coverage moving, or a reminder that a staged migration should
have a rollback note in its header. Nudges never set `status`.
