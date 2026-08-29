# The Reusable Engineering Playbook (survey)

> **This is the background piece, not the implementation guide.** Start with
> [README.md](README.md) and [01-start-here.md](01-start-here.md) if you want to
> install any of this. Come here for the reasoning: this document surveys five
> real projects and records, for each mechanism, the specific failure that
> produced it. It is the evidence behind the chapters, and it is what to read
> when you need to argue for a rule rather than just apply it.
>
> Written first, in the Synacor repo. The numbered chapters were distilled from
> it afterwards, so the two overlap. Where they differ, the chapters are newer.


**Extracted from the Synacor Zimbra mobile repo, with additions from four sibling projects.
Written to be ported.**

What follows is not "how we build React Native apps". It is the set of *mechanisms* this repo
uses to stay production-quality with a mixed-experience team and heavy AI assistance, stripped
of Zimbra, of mail, and mostly of React Native. Every section names the practice, the principle
behind it, the concrete implementation, and **how it ports to a web SaaS stack** (Next.js /
React / TypeScript / Tailwind / ShadCN, Postgres, Vercel).

Read Part 0 first. Everything else is downstream of it.

**Where each part comes from.** The enforcement machinery (Parts 0 to 3, 5 to 8) is Synacor's.
The spec layer in Part 4 is Synacor's, upgraded with the provenance and fail-closed governance
from the **Enatel telematics** model, which is a second-generation rebuild of the same idea and
is ahead of Synacor on that axis. Part 9, the eval harness, is entirely from **Cortex Panel**,
the only one of these projects that ships a model in the product. The dataviz governance and
several of the shadcn-specific rules in Part 10 are from **Fleet**, which is the best existing
web-stack expression of these conventions. The SVG handoff preflight in Part 10.9 is from
**dbiz-landing**. The contract-coverage measure, the clause-level provenance and the codegen
set in Parts 4.14 to 4.16 and 5.5 to 5.7 are from **VBS**, a four-app cluster built around a
shared intent model, which is the only one of these projects that has taken the model all the
way to generated code and a model-editing product.

---

## Contents

- [Part 0 — The three ideas everything else is downstream of](#part-0--the-three-ideas-everything-else-is-downstream-of)
- [Part 1 — The constitution file](#part-1--the-constitution-file)
- [Part 2 — The gate system](#part-2--the-gate-system)
- [Part 3 — Rules no gate can catch](#part-3--rules-no-gate-can-catch)
- [Part 4 — The spec layer: intent as typed JSON](#part-4--the-spec-layer-intent-as-typed-json)
- [Part 5 — Freshness: event, propagate, gate](#part-5--freshness-event-propagate-gate)
- [Part 6 — The agent harness](#part-6--the-agent-harness)
- [Part 7 — Institutional memory](#part-7--institutional-memory)
- [Part 8 — Onboarding and developer experience](#part-8--onboarding-and-developer-experience)
- [Part 9 — Evals: gating what a model produces](#part-9--evals-gating-what-a-model-produces)
- [Part 10 — The web SaaS port, concretely](#part-10--the-web-saas-port-concretely)
- [Part 11 — Adoption path](#part-11--adoption-path)
- [Appendix A — Copy-paste starters](#appendix-a--copy-paste-starters)
- [Appendix B — Anti-patterns this repo learned the hard way](#appendix-b--anti-patterns-this-repo-learned-the-hard-way)

---

## Part 0 — The three ideas everything else is downstream of

### 0.1 Every rule has a gate, or it is not a rule

A convention that lives only in a style guide decays at exactly the rate people join the team.
The repo's operating principle is that a written rule must be paired with a command that fails
when it is broken, and the pairing must be *visible*. The constitution carries a literal table:

| Command | Enforces |
|---|---|
| `pnpm lint` | Hard rules 1 to 5 and 8, as ESLint errors |
| `pnpm i18n:check` | Every literal `t()` key resolves; en/ar parity; plural sets complete |
| `pnpm ds:check` | No reusable primitive stranded in a screen; no component defined in 2+ files |
| `pnpm intent:check` | Spec-model integrity |
| `tsc --noEmit` per package | Types |

Writing the table is the forcing function. A rule with an empty right-hand cell is either
promoted to a gate, or explicitly demoted to "enforced by review" and moved into the section
that says so (Part 3). There is no third category.

### 0.2 Gates run in git hooks, not only in CI

CI catches things after the author has moved on and after a reviewer has spent attention. This
repo wires its hooks into the repository itself:

```bash
# package.json
"prepare": "git config core.hooksPath scripts/git-hooks || true"
```

The hooks live at `scripts/git-hooks/` and are **committed**. This matters more than it looks:
it makes the gates *agent-agnostic*. Claude Code, Cursor, Codex, Gemini CLI and a human all run
the same checks, because the enforcement is in git, not in any one tool's configuration. The
repo says so out loud at the top of its constitution:

> Any agent (Codex, Gemini, opencode, Cursor, etc.): this file is the single source of truth.
> `AGENTS.md` is a symlink to it, so whichever name your tool reads, you get the same rules.
> The repo's mandatory automation lives in **git hooks**, so it runs on every `git commit`
> regardless of which agent you are.

`ln -s CLAUDE.md AGENTS.md` is a thirty-second change that removes an entire class of
"the other tool didn't know" failure.

### 0.3 A rule carries the incident that produced it

Almost every rule in this repo is annotated with the specific failure that caused it. Not
"prefer logical properties" but:

```js
// A directional glyph rendered through plain <Icon> does not mirror in RTL, it just
// points the wrong way in Arabic. <DirectionalIcon> exists for this; App.tsx shipped
// a non-mirroring back arrow until the 2026-07-27 audit.
```

Three things follow from this, and they are the reason it is worth the extra sentence:

1. **A rule with a story attached does not get deleted by the next person** who finds it
   annoying, because the diff that removes it also removes the evidence.
2. **It tells you the rule's real boundary.** If you know the rule exists because of screen
   readers, you know it applies to `accessibilityLabel` and not to a catalog specimen string.
3. **It converts tribal knowledge into an asset that survives turnover**, which is the entire
   problem enterprise codebases have.

Apply this to comments in lint configs, to allowlist entries, to CI workflow headers, and to
decision-log entries. It is the single highest-leverage habit in the whole playbook.

---

## Part 1 — The constitution file

### 1.1 What it is

One file at the repo root, `CLAUDE.md`, symlinked to `AGENTS.md`, read in full by every agent
and skimmed once by every human. It is not a README. It has a fixed shape:

```
1. Project identity        who this is for, what the topology is, who owns what
2. Hard rules, code        numbered, each enforceable, each with its why
3. Hard rules, AI hygiene  context discipline, generation headers, PR checklist
4. What enforces what      the rule → command table, plus the deliberate non-gates
5. Folder conventions      the tree, plus the import/tier boundaries
6. Stack reference         versions and the reason for each mandatory choice
7. Process protocols       research-first, "when you change something", session protocol
```

### 1.2 The rules are numbered and short

```markdown
1. **No raw JSX strings.** Every user-visible string goes through `t('key')`.
   Accessibility copy counts: `accessibilityLabel`, `accessibilityHint` and
   `placeholder` are user-visible (a screen reader reads them aloud) and are the
   ones that get forgotten, because they never show up in a screenshot review.
2. **No physical directional spacing.** Never `paddingLeft/Right`. Use logical
   equivalents. RTL must mirror automatically.
3. **No hex in component/feature code.** Hex is authored only in the theme package.
```

Numbered, because the ESLint message, the PR checklist and the review comment all cite the
number. "Hard rule 3" is a shorter conversation than a paragraph.

### 1.3 Ownership is stated, by name and by directory

```markdown
- **Rahul** — intent, mutation contracts, design tokens, UX rules.
  Owns `packages/theme`, `packages/ui`, `packages/intent`.
- **Frontend Lead** — code architecture, schemas, hooks, sync, state machines,
  final merge authority. Owns the shipping app's repo.
- **AI (you)** — assists everywhere inside the guardrails below.
```

An agent that knows a decision is not its to make asks instead of guessing. So does a junior.
Write the ownership split into the constitution, not into an onboarding conversation.

### 1.4 The "when you change something" section

A short list keyed by *the kind of change*, not by file. It is the part agents follow most
reliably, because it turns a vague "keep things consistent" into an explicit propagation list:

```markdown
- **New UI string** → the key lands in BOTH locale files in the same change.
- **New component** → add to the shared UI package, presentation-only. Never
  hand-roll a reusable primitive inside an app screen.
- **New entity** → update the spec model, regenerate the schema, add ≥1 fixture.
- **New mutation** → declare with optimistic + rollback + conflict behavior,
  then implement.
- **Ingesting new info** → follow the freshness protocol (Part 5).
```

**Web SaaS port.** Identical, with the list retargeted:

```markdown
- **New API route** → add the Zod input + output schema, add a fixture, add
  the OpenAPI entry, add the rate-limit policy.
- **New DB column** → migration + Zod schema + seed factory + the backfill note
  in the migration's header comment.
- **New feature flag** → declare in the flag registry with owner + removal date.
- **New env var** → add to `env.ts` (Zod-validated), `.env.example`, and the
  deploy checklist, in the same PR.
```

---

## Part 2 — The gate system

This is the transferable core. Six mechanisms.

### 2.1 A path-dispatched pre-commit hook

The hook does not run everything on every commit. It reads the staged file list and runs only
the gates whose inputs changed. That keeps the median commit fast, which is what keeps people
from reaching for `--no-verify`.

```bash
#!/bin/bash
set -u
repo_root="$(git rev-parse --show-toplevel)"; cd "$repo_root" || exit 1

staged="$(git diff --cached --name-only --diff-filter=ACMR)"
[ -z "$staged" ] && exit 0
status=0

# Each gate: (a) a path pattern that says "your inputs changed",
#            (b) the command, (c) an error message naming the FIX, not the fault.

i18n_touched="$(printf '%s\n' "$staged" | grep -E '^packages/locales/|^src/' || true)"
if [ -n "$i18n_touched" ] && [ "$status" -eq 0 ]; then
  if ! python3 scripts/check_locale_keys.py --check; then
    echo "✗ i18n gate failed. Add the key to BOTH en and ar common.json," >&2
    echo "  then re-stage. --no-verify to skip." >&2
    status=1
  fi
fi

[ "$status" -eq 0 ] && echo "gate passed ✓"
exit "$status"
```

Four details that make this version better than the usual one:

- **`--diff-filter=ACMR`** so a commit that only deletes files does not trip file-reading gates.
- **`&& [ "$status" -eq 0 ]`** on later gates: stop after the first failure so the author gets
  one actionable message instead of a wall.
- **The bypass is documented in the hook's own header**, not hidden. `git commit --no-verify`
  is a legitimate emergency tool; pretending otherwise just means people discover it in a panic
  and then keep using it.
- **The error message names the fix.** "Run `reconcile_oq_index.py --write`, then re-stage" is
  a gate people thank you for. "Validation failed" is a gate people route around.

### 2.2 The gate versus nag distinction

> A gate you cannot satisfy is one people learn to skip.

Two of this repo's checks deliberately do **not** block a commit:

- `links:check` compares design links pushed to Jira against the local map. Fixing drift needs
  a Jira write, which a credential-less clone cannot do.
- `gantt:check` compares a spec file to a PM spreadsheet. It needs `openpyxl`, which a fresh
  clone does not have.

Both are real drift detectors. Neither can be satisfied by everyone who commits. So they run
from the **SessionStart hook** as a nag instead, and the constitution explains why in the same
table where the blocking gates live.

The test to apply: **can every person and every agent who might trip this gate actually clear
it, right now, offline, with what is in the clone?** If no, it is a nag. Make it loud, put it
where work starts, but do not put it in the commit path.

### 2.3 Give the nag a leg

The repo then learned the corollary the hard way, and wrote that down too:

> A nag nobody can act on is not a control, and this one proved it: between the day the check
> was built and thirteen days later the map moved in sixteen commits and Jira received none of
> them, leaving 52 stories with zero links and most of a milestone reading as undesigned.

The fix was not to promote the nag to a gate. It was to give it an **actor**: a nightly CI job
that runs the push, but only when `--check` reports drift. Three design notes from that
workflow's header, all portable:

- **Cron, not merge trigger.** The pushed link points at a deployed page that only exists after
  the deploy finishes. Firing on merge would publish a link that resolves to a generic shell,
  which a Smart Card would then cache forever. A night's lag removes the race.
- **Check first, act second.** `--apply` writes every pair, not the delta, so running it
  unconditionally would re-POST 380 links a night for nothing. The offline `--check` is free.
- **Loop safety stated explicitly.** The job commits exactly one path, nothing triggers on that
  path, the commit is `[skip ci]`. Write this in the header so the next person editing the
  workflow does not accidentally create an infinite loop.

**Web SaaS analogues**: syncing feature-flag definitions to LaunchDarkly, pushing OpenAPI to a
docs portal, syncing Stripe product catalog from code, publishing Storybook links onto tickets,
reconciling env-var manifests against Vercel project settings.

### 2.4 Graduating warnings

New checks land as **warnings** when they would fire on pre-existing debt, so the gate is never
red on a clean tree. They graduate to errors when the backlog clears. The debt is tracked in a
table with an explicit graduation condition, not left implicit:

| Warning | Count today | Graduates when |
|---|---|---|
| `oq_triple.triage_cites_resolved` | 7 rows (2026-07-31) | each row's ref is cleared |
| `story_stub` | 7 stories (2026-08-01) | stubs given an id or closed |

And a retired section, kept so the history is readable:

> `oq_triple.index_missing` — **now an ERROR** (2026-07-31). The 18-item backlog is cleared and
> the writer regenerates the index on demand, so an entry absent from the index is a real fault.

This solves the standard adoption problem: you want a new rule, but turning it on red-flags 400
existing files, so you never turn it on. Warning-with-a-graduation-date is how you turn it on
today and still get to error eventually.

**Allowlist discipline.** A separate `allowlist.json` downgrades a *specific* would-be error to
an acknowledged warning. The rule is: **add the precise key, never a blanket silence**, and
every entry carries a reason. Same for the ESLint-level allowlist in the design-system gate:

```python
ALLOWLIST = {
    "MockKeyboard",   # web-catalog keyboard harness
    "FolderPill",     # mail-domain composition bound to fixtures, not a
                      # tenant-neutral primitive; stays with the mail screens.
}
```

### 2.5 Verify a new rule actually fires

> A rule that never fires is worse than no rule, because it looks like coverage.

The repo's constitution mandates a probe:

> **Verify a new ESLint selector actually fires.** Write a probe file that contains both a
> violation and the legitimate form, and lint it. esquery regex tests do NOT apply to *numeric*
> attribute values, so `Literal[value=/^[0-9]+$/]` silently matches nothing and reads as a
> passing rule; match on `raw` instead.

That is a real, subtle, silently-passing bug class. The general practice: **every new static
check ships with a fixture that it must fail on, and a fixture it must pass.** Two files, five
minutes, and the check is now trustworthy. For gates written in Python or TypeScript, that
means a tiny unit test; for ESLint, `RuleTester` or a `.probe.ts` file.

The repo even carves an ESLint exception for this pattern, and explains why the exception is
narrow:

```js
{
  // `*.probe.ts` is a RUNNABLE SCRIPT, not shipped code. Printing is the entire
  // deliverable, so `no-console` here is a rule asking the file not to do its job.
  //
  // Narrow on purpose. Scoped to the SUFFIX rather than a folder, so a probe cannot
  // be smuggled in beside a component by accident, and it relaxes ONLY no-console.
  files: ['**/*.probe.ts'],
  rules: { 'no-console': 'off' },
}
```

### 2.6 Scope a rule to what it can be right about

The most reusable idea in the ESLint config. When a rule is right in general but wrong in one
place, the instinct is to disable it there. This repo instead **splits the rule set into named
halves and re-declares the subset**:

```js
const RTL_RULES            = [ /* correctness: logical properties, mirrored icons */ ]
const TOKEN_AUTHORING_RULES = [ /* taste: no hex, no raw sizes, no off-scale spacing */ ]
const COPY_RULES            = [ /* i18n: no hardcoded a11y labels or placeholders */ ]

const DESIGN_TOKEN_RULES = [...TOKEN_AUTHORING_RULES, ...RTL_RULES]

overrides: [
  { files: ['*.ts','*.tsx'],
    rules: { 'no-restricted-syntax': ['error', ...DESIGN_TOKEN_RULES, ...COPY_RULES] } },

  { // The component catalog renders specimens. Localizing "you@company.com" is
    // meaningless. Token rules STILL fully apply: this re-declares the rule WITHOUT
    // the copy half rather than switching no-restricted-syntax off, so a hex in the
    // catalog still fails.
    files: ['**/screens/KitGallery.tsx'],
    rules: { 'no-restricted-syntax': ['error', ...DESIGN_TOKEN_RULES] } },
]
```

And the escape hatch for genuinely experimental code is **encoded in the path**, not a config
flag or an inline comment:

```js
{ // explorations/<milestone>/<id>.freeform/ — when the answer is "break everything",
  // the token rules go wholesale. PATH rather than a flag, because the config stays
  // static, the opt-out is visible in every import and every diff, and turning it on
  // is a deliberate `git mv` rather than a comment somebody adds quietly.
  //
  // RTL_RULES still stand. Freeform buys design freedom, not a screen that cannot be
  // read in Arabic.
  files: ['**/*.freeform/**/*.tsx'],
  rules: { 'no-restricted-syntax': ['error', ...RTL_RULES] } }
```

Three transferable moves here:

1. **Separate correctness rules from taste rules** and never let an exemption drop the
   correctness half. RTL mirroring is correctness. Token discipline is taste. A sandbox may
   relax taste; nothing relaxes correctness.
2. **Move the authoring point down rather than removing the rule.** An exploration may invent a
   color, but it must still declare it in its own local `tokens.ts` and consume it by name. The
   invention is allowed; the habit survives.
3. **Encode opt-outs in filesystem paths.** Visible in every import, every diff, every file
   tree. An inline `// eslint-disable` is invisible three weeks later.

### 2.7 The one-way import boundary

The sandbox is only safe because nothing outside it can import in. Enforced twice, deliberately:

```js
{ files: ['*.ts', '*.tsx'],
  excludedFiles: ['**/src/explorations/**'],
  rules: { 'no-restricted-imports': ['error', { patterns: [{
    group: ['**/explorations/*/*', '**/explorations/*/*/**'],
    message: 'Nothing outside src/explorations/ may import from inside it. An exploration may break the design system precisely because none of it can leak; promote what is approved, rewritten to obey the hard rules.'
  }]}]}}
```

> This is the readable half. It matches the SPECIFIER text, so it catches the shapes people
> actually write and misses the ones they could contrive; the Python gate resolves paths
> properly and is what the pre-commit hook trusts.

**Two layers on purpose**: the lint rule for fast feedback in the editor, and a resolving
script for the commit gate. The same doubling protects the tier boundary (the framework-agnostic
core must not import `react-native`).

**Web SaaS port, and this is where it earns the most.** The boundaries worth enforcing:

```
server-only  →  nothing in lib/server/** may be imported from a "use client" file
client-only  →  nothing in lib/client/** may be imported into a server component
domain core  →  packages/core must not import next, react, or the ORM client
feature silo →  features/billing may not import from features/messaging (only from core)
```

Enforce with `eslint-plugin-boundaries` or `import/no-restricted-paths`, plus `server-only` /
`client-only` npm packages for the React halves, plus a resolving script in pre-commit for the
cases the specifier match cannot see.

---

## Part 3 — Rules no gate can catch

The repo is unusually honest about this, and the honesty is the practice. Two whole sections of
the constitution open by admitting no gate covers them.

### 3.1 Name the blind spot explicitly

> **No gate catches this one.** Every hard rule above is about what a *value* may be, so a
> screen can use only tokens, only `t()` keys and only logical spacing and still be assembled
> wrong. Every piece of a bad assembly is legal on its own. `lint`, `ds:check` and `i18n:check`
> all pass on it. The shell is enforced by review, which is why it is written down here: a batch
> of screens built in one sitting without reading a sibling will invent its own shell and no
> gate will object.

That paragraph does more work than any rule under it. It tells a reviewer where to actually
spend attention, and it tells an agent that this section is not optional decoration.

### 3.2 The cheapest possible enforcement: "open the nearest sibling"

> **Before writing a screen, open the nearest sibling that already does the thing.** Copy its
> shell, not its content.

This is the highest value-per-word instruction in the entire repo. It costs nothing, it works
for humans and agents equally, and it prevents the specific failure of a batch of files built
in one sitting that are internally consistent and inconsistent with everything before them.

**Web SaaS port**: "Before writing a route handler, open the nearest sibling route." "Before
adding a form, open the nearest sibling form." "Before adding a background job, open the nearest
sibling job." Put it in the constitution verbatim.

### 3.3 Write the composition rules as a decision procedure, not a list

The best example in the repo is the "which surface does a message use" section. It is a decision
tree with a stopping rule:

> Four surfaces exist. Ask these in order and **stop at the first yes**.
>
> 1. **Is there nothing to show?** Full-screen empty state with a single retry.
> 2. **Is one specific value wrong, missing, or refused?** Inline, at that value. Only the field
>    knows where the user has to go.
> 3. **Is it still true while the user is looking at it?** A persistent band at the top. It
>    persists because the condition does.
> 4. **Is it over?** A toast. It leaves because the thing it reports has already finished.

Then four tie-breakers, **each labeled as existing because it was got wrong once**:

> - **If the condition outlives four seconds, it cannot be a toast.** A message you dismiss by
>   waiting must never be the only record of something still wrong.
> - **A toast carries no recovery action.** An action on a timer is a race, and a user who loses
>   it has lost the only route out. `Undo` is the exception and the only one: it reverses
>   something that completed, so letting the timer run out is itself a valid answer.
> - **An action goes where there is one to offer, and exactly once.** If the screen already
>   carries the control that would retry, the band states the reason and nothing else.
> - **The same claim takes the same surface on every screen.** Deciding it per ticket is how one
>   app ends up with two languages for the same sentence.

And the closing move, which is what turns the prose into engineering:

> The classifier is where this becomes code for the flows that have one: it returns **a surface
> and a locale key, never a resolved string**, so no screen re-decides. A new flow with more than
> two error states should grow a function there rather than a switch inside the screen.

```ts
// errorToSurface.ts — returns the DECISION, not the rendering.
export type Surface = 'empty' | 'inline' | 'band' | 'toast'

export const errorToSurface = (e: AppError): { surface: Surface; key: string; field?: string } => {
  if (e.kind === 'load_failed')   return { surface: 'empty',  key: 'errors.loadFailed' }
  if (e.kind === 'validation')    return { surface: 'inline', key: `errors.${e.code}`, field: e.field }
  if (e.kind === 'offline')       return { surface: 'band',   key: 'offline.band' }
  return { surface: 'toast', key: `errors.${e.code}` }
}
```

**Why "never a resolved string" matters**: it keeps the classifier testable without i18n loaded,
keeps translation in one place, and makes it impossible for a caller to sneak a hardcoded
message past the copy gate.

**Web SaaS port.** This is directly transplantable and most web apps need it badly. The four
surfaces become: full-page error boundary / empty state, inline field error, persistent page
banner, toast. The tie-breakers survive word for word. Build `errorToSurface` in `lib/errors/`
and make every mutation's `onError` route through it.

### 3.4 Composite copy: one sentence in two halves

A small pattern with an outsized payoff. Being offline is the same fact on every screen, so the
opener is a constant owned by the component and each screen passes only its own half:

> It had to become structural because as long as the component took the whole sentence, the same
> fact arrived four ways: "You're offline.", "You are offline.", "Offline.", and on one screen no
> mention of being offline at all.

Three constraints on the half a screen writes, each earned:

- **One word for the shared concept**, chosen and stated. ("saved", not saved/synced/cached/
  on-device across nine screens.)
- **Say what they have, not what they are missing.** "Showing saved messages", not "Can't reach
  the server."
- **A character budget, with the reason.** "Under ~40 characters; the band renders on one line,
  so opener plus detail has about 54 before it truncates. Two strings were over that."

And the distinction that makes it correct rather than merely consistent:

> Offline and stale are NOT the same condition and do not share the opener. Offline is a fact
> about the device, identical everywhere and known for certain. Stale is a fact about the data
> and can be true at full signal. Put "You're offline" on a stale band and the first user who
> sees it with four bars stops reading bands.

**Web SaaS port**: identical treatment for permission errors ("You don't have access." + what
they'd need), rate limits, trial/quota states, and degraded-integration banners.

---

## Part 4 — The spec layer: intent as typed JSON

This is the most ambitious practice here and the one to adopt last. It is also the one that
makes AI-assisted development actually scale.

### 4.1 The thesis

> Don't prompt AI to write code from prose descriptions. Give it a **typed JSON specification**
> and let agents generate code from the contract. IDD is to SDD what a typed schema is to
> markdown: same purpose, more precision, less ambiguity.

### 4.2 The model's shape

One file per **bounded context** (`intent-mail.json`, `intent-billing.json`), plus a shared file
and a cross-cutting interaction-patterns file. Top-level keys:

```
meta            version, bounded_context, references[], constitution_path, signoff
adrs[]          architectural decisions scoped to this context
actors[]        who does things
entities[]      the domain objects
journeys[]      multi-screen flows
screens[]       each with empty_state / loading_state / error_state
navigation      how screens connect
business_rules[]  each with EARS notation
constraints, capabilities, interaction_patterns
open_questions[]  unresolved decisions, with status as the source of truth
exclusions[], risk_allocation, technical_requirements
```

An entity:

```json
{
  "name": "MailThread",
  "user_value": "...",
  "phase": "core",
  "ai_policy": "read-only",
  "key_fields": [...],
  "lifecycle_states": ["unread", "read", "archived", "deleted"],
  "state_machine": {...},
  "mutations": [...],
  "offline": { "cache": "...", "sync": "...", "storage": "..." }
}
```

### 4.3 The mutation contract, which is the actual innovation

Most spec formats stop at "the user can archive a thread". This one does not:

```json
{
  "id": "archive_thread",
  "user_value": "my inbox holds only what I still need to deal with",
  "trigger": "swipe_left",
  "ears": "WHEN the user swipes left on a MailThread row THE SYSTEM SHALL optimistically remove it from the active list AND queue the archive mutation against the server.",
  "optimistic_behavior": { "action": "remove_from_active_list", "feedback": "trigger_light_haptic_and_show_toast" },
  "rollback_behavior":   { "action": "restore_to_original_index", "feedback": "show_error_toast_with_retry" },
  "conflict_resolution": "optimistic_concurrency (MODIFY_CONFLICT; see BR-SHARED-016)",
  "offline_queueable": true,
  "guard": "thread.folder.type != 'archive'",
  "test_contract": {
    "type": "integration",
    "properties": [
      "ui_updates_within_16ms_of_swipe_completion",
      "rollback_on_server_error_restores_thread_to_original_index",
      "queued archive replays in enqueuedAt order when reconnecting"
    ],
    "edge_cases": [
      "bulk archive where the server accepts only some ids → accepted ones leave the list, refused ones stay and stay selected"
    ]
  }
}
```

**The five fields that carry the weight**: `optimistic_behavior`, `rollback_behavior`,
`conflict_resolution`, `offline_queueable`, `test_contract`. These are exactly the questions a
developer improvises at 4pm on a Friday, and exactly the ones that produce the bugs nobody can
reproduce. Requiring them in the spec means they get decided once, by the person who should
decide them, and the gate refuses a mutation that lacks them.

**Web SaaS port.** Every field survives. Optimistic update and rollback are TanStack Query
`onMutate` / `onError` verbatim. `conflict_resolution` becomes your ETag / `updated_at`
precondition policy. `offline_queueable` becomes "is this safe to retry" and drives idempotency
key requirements. `guard` becomes the authorization predicate. `test_contract.properties`
becomes the integration test's assertion list, generated.

### 4.4 EARS notation for business rules

EARS (Easy Approach to Requirements Syntax, from Rolls-Royce) gives you five templates. The one
that matters most:

```
WHEN <trigger> THE SYSTEM SHALL <response>
IF <condition> THEN THE SYSTEM SHALL <response>
WHILE <state> THE SYSTEM SHALL <response>
WHERE <feature is included> THE SYSTEM SHALL <response>
THE SYSTEM SHALL <response>                        (ubiquitous)
```

The value is not ceremony. It is that an EARS sentence is **mechanically convertible into a
test**, and a requirement that cannot be written in EARS is a requirement that is not yet
decided. Writing it forces the ambiguity to surface at spec time instead of at review time.

### 4.5 The verification script

A spec model is worthless if it can rot. `intent-verify.sh` is ~140 lines of `jq` and checks
presence, not semantics:

```bash
# Every mutation has conflict_resolution
MISSING=$(jq '[.entities[].mutations[]? | select(.conflict_resolution == null or .conflict_resolution == "")] | length' "$FILE")
if [ "$MISSING" -gt 0 ]; then
  echo "  FAIL: $MISSING mutations missing conflict_resolution"
  jq -r '[.entities[] | .name as $e | .mutations[]? | select(.conflict_resolution == null) | "\($e).\(.id)"] | .[]' "$FILE" | sed 's/^/    - /'
  ERRORS=$((ERRORS+1))
fi
```

Checks it runs: valid JSON, required meta fields, every entity has lifecycle states, every
mutation has conflict resolution (error) plus EARS and a test contract (warning), every screen
declares empty/loading/error, phase set everywhere, cross-file entity refs resolve, open
question counts.

**Errors versus warnings is a deliberate axis**: structural integrity is an error, completeness
is a warning. You can commit an incomplete model; you cannot commit a broken one.

Above it sits `intent_lint`, a Python package with one module per check class:

```
check_schema  check_refs  check_ids  check_enums  check_statemachine
check_ears    check_coverage  check_triage_refs  check_oq_triple
check_graph   check_hygiene   check_fixtures  check_journeys  check_drift
```

Each returns `Finding` objects with a severity, and `run.py --errors-only` is what the
pre-commit hook calls. **One module per check class** is the structural choice worth copying:
adding a check is adding a file, and the allowlist keys are naturally namespaced
(`oq_triple.status_mismatch`).

### 4.6 Context discipline: one bounded context per session

> **Never** request a monolithic `intent-full.json` — it doesn't exist and shouldn't.

Bounded contexts are how a 1,000-requirement model fits in a context window. One domain file
plus the shared file plus the interaction patterns is a session's working set. This is a real
architectural constraint driven by LLM context limits, and it happens to be good DDD anyway.

### 4.7 Generation headers and the manifest

Every generated file carries:

```ts
// @generated-from: intent-mail.json#MailThread.mutations.archive_thread
// @regenerable: true
// @last-regenerated: 2026-08-30
```

`@regenerable: true` for schemas, types, test scaffolds. `false` for state machines, edge-case
hooks, ACL mappers: generated once, then owned manually. The distinction is what prevents a
regeneration pass from silently destroying hand-tuned logic.

The planned extension is a **generation manifest** storing a content hash per generated file, so
a hash mismatch means a human edited generated code and the drift is detectable rather than
discovered.

### 4.8 The read-only tag

```markdown
5. **AI may not touch** files tagged `// @ai-policy: read-only` — auth/token handling, sync
   orchestration, conflict resolution, keychain/secure storage, push handlers, encryption.
```

An in-file marker, not a directory, so it moves with the code. **Every AI-assisted repo should
have this list**, and it should be roughly: authn/authz, cryptography, payment handling, PII
paths, migrations that touch existing rows, and anything with a compliance auditor attached.

### 4.9 Source policy: make provenance a field, not a convention

Part 8.3 gives a *source hierarchy* as prose a human follows. The Enatel model goes further and
makes it a machine-readable policy block at the top of the model, which is strictly better,
because a hierarchy in prose is applied by whoever is reading and a policy in the model is
applied by the validator.

```json
"source_policy": {
  "requirement_authority": "source.enatel_rfp",
  "authority_reason": "The RFP is the issuing organisation's requirement document. The vendor proposal is a response and cannot approve or replace a requirement.",
  "context_source": "source.dbiz_proposal",
  "context_rule": "Proposal content can explain delivery intent, assumptions, risks, candidate architecture, and potential vendor commitments. It remains proposed unless an authorised contract acceptance identifies the accepted line item. It cannot override the RFP.",
  "conflict_rule": "Do not resolve conflicting source statements silently. Preserve the statements and add an item to the open-questions module.",
  "unknown_rule": "Represent an unknown value as an open question or missing contract. Block affected production implementation; do not replace it with an implementation assumption or conventional default.",
  "verbatim_rule": "The intent model uses controlled paraphrases. Use the source PDF when contractual wording is required.",
  "sources": {
    "source.enatel_prs_mvp": {
      "kind": "customer_requirement_specification",
      "path": "docs/01 CRS _ PRS/PRS-MVP.pdf",
      "authority": "requirement_authority_candidate",
      "release_status": "not_confirmed_as_formally_released"
    }
  }
}
```

Five rules, and each one closes a specific failure:

- **`authority_reason`, not just `requirement_authority`.** Naming which document wins is cheap.
  Writing down *why* is what stops the next person relitigating it.
- **`context_rule`** gives non-authoritative sources a real job. They may explain and propose;
  they may not approve. Without this, a vendor proposal or a competitor's behavior quietly
  becomes a requirement by being the most detailed thing in the room.
- **`conflict_rule`: do not resolve conflicts silently.** Same idea as Synacor's "a conflict
  between sources is a finding to record", but enforceable, because the resolution is a
  *recorded open question* rather than a judgment made in someone's head.
- **`unknown_rule` is the fail-closed clause and the most valuable line in the block.**
  "Represent an unknown as an open question or missing contract. **Block** affected production
  implementation; do not replace it with an implementation assumption or conventional default."
  The default failure mode of both juniors and LLMs is to fill a gap with a plausible
  convention. This sentence makes that a policy violation rather than a style preference.
- **`verbatim_rule`** admits the model is a paraphrase and says where to go when exact wording
  is contractual. Models that pretend to be the source get quoted in disputes.

And per-source fields carry their own status. `authority: "requirement_authority_candidate"` and
`release_status: "not_confirmed_as_formally_released"` are the honest encoding of "this looks
like the spec but nobody has confirmed it is signed", which is the actual state of most
enterprise requirements documents most of the time.

The companion rule, from the same repo's agent instructions:

> These are read-only sources that establish what the platform does today, not what has been
> agreed. **Never promote an observed implementation to an approved decision.**

**Web SaaS port.** This is directly usable and most teams need it. Your sources are: the signed
SOW or contract, the PRD, the existing production behavior, the competitor baseline, the
customer's email, the ticket. Decide which one can *approve* a requirement, write the reason
down, and make everything else `proposed` until something authoritative accepts it.

### 4.10 Split the model: pillars state intent, the annex proves claims

The Enatel model splits into two layers, and the split is the point:

```
intent-model/
  core/     actors  entities  journeys  rules  constraints  questions
            → read these to UNDERSTAND the product
  annex/    obligations  evidence  sources  readiness
            → read these to CHECK a claim
```

`core/` is what the product is. `annex/` is the paper trail: source requirement rows and
generated acceptance criteria, as-built evidence, content hashes and dispositions, and the
readiness gate. A reader who wants to build opens `core/`. An auditor, or anyone asking "says
who?", opens `annex/`.

The validator gates the split itself, which is the move worth copying:

```js
// A core pillar states intent. The moment a hash, a coverage snapshot or a
// generated case lands in one, the split has rotted and the annex is no longer
// the single place a claim is proved.
```

**A gate on the architecture of the model, not just on its contents.** Most schema validators
check that fields are present and well-typed. This one checks that the *separation of concerns*
has not eroded, which is the thing that actually degrades over two years.

Synacor's single-file-per-domain model mixes both layers, and it works, but at Enatel's level of
traceability the split is what keeps a domain file readable.

### 4.11 Fail-closed readiness, per capability

The annex carries a `readiness` module whose entire job is to answer "may anything be built
yet?" with a default of no:

```json
{ "module_type": "readiness",
  "title": "Fail-Closed Build Readiness",
  "role": "Whether anything may be built yet, per capability, and what must be true first.",
  "content": { "assessment": {
    "assessed_on": "2026-08-23",
    "build_ready": false,
    "status": "blocked_by_unresolved_scope_authority_and_semantic_contracts",
    "statement": "..." } } }
```

Two things make this more than a status field.

**It is per capability, not per project.** "Build ready" as one boolean is useless, because some
of the app is always ready and some never is. Per capability, it becomes a work-allocation tool:
build the green ones, chase the decisions blocking the red ones.

**The statement records why readiness did not improve**, and one sentence from a real assessment
is worth quoting in full, because it is what a working spec model looks like:

> Previously the model lacked detail. Now it has detail and has surfaced substantive conflicts:
> which requirement document governs scope, whether the frontend is Angular or Next.js, whether
> the energy counter the whole product depends on is cumulative or per-interval, how device
> charger states map to displayed status.

That is the model doing its job. A spec effort that never lowers your confidence is a spec effort
that is only writing down what everyone already assumed. **Surfacing a conflict is a
deliverable**, and readiness is where it gets reported instead of being read as a delay.

### 4.12 Trace the prototype to the questions it stands on

The sharpest small idea in the Enatel model, and one Synacor does not have:

> `prototype_trace` maps every widget in the prototype to the capability it serves **and the
> open questions it stands on**. A widget carrying an open critical question is a question to
> raise rather than a feature to demo. Extend it in the same change as a new route, or the
> route is invisible to that check.

Demos are where speculative UI gets silently promoted to agreed scope. Someone shows a screen,
a client nods, and a chart that was a guess about an ambiguous data contract becomes a
commitment nobody remembers making. This makes the guess visible **at demo time**, to the person
presenting, in the artifact itself.

Two implementation details carry it:

- **"Extend it in the same change as a new route, or the route is invisible to that check."**
  The gate's blind spot is stated out loud, so the reader knows the check is only as good as its
  registration discipline. Compare Synacor's honesty about `stories_linked` in Part 5.4.
- **An explicit `null` is a recorded finding, not an omission**, and the validator enforces the
  difference:

```js
// An explicit null is a recorded finding: a prototype widget can serve no
// capability the model has. Omitting the key would look like an oversight, so
// null is permitted here and PROTOTYPE_UNTRACED_NOTE makes it explain itself.
```

**Distinguish "absent" from "deliberately none".** This is a tiny schema decision with a large
payoff, and it applies everywhere: a nullable field with a required accompanying note is how you
tell "nobody has filled this in" apart from "we looked, and the answer is nothing". Every
allowlist, every exemption, every N/A in a compliance matrix wants this shape.

### 4.13 Hash your evidence, or a decision can close against nothing

Same repo, found by its own validator:

> A resolution's evidence is a source citation. Before 0.8.0 this key was not in the registry, so
> `question.location_entity_role` closed as confirmed **against a transcript that was never
> registered or hashed**.

An open question was marked resolved, citing evidence that the model could not verify existed.
Every gate was green. The fix is two rules:

1. **Every citation must resolve to a registered source**, and the registry holds a content hash.
2. **A regeneration tool goes green by reconciling itself with the model, never by regenerating
   over recorded content.** From the agent instructions: `generate-acceptance.py --check` "must
   stay green, and it goes green by reconciling the tool with the model, never by regenerating
   over recorded content." A generator that can overwrite human-authored decisions to make its
   own check pass is not a gate, it is a laundering machine.

Both rules generalize immediately: to ADRs citing benchmarks, to compliance controls citing
evidence, to any "resolved because X" where X is a file, a link, or a meeting.

### 4.14 Generate the code, not just the spec

Part 4.7 describes generation headers and a manifest as things Synacor plans. The VBS intent
model actually ships the generator set, and it is worth seeing how small it is:

```json
"generate:schemas":   "tsx scripts/generate-zod-schemas.ts",   // Zod from the model's TS types
"generate:api-stubs": "tsx scripts/generate-api-stubs.ts",     // route handlers from journeys
"generate:migration": "tsx scripts/generate-migration.ts",     // DB migration from entities
"generate:ai-types":  "tsx scripts/generate-ai-types.ts",      // see 4.15
"export:contract":    "tsx scripts/export-contract.ts",        // push the contract downstream
"validate:model":     "tsx scripts/validate-model-sync.ts",    // see 4.16
"intent:snapshot":    "bash scripts/snapshot.sh"               // versioned model snapshot
```

Two structural choices behind it are worth copying whether or not you generate anything.

**The model is TypeScript, not JSON.** `src/domain/intent-model/model.ts` is a typed literal
conforming to `types.ts`. Synacor's JSON model needs a bespoke schema validator to catch a
misspelled field; a TS model gets that from `tsc` for free, gets editor autocomplete while
authoring, and gets refactoring tools. The trade is that non-engineers cannot edit it directly,
which is exactly why VBS built an editor over it (Part 10.10). **Choose JSON when the model must
be edited by tools and humans outside the repo; choose TypeScript when the model is primarily
consumed by code.**

**The contract is exported into the consuming repo.** `export-contract.ts` reads the model and
writes a contract file into the sibling frontend, failing loudly if the sibling is not there:

```ts
const ok = exportContract(intentModel)
if (!ok) { console.error('Frontend directory not found at ../vbs-frontend — skipping export'); process.exit(1) }
```

This is a third option alongside Synacor's two (workspace dependency for the in-repo app,
published versioned package for the external app): a **generated contract file committed into
the consumer**, versioned with the model. It suits a client project where the consuming repo is
someone else's and npm publishing is overhead nobody wants.

### 4.15 Generate the AI's prompt from the types it describes

The sharpest single script in the VBS repo, and an idea I have not seen elsewhere:

> `generate-ai-types.ts` parses `types.ts`, converts the TypeScript types to a simplified string
> format a model can understand, inlines nested types for readability, adds ID-pattern hints from
> the project config, and emits `ai-type-definitions.ts`, which `ai-prompt.ts` imports to give
> the API accurate type context.
>
> **Run it whenever you modify `types.ts`.** Single source of truth for types, no manual
> synchronization, always-accurate AI prompts.

Any product whose prompt describes a schema has this drift problem: someone adds a field to the
type and the system prompt keeps describing the old shape, so the model keeps emitting the old
shape, and the failure looks like a model quality problem rather than a stale string. **If a
prompt contains a schema, generate that part of the prompt from the schema.**

The validator then treats prompt drift as a first-class defect class:

```ts
type: 'schema-mismatch' | 'ai-prompt-mismatch' | 'orphaned-reference'
    | 'missing-type' | 'constraint-type-mismatch'
```

`ai-prompt-mismatch` sits next to `schema-mismatch` as a peer, not a footnote. That is the right
weight: for an AI feature, the prompt *is* part of the type layer.

### 4.16 One validator across every representation of the same fact

`validate-model-sync.ts` checks that the model, the types, the generated Zod schemas, and the AI
prompt all still agree. Its five checks are a good default set for any generated stack:

1. **Validate the model against its Zod schema** (the model conforms to its own contract).
2. **Constraint types in sync** across `types.ts`, `model-schemas.ts` and the model data.
3. **AI prompt type definitions in sync** with the types (4.15).
4. **Entity references resolve.**
5. **No orphaned references** (a journey naming a `primary_actor` that no longer exists).

Every issue carries a `severity`, a `type`, a `message` and, importantly, a **`fix`** string that
the runner prints as `→ Fix: …`. Part 2.1 asks error messages to name the remedy; making `fix` a
required field on the finding type is how you guarantee it, rather than hoping each check author
writes a good message.

---

## Part 5 — Freshness: event, propagate, gate

### 5.1 The frame

> The goal is to make drift **fail at the moment it's introduced**, so the full integrity audit
> becomes a rare backstop instead of a routine chore.

The protocol enumerates the events at which new information enters the system, and for each one
says what to propagate and which gate enforces it:

```markdown
### Event: an open question gets answered

An OQ lives in THREE places that must move together.

- **Propagate, all three:**
  1. spec file `open_questions[]` — set `status` (this field is the source of truth for
     open/resolved, NOT the resolution prose), `resolution`, `resolved_by`, `resolved_date`.
  2. triage rows — clear the ref on any row that cited it.
  3. the console index — run `reconcile_oq_index.py --write`.
- **Gate:** pre-commit runs `--check` and fails if the index is behind the spec files.
- **Then:** re-seed with `pnpm oq:seed` (NOT the global seed; see below).
```

**The generalization**: for every piece of information that exists in more than one place, write
down (a) which copy is canonical, (b) the propagation command, (c) the gate that detects
divergence, (d) whether a re-seed or cache-bust follows.

### 5.2 One principle, stated once, at the top

> **Disk is the source of truth. The database is seeded *from* disk. Every gate reads disk.
> So: change disk → run the gate → re-seed the DB. Never hand-edit the DB.**

Four sentences that dissolve an entire class of "which one is right" arguments. Every project
with a content database, a config table, or a seeded catalog needs this sentence written down.

### 5.3 Non-lossy versus destructive seeds

The sharpest operational detail in the repo:

> OQ rows have **two owners**: model-owned fields (status, resolution, question) come from disk;
> DB-owned fields (recommendations, answers) live only in the DB, written by an AI solver. So
> `oq:seed` pushes the model truth from disk while preserving the DB-owned fields. **Never run
> the global `db:seed` for OQ changes: it overwrites the row wholesale and destroys those.**

And a `db:check` that refuses a seed which would lose DB-authored payload, plus a `db:export`
to pull DB-only data to disk first.

**Web SaaS port, and this is a genuine production-incident class.** Any table with mixed
ownership (config from code + user overrides; product catalog from code + analytics; templates
from repo + tenant customizations) needs exactly this: a field-level ownership map, a non-lossy
upsert path, and a pre-seed check that fails rather than clobbers.

### 5.4 The two-state verification pattern

The single most transferable idea in Part 5, and it generalizes far beyond Jira.

> `RTM: App-13` in a description proves the story **cites** a requirement. It does not prove the
> story **delivers** it, and the id is copied out of the map when the ticket is written, so the
> "linked" count can never go red from drift. That is how 26 of 47 rows came to sit on links
> every gate called perfect.

So the link carries a second, harder state:

```
asserted      someone pasted an id. The default. Says nothing about delivery.
verified      a human read the story against its requirement and agreed.
contradicted  a human read them and found they ask for different things.
```

> Coverage then reports "371 asserted, 67 verified" instead of one number that sounds like 371
> verified.

Three mechanisms make it work:

- **Verdicts store the SHA of the text they were formed against.** A description change retires
  the verdict. So does a comment landing after the verdict date.
- **Age alone does not retire a verdict.** "A story nobody touched is not less verified for
  having sat still, and expiring on a timer would fill the queue with re-reads that change
  nothing."
- **A short, ranked queue.** Stale verdicts first, then unverified items actually in play
  (status past To Do, or carrying a sprint), then future work. 269 of 304 unverified items were
  future work, so the actionable queue was ~21 and cleared in three sessions.

**The general form: distinguish "a machine can see the link exists" from "a human confirmed the
link is true", and never report the first number as if it were the second.** Web SaaS
applications: test-coverage percentage versus assertions that would actually catch a regression;
"has a runbook" versus "the runbook was executed in the last quarter"; "SOC2 control documented"
versus "control tested"; "endpoint has a schema" versus "the schema matches what the client
sends"; dependency "not vulnerable" versus "we read the advisory and it doesn't apply".

### 5.5 Measure drift in the other direction: how much of the contract did the build lift?

Part 5.4 asks whether a claimed link is *true*. This asks the opposite question, and it is the
one that tells you where the project actually is: **of everything the model specifies, how much
has the implementation actually built?**

VBS answers it with `pnpm drift:check`, a script that parses the app's real TypeScript with the
compiler API, maps each model entity to the app types that implement it, and reports coverage:

```ts
const entityTypeMap: Record<string, EntityMapping> = {
  hbl:            { types: ['Hbl', 'AcfsHblDetail'], stateType: 'HblStatus' },
  booking:        { types: ['Booking', 'AcfsBooking'], stateType: 'AcfsBookingStatus' },
  delivery_order: { types: ['DoQueueItem', 'DeliveryOrder'], stateType: 'DoValidationStatus' },
}
```

The output is a scorecard at **three layers**, which is what makes it actionable rather than a
single depressing number:

| Entity | Type | Mock | Screen | Status |
|---|---|---|---|---|
| Driver Record | 100% | 100% | 100% | green |
| Booking | 73% | ~85% | ~75% | mostly green |
| HBL | 38% | 50% | **30%** | red |
| Site | 0% | 50% | 50% | red |

Type / Mock / Screen separates three different failures. A field in the type but not the mock is
unexercised. In the mock but not on screen is unsurfaced. Missing from the type is unbuilt. The
headline from that audit reads:

> Portal renders the happy-path operational loop with reasonable fidelity, but lifts only **~42%
> of the type-level contract.** The biggest gap is HBL secondary data: consignee, container,
> ocean BL, quantity and pack type all exist as optional and are never populated or rendered.

Alongside it, a per-journey status (`5 of 16 fully built, 10 partial, 1 unbuilt`) with the
specific gap named per journey, each citing the business rule it fails:

> `lsp-modifies-booking` ◐ — only driver/truck editable, no slot/HBL changes, no cutoff
> enforcement (BR-015)
> `lsp-cancels-booking` ○ — entirely unbuilt, LSP detail panel has no cancel button

Four things make this worth copying rather than admiring:

- **It runs against the real types via the compiler API**, not against a hand-maintained
  checklist. A checklist of what you have built is a document that lies within a week.
- **`fieldAliases` records the naming impedance instead of hiding it.** The model is snake_case
  and domain-shaped; the app is camelCase and UI-shaped. Rather than forcing one to rename or
  quietly reporting false gaps, the script carries an explicit map (`hbl_number → ref`,
  `customs_clearance_status → customs_cleared`, `fee_amount → total`). **A mapping table is an
  honest artifact; a silent mismatch is a bug and a forced rename is a fight.**
- **It names its own blind spot**, in the report: "3 contract entities have no portal mapping in
  `scripts/drift-check.ts`: `payment`, `user`, `booking_hbl_link`." Same discipline as Synacor
  admitting `stories_linked` can never go red.
- **Each consuming app runs its own copy.** Three apps consume the contract and each has
  `scripts/drift-check.ts` scoring itself. Coverage is a property of a consumer, not of the
  model, so a shared score would be meaningless.

**Web SaaS port.** This is the metric to build when someone asks "are we halfway?" and nobody can
answer. Map spec entities to Prisma models and API response types, score at type / fixture / UI,
and publish the per-journey table. It converts "we're mostly done" into "we lift 42% of the
contract and here are the eleven named gaps", which is a different conversation with a client.

### 5.6 Generate the implementation checklist from the rules

The same repo emits a versioned checklist straight from the model:

```markdown
# Intent Model Business Rules Checklist
Version: 0.10.1 | Generated: 2026-06-04

| Status | ID | Description | Applies To | Source |
|---|---|---|---|---|
| [ ] | BR-001 | Booking requires all included HBLs to have milestone "unpacked" or later AND … | hbl, booking | BRD s4.2 + discussion, 2026-03-17 |
```

Three columns beyond the rule text, each doing work. **`Applies To`** lists the entities, so a
developer touching one entity can filter to the rules that bind it. **`Source`** is provenance
(5.8). **`Status`** is a checkbox, which turns the model into a work list without a second
tracker. Generated and version-stamped, so it is disposable and always current rather than a
document someone has to maintain.

### 5.7 Provenance at the clause, not just at the decision

Synacor keeps `DECISIONS.md` as a separate log (Part 7.1). VBS puts the provenance **on the rule
itself**, and it is better, because a rule is what someone reads while implementing and a
separate log is what they read never:

> **BR-010** — HBL data is auto-synced from Maximus on login. In addition, ACFS users have a
> manual sync trigger, needed because ACFS cannot control when Maximus updates. *(VBS Screen
> Review 2026-05-21, Welliam: "we're gonna need a manual option as well to sync it")*
> **Source:** March 18 flow diagram + VBS Screen Review 2026-05-21.

Three habits inside that, all cheap:

- **Verbatim quotes with speaker and date, inline.** Same principle as Part 7.1, applied where
  the reader already is.
- **Inferences flagged at the clause that is inferred**, not at the rule: "(Under-bond customs
  substitution is an inference pending confirmation — OQ-045.)" A rule is rarely wholly derived
  or wholly agreed. Marking the *specific sentence* that is a guess, and pointing it at the open
  question that would settle it, is a level of precision worth the extra parenthesis.
- **Consolidation history in the rule**: "Consolidates former BR-002, BR-003, BR-021, BR-031."
  and "Absorbs former C-001 (capacity constraint)." When rules merge, the old ids stay traceable,
  so a ticket or an email citing BR-021 still resolves. **Never let an id die silently** — a
  merged rule that drops its ancestors' ids breaks every external reference to them.

### 5.8 When to still run the full audit

> The gates cover the recurring, mechanical drift. Run the full adversarial audit only at
> genuine inflection points: a major requirements-version reconciliation, before codegen
> kickoff, or if a gate was bypassed and you need to know what slipped through.

Naming the inflection points is what stops the audit from becoming either a quarterly ritual
nobody reads or a thing that never happens again.

---

## Part 6 — The agent harness

### 6.1 The SessionStart hook

Wired in `.claude/settings.json`, prints in under a second, entirely offline on the hot path:

```json
{ "hooks": { "SessionStart": [ { "hooks": [
  { "type": "command", "command": "bash scripts/session-status.sh",
    "statusMessage": "Checking repo status..." } ] } ] } }
```

What it prints:

```
git:  in sync with origin/main
oq:   68 open questions in the intent model  (type /oq for the breakdown)
rtm:  link verification overdue by 12d — 72 in play with no verdict
run:  pnpm web       showcase preview -> http://localhost:5310
      pnpm console   intent console   -> http://localhost:3000
      full runbook + gotchas: docs/RUNBOOK.md    new here? docs/ONBOARDING.md
resume: docs/PROGRESS.md -> Session state (where to pick up)
```

Design notes worth stealing:

- **Local refs only for the sync check**, then `git fetch` backgrounded so the *next* session is
  accurate. Never block the prompt on the network.
- **Nags live here.** This is where the checks that cannot be gates get their audience.
- **It doubles as the human's cheat sheet.** Same script, `bash scripts/session-status.sh`.
- **Silent unless due.** The link-verification line prints nothing when nothing is overdue.

### 6.2 PROGRESS.md and the hard size cap

The cold-resume document, with the resumable block between machine-readable markers:

```markdown
<!-- SESSION-STATE:START -->
## ▶ Session state — cold-resume pointer

**State.** What changed / where things stand.
**Relevant outputs.** Files, commands, commit hashes.
**Open questions.** Awaiting a decision.
**Next step.** The exact next action.
<!-- SESSION-STATE:END -->
```

And then the lesson, which is the part most teams will need:

> **Hard cap: keep this block under ~3 KB, and no more than the three or four newest entries.**
> It reached 101 KB and 25 dated entries because entries were only ever appended. That is
> roughly 25k tokens of month-old narrative injected ahead of every session's actual work. The
> SessionStart hook prints everything between the markers verbatim into the context of every
> session, so **the length of this block is a tax paid on every turn of every session, before
> anyone types anything.**

Cold entries move to an archive section below the markers. **If you build a session-state
mechanism, build the cap and the archive on day one.** It is the difference between a resume
pointer and a slowly-growing prefix tax.

### 6.3 Opt-in updates, not every-turn ritual

> **Refresh that block only when it earns its keep.** Update it when you are asked to, or when a
> turn leaves genuinely uncommitted resume-state: an open question awaiting a decision, a
> half-finished multi-step task, or a next step that isn't obvious from the git log.
>
> **Skip it** for mechanical or fully-committed turns. The commit already captures those, and
> rewriting the block on top is redundant token and time cost.
>
> There is intentionally **no** Stop-hook nudge. The block is opt-in by the rule above.

This is a correction the repo made after over-instrumenting. Worth internalizing: **agent
ceremony has a cost, and the cost is paid on every turn.** Instrument the cases that need it.

### 6.4 The context budget rule

> At ~70% context used with the domain unfinished: **STOP**. Incomplete-but-rigorous beats
> complete-but-sloppy. Update the resume pointer with exactly where you stopped, run the
> verification script and fix failures, commit `WIP: <domain> — through [last completed item]`,
> and tell the user to start a fresh session.

The underlying observation, from harness engineering: **agents rush when context runs low**, and
the last 20% of a long session is where the sloppy work happens. A hard stop at 70% with a clean
handoff beats a heroic finish.

### 6.5 Session protocol, both ends

**On start:** read the resume doc, load the file it names, load the pending work items for that
scope, run the verification script to confirm the last session was clean, continue from "Next
steps". Target: productive work within 3 minutes.

**Before ending:** update the resume doc, run verification and fix failures, update work-item
status, commit descriptively. **The repo must be clean.** No half-written JSON, no broken refs.

"Rebuild cost under 3 minutes" is a metric worth actually measuring.

### 6.6 A permissions allowlist for read-only and idempotent commands

```json
"permissions": { "allow": [
  "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)",
  "Bash(pnpm lint)", "Bash(pnpm intent:check)", "Bash(pnpm doctor)",
  "Bash(pnpm web)", "Bash(pnpm console)"
]}
```

Pre-approving the commands that cannot do damage removes dozens of prompts per session, which
is what keeps a human actually reading the prompts that remain. **Allowlist read-only and
idempotent; never allowlist anything that writes to a shared system.**

### 6.7 Slash commands as the team interface

`.claude/commands/` holds `oq.md`, `run.md`, `commit.md`, `whats-new.md`. The onboarding doc
frames them as the primary interface for non-terminal people:

> Type these in Claude, or just ask in plain English ("run the web preview", "what changed since
> I last pulled?").

For a mixed-experience team this is the highest-leverage accessibility work you can do. Ship
`/run`, `/commit`, `/whats-new` on day one.

### 6.8 The AI PR checklist

> Every PR with AI-authored code answers: which spec file(s) used as context; which AI tool and
> model; regenerated or hand-edited; for schemas, which fixtures validated against; for
> mutations, both optimistic and rollback behavior present; for UI, only design tokens.

Put it in the PR template. It takes 30 seconds and it makes the review load proportional to the
actual risk.

---

## Part 7 — Institutional memory

### 7.1 The decision log

`DECISIONS.md`, append-only, dated, one heading per decision:

```markdown
### YYYY-MM-DD | domain | one-line summary of the call

**Person, date:** "the verbatim quote that triggered this"

[What was decided, and why. The alternatives considered and why they lost.
Any dead-end that was tried first.]
```

Three habits that make it worth 9,000 lines:

- **Quote the human verbatim.** Six weeks later a paraphrase is indistinguishable from a
  reconstruction. A quote is evidence.
- **Record exceptions AS exceptions, with the reason they don't generalize.** The repo has a
  beautiful example: one sheet puts its commit button in the header while every other sheet puts
  it at the foot, and the entry explains exactly what distinguishes them ("length of the body is
  what decides it, a form you scroll commits at the foot, a form that fits commits in the
  corner") so the exception has a boundary rather than being a precedent for anything.
- **Record the dead ends.** The value of a decision log is mostly in the options that lost.

And the constitution's rule about the log's authority:

> A feature touching an open question surfaces it, never guesses past it. Settled decisions
> don't get re-opened.

### 7.2 The build log, fed by a post-commit hook

The repo maintains a living "how we built this" case study: an external-facing narrative on top,
a candid dated **Build log** appendix at the bottom. It stays current because a `post-commit`
hook feeds it:

```bash
# post-commit: append a one-line stub per meaningful commit.
# Non-blocking BY DESIGN: post-commit runs after the commit, so it can never fail it.

# Skip replayed commits (rebase / cherry-pick): they were stub-logged when first
# authored, and appending here dirties the worktree, which aborts the next pick.
if [ -d "$git_dir/rebase-merge" ] || [ -f "$git_dir/CHERRY_PICK_HEAD" ]; then exit 0; fi

# Skip merge commits: they carry no authored narrative.
# Skip commits that only touch the case study itself: avoid self-referential noise.

printf -- '- [ ] `%s` %s [%s] %s — %s file(s)\n' "$hash" "$date" "$surfaces" "$subject" "$n" >> "$queue"
```

The stub file is **a raw feed, not the case study**. An agent drains stubs into narrative:

> For each stub, add or extend a dated entry in the Build log of the matching doc. Capture the
> **why** and any dead-ends, not just the what. **Don't fabricate rationale**: if you don't know
> why, leave the stub unchecked for a human. The case study is design and process history, not a
> changelog. The git log already is the changelog.

That last line is the whole discipline in one sentence.

**"rapid" mode** is the detail that makes it survivable. During a burst of fast commits, a hook
that dirties the worktree every time is intolerable:

> `git config synacor.rapid true` and the hook stops appending to the tracked file. Stubs still
> get written, to `.git/rapid-skipped-stubs` (untracked, local to the checkout). **Rapid means
> "don't touch my worktree", not "lose the feed"**, and the hook prints a reminder on every
> commit while it's on.

Two general lessons: **an escape hatch that loses data will be used to lose data**, and **a
silent skip is how a feed dies without anyone noticing**, so the hook announces itself every
single time it is bypassed.

### 7.3 Why this beats a changelog

A changelog answers "what shipped". The build log answers "why is it like this", which is the
question that costs your team the most time and that no tool reconstructs. For an enterprise
SaaS with a multi-year life and staff turnover, it is the highest-return documentation you can
keep, and the post-commit feed is what makes keeping it realistic.

---

## Part 8 — Onboarding and developer experience

### 8.1 `pnpm doctor`

A preflight that reports what is installed, what is missing, and **the fix for each gap**. It
is informational only and never fails the shell:

```bash
ok()   { printf "  [ok]   %s\n" "$1"; }
warn() { printf "  [warn] %s\n" "$1"; }
bad()  { printf "  [MISS] %s\n" "$1"; }

echo "Core (needed for everything):"
command -v pnpm >/dev/null 2>&1 && ok "pnpm $(pnpm -v)" || bad "pnpm missing - run: npm i -g pnpm"

echo "Database (pnpm console -> :3000):"
if grep -q "DATABASE_URL" .env.local 2>/dev/null; then ok ".env.local has DATABASE_URL"
else warn ".env.local has no DATABASE_URL - the console will not boot (ask the team)"; fi

echo
echo "Tip: for design work you only need the Core section. Run 'pnpm web'."
```

Three design choices worth copying:

- **Sections by role**, so a designer knows which failures they may ignore. The Xcode and
  CocoaPods checks are explicitly labeled "only if you build iOS; designers can skip".
- **Every failure line contains its remedy.** Not "missing", but "missing - run: npm i -g pnpm".
- **It never exits non-zero.** A doctor that fails is a gate, and this is not a gate.

### 8.2 An onboarding doc written for the least technical person on the team

> Welcome. You can be productive here without being a terminal expert. Claude Code is the main
> interface; the terminal is the backup.
>
> **The 60-second start**: `pnpm install`, `pnpm doctor`, `pnpm web`.
>
> **You do not have to memorize commands.** Type these in Claude, or just ask in plain English.

Then, crucially, a **guardrails section framed as "so a rejected commit is not a mystery"**:

> The repo enforces a few rules automatically. If a commit gets blocked, **ask Claude to fix
> it**; these are quick:
> - No hardcoded hex colors in components (use theme tokens).
> - No raw text in the UI (every string goes through `t('key')`).
> - No physical left/right spacing (use start/end so right-to-left languages mirror).

If you build the gate system in Part 2, **you owe your team this paragraph.** A blocked commit
with no context is the fastest way to turn a good control into a resented one.

### 8.3 The research-first protocol and the source hierarchy

Before any new screen, flow, or module:

**1. Research pass.** Consult the spec model, the open questions and decision log, the tickets,
the existing product's behavior, the server and API reality, and the component inventory.

**2. Source hierarchy.** The sources answer different questions, and **a conflict between them
is a finding to record, never a silent pick**:

1. **Server and API reality** — what *can* happen. The hard floor. A feature the backend can't
   support gets its off/degraded/blocked state designed.
2. **The existing product** — what the product *does*. Match its capabilities and semantics by
   default; adapt the *form*. Dropping or changing the meaning of a capability is a deliberate,
   recorded decision, never a side effect.
3. **The spec model** — the ledger of what we've decided. Entries tracing to a recorded decision
   stand until re-decided; everything else defers to evidence.
4. **Tickets** — planned work and acceptance criteria. **Input, not authority.**

**3. Propose before building.** 2 to 3 options with a recommendation and trade-offs. For each:
which existing components it reuses and what gaps it opens (a gap is a proposal to add to the
shared package, never a one-off), token needs, server dependencies and their degraded states,
and concerns in plain language.

**4. Ask, then build.** Record the outcome as a decision-log one-liner.

Two lines from this deserve to be posted on a wall:

> **Tickets are input, not authority.** A ticket's error-handling table says *what* to say; it
> has no authority over *where* it goes, and its authors were not deciding a system.

> **A conflict between sources is a finding to record, never a silent pick.**

**Web SaaS port**: the hierarchy becomes API/DB reality > the existing product or competitor
baseline > your product spec > the Jira ticket. Same ordering, same rule about conflicts.

### 8.4 A runbook separate from the readme

`docs/RUNBOOK.md`: every way to run things, with the gotchas. Kept separate because a readme is
read once and a runbook is read at 11pm when something is broken. The SessionStart banner points
at it by name.

---

## Part 9 — Evals: gating what a model produces

Everything so far treats AI as something that helps you *build*. If a model is in your product
at runtime, you need a second kind of gate: one that fails when the model's *output* regresses.
Nothing in Parts 2 to 5 can do this, because there is no static property to check. The pattern
below is from Cortex Panel, an expert-answer product where faithful citation is the whole value
proposition.

### 9.1 Shape of the harness

```
scripts/eval/
  questions.json    the dataset: query + expert + category + rubric
  api-client.ts     runs each question against a base URL
  judge.ts          LLM-as-judge, scores each response on N dimensions
  report.ts         summary, per-segment breakdown, artifact write
  types.ts          the dimensions and, critically, the THRESHOLDS
eval-runner.ts      orchestrates; exits non-zero below threshold
```

`pnpm eval` runs it locally. A `workflow_dispatch` CI job runs it against a deployed URL or spins
a local server, and uploads results as an artifact with `if: always()` so a failing run is still
diagnosable.

### 9.2 The dataset needs negative controls

56 questions in three categories, and the split is the design:

| Category | Count | What it tests |
|---|---|---|
| `relevant` | 36 | Does it answer well when it should? |
| `irrelevant` | 10 | **Does it decline instead of fabricating?** |
| `cross-expert` | 10 | Does comparison across sources hold up? |

The `irrelevant` set is the one most teams skip and the one that catches the failure that
actually destroys trust. An eval suite made only of questions the system should answer measures
capability and says nothing about hallucination.

Each question carries its rubric inline, so the expectation travels with the case:

```json
{ "query": "What does Peter Attia think about zone 2 training?",
  "expertId": "attia",
  "category": "relevant",
  "rubrics": {
    "shouldAnswer": true,
    "expectedConfidence": "high",
    "topicHints": ["zone 2", "mitochondrial function", "lactate threshold"] } }
```

### 9.3 A separate judge prompt per category

The negative cases get their own system prompt scoring **two** dimensions instead of five:

> The system was asked a question outside the expert's domain. The expert should have gracefully
> declined rather than fabricating an answer.
>
> **factualGrounding** — Did the expert avoid fabricating content? Score 5 if it declined or
> clearly stated it doesn't cover this. Score 1 if it made up an answer.
> **confidenceCalibration** — Score 5 if confidence is "none". Score 3 if "tangential". Score 1
> if "high" or "moderate".

Scoring "voice fidelity" on an answer that should not exist is noise, and noise in an eval is
worse than a missing dimension because it moves the aggregate. **Score only what the category
can be right about**, which is Part 2.6 applied to evals.

### 9.4 Separate the dimensions that gate from the dimensions that inform

```ts
export const ALL_DIMENSIONS = [
  'factualGrounding', 'retrievalQuality', 'confidenceCalibration',
  'voiceFidelity', 'citationCorrectness',
]

export const PASS_FAIL_DIMENSIONS = [
  'factualGrounding', 'retrievalQuality', 'confidenceCalibration', 'citationCorrectness',
]   // note: voiceFidelity is measured and reported, but does not fail the build
```

This is the correctness-versus-taste split from Part 2.6, and it is what makes an eval suite
survivable. `voiceFidelity` is a real quality signal and it is also the one an LLM judge is
least reliable about and the one most likely to drift on a prompt tweak. Measuring it keeps it
visible; gating on it would make the suite flaky and the team would stop trusting red.

**The general rule: gate on the dimensions where a bad score is unambiguously a defect. Report
the rest.**

### 9.5 Two thresholds, both explicit

```ts
export const MIN_DIMENSION_SCORE  = 3     // a question fails if ANY gating dimension < 3
export const PASS_RATE_THRESHOLD  = 0.9   // the suite fails below 90% of questions passing
```

A per-question floor catches a catastrophic single answer that an average would hide. A suite
rate tolerates the noise inherent in LLM judging. You need both, and they should be named
constants in a types file rather than magic numbers in the runner, so changing your quality bar
is a reviewable one-line diff.

The runner is then trivially a gate:

```ts
process.exit(summary.summary.passRate >= PASS_RATE_THRESHOLD ? 0 : 1)
```

### 9.6 Score self-reported confidence as its own dimension

`confidenceCalibration` is the dimension most eval suites lack and the one with the highest
product value:

> Does the reported confidence match the actual answer quality? "high" confidence with a vague
> answer is poor calibration. "none" when the source genuinely doesn't cover the topic is good
> calibration.

If your product surfaces a confidence signal, a hedge, or a "not sure" state, that signal is a
product claim and it needs its own test. A confidently wrong answer and a hedged wrong answer are
different failures with different blast radii, and only a calibration dimension tells them apart.

### 9.7 Break the summary down by segment

```ts
byExpert: Record<string, { passed: number; total: number; passRate: number }>
```

An aggregate pass rate tells you something broke. A per-segment breakdown tells you *what*, which
is the difference between a red build you can act on and a red build you rerun. Segment by
whatever your equivalent of "expert" is: tenant, model version, prompt template, document
corpus, language.

### 9.8 Run it on dispatch, not on every push

The CI job is `workflow_dispatch` with an optional `base_url`, not a push trigger. Evals cost
real money per run and are slow, so the useful cadence is before a prompt or model change ships,
on a schedule, and on demand against a deployed environment. Same reasoning as the cron in
Part 2.3: the right trigger is the one that matches what the check is actually for.

**Adopt this the moment a model output reaches a user.** Twenty questions with five negative
controls, three dimensions, and a pass threshold is a weekend of work and it is the only thing
standing between you and a silent quality regression from a prompt tweak, a model version bump,
or a retrieval index rebuild.

---

## Part 10 — The web SaaS port, concretely

Everything above, retargeted to Next.js / React / TypeScript / Tailwind / ShadCN / Postgres.

### 10.1 The mapping table

| Synacor practice | Web SaaS equivalent |
|---|---|
| `CLAUDE.md` + `AGENTS.md` symlink | Identical. Do this first. |
| Hard rule: no hex in components | No arbitrary Tailwind values (`bg-[#fff]`); semantic tokens via Tweakcn/CSS vars. `eslint-plugin-tailwindcss` + `no-restricted-syntax` on `/\[#[0-9a-f]{3,8}\]/`. |
| Hard rule: no raw font sizes | Restrict raw `text-[13px]`; type scale only. |
| Hard rule: logical spacing (RTL) | `ps-`/`pe-`/`ms-`/`me-`/`start-`/`end-` instead of `pl-`/`pr-`/`left-`. Tailwind supports all of them; almost nobody uses them, and it is what makes RTL free later. |
| Hard rule: every string via `t()` | Identical. `next-intl` or `i18next`. Same gate. |
| Hard rule: no raw `fetch()` in feature code | No `fetch` outside `lib/api/`; all reads via TanStack Query hooks, all writes via typed server actions, Zod at every boundary. |
| `pnpm i18n:check` | Same script, retargeted at `messages/*.json`. ~150 lines of Python or a Node script. |
| `pnpm ds:check` (stray components) | Same heuristic against `components/` vs `app/**/_components/`. Flags a component defined under a route folder yet imported by 2+ routes, and any component name defined in 2+ files. |
| Tier boundary (core must not import react-native) | `packages/core` must not import `next`, `react`, or the ORM client. Plus `server-only` / `client-only` packages on the React halves. |
| Exploration sandbox + one-way import boundary | `app/(sandbox)/` or `components/experimental/`, same one-way rule, same path-encoded `.freeform` escape hatch. |
| Fixtures as the contract | `packages/fixtures/` with real (sanitized) API payloads and DB rows. Schemas are parsers verified against fixtures, not the reverse. |
| Intent model | Same JSON, per bounded context. Entities become your Prisma/Drizzle models, mutations become server actions. |
| `verify:mail-fixtures` | `pnpm verify:fixtures` — every Zod schema parses its fixtures. This is the single cheapest high-value test in a TypeScript SaaS. |
| Design-link push to Jira | Storybook or preview-deployment links pushed onto tickets. Same cron-not-merge-trigger reasoning. |
| Disk is truth, DB is seeded from disk | Identical, and more important. Applies to feature flags, plan/pricing catalogs, email templates, permission matrices, seeded reference data. |
| Two-state link verification | Coverage-versus-confirmed for any "we have a doc for that" metric. |
| `errorToSurface` classifier | Identical, and most web apps need it more than mobile does. |
| Source hierarchy (Part 8.3) | Promote it to a `source_policy` block (Part 4.9): authority, conflict rule, unknown rule, per-source status fields. |
| Model output in the product | An eval harness with negative controls (Part 9). Nothing else catches this. |
| Chart colors | A separate `series` token family, never the status family (Part 10.5). |
| "Are we halfway?" | `drift:check` — contract coverage per entity at type / fixture / UI (Part 5.5). |
| A prompt that describes a schema | Generate that part of the prompt from the schema (Part 4.15). |

### 10.2 Web-specific gates worth adding

These have no mobile analogue and belong in a SaaS build:

- **`env:check`** — a Zod-validated `env.ts`, plus a gate that every var in `env.ts` appears in
  `.env.example` and in the deploy config. Missing-env-var-in-prod is a top-five outage cause
  and it is entirely preventable.
- **`server-only` boundary** — a lint error on importing anything from `lib/server/` into a file
  with `"use client"`. Prevents leaking secrets into the client bundle.
- **`bundle:check`** — a per-route JS budget in CI that fails when a route grows past its
  ceiling. Set generous budgets and ratchet down; a budget nobody can meet is a gate people skip
  (Part 2.2 again).
- **`migration:check`** — every migration file carries a header comment answering: is it
  reversible, does it lock, what is the backfill plan, what is the rollback. Same shape as the
  generation header.
- **`a11y:check`** — `eslint-plugin-jsx-a11y` as errors plus axe in the component test run. The
  mobile repo's insight applies exactly: accessibility copy is the thing that never shows up in
  a screenshot review, so it needs a machine.
- **`api:check`** — every route handler has a Zod input schema, an output schema, an auth
  predicate, and a rate-limit policy. Four presence checks, trivially scriptable, and they close
  the four most common API defects.
- **`flags:check`** — every feature flag in the registry has an owner and a removal date, and
  flags past their date fail the build. Flag debt is the quiet killer of SaaS codebases.

### 10.3 A starter `no-restricted-syntax` set for Tailwind/ShadCN

```js
const TOKEN_RULES = [
  { selector: "Literal[value=/\\[#[0-9a-fA-F]{3,8}\\]/]",
    message: 'No arbitrary hex in a Tailwind class. Use a semantic token from globals.css.' },
  { selector: "Literal[value=/\\btext-\\[[0-9.]+(px|rem)\\]/]",
    message: 'No arbitrary font size. Use the type scale (text-sm/base/lg).' },
  { selector: "Literal[value=/\\b(p|m)(l|r)-[0-9]/]",
    message: 'No physical directional spacing. Use ps-/pe-/ms-/me- so RTL mirrors.' },
]

const COPY_RULES = [
  { selector: "JSXAttribute[name.name=/^(aria-label|placeholder|title|alt)$/] > Literal[value=/[A-Za-z]{2}/]",
    message: 'User-visible strings go through t(), accessibility labels included.' },
]
```

Write the probe file before you trust any of these (Part 2.5).

### 10.4 A suggested repo skeleton

```
/CLAUDE.md            constitution   (AGENTS.md -> symlink)
/apps
  /web                Next.js app: routes, screen composition, data wiring
  /admin              internal console (optional but see below)
/packages
  /ui                 components, presentation-only, no fetching
  /theme              tokens, CSS vars, Tweakcn config. The ONLY place hex is authored.
  /core               framework-agnostic domain logic. No next, no react, no ORM client.
  /schemas            Zod, one file per bounded context
  /fixtures           sanitized real payloads. The contract.
  /locales            messages/<lang>/common.json
  /intent             the spec model, one file per bounded context
  /eslint-config      the guardrails
/scripts
  /git-hooks          pre-commit, post-commit   (committed; core.hooksPath)
  check_locale_keys.py
  check_stray_components.py
  check_env.py
  intent_lint/        one module per check class
  doctor.sh
  session-status.sh
/docs
  PROGRESS.md  DECISIONS.md  RUNBOOK.md  ONBOARDING.md
  freshness-protocol.md
  /case-study         narrative + build log, fed by the post-commit stub feed
/prompts              checked-in generation prompts, referenced from generated headers
```

### 10.5 Dataviz governance: the token family SaaS forgets

Every SaaS grows a dashboard, and the dashboard is where an otherwise disciplined token system
falls apart, because charts need a *kind* of color the semantic palette does not have. Fleet's
constitution solves it by declaring three token families with non-overlapping jobs:

| Family | Tokens | Use for |
|---|---|---|
| Surface / ink | `background`, `card`, `muted`, `border`, `primary` | Everything structural |
| Series | `chart-1` … `chart-8`, `ramp-100` … `ramp-600`, `diverging-*` | Data marks only |
| Status | `status-good/warning/serious/critical/neutral` + `-subtle` | State, never a series |

And the rules that come with them, each of which is a real defect class:

- **Assign categorical hues in fixed order, never cycled.** A ninth series folds into "Other" or
  becomes small multiples. Cycling means two different things share a color on the same screen.
- **Status colors are reserved. Never reuse one as "series 4".** The moment red is both
  "critical" and "the third product line", every chart on the page has to be read twice.
- **Never let color carry the meaning alone.** The status badge always ships the written label
  beside the dot.
- **Never a dual-axis chart.** Two measures of different scale become two charts. This is the one
  rule that will get argued with, and it is right: a dual axis lets the author choose the
  correlation the reader sees.
- **Sequential is one hue light to dark; diverging is the two poles with a grey midpoint. Never a
  rainbow.**
- **Chart text wears text tokens, never the series color.**
- **Domain state to tone mapping lives in one module** (`src/lib/status.ts`). Components read the
  tone from there and never pick a color at the call site. This is `errorToSurface` again
  (Part 3.3): centralize the *decision*, never the rendering.

The best line in that section is the recorded accessibility measurement, because it converts an
audit result into a standing design rule with a consequence:

> The palette was validated against this app's real surfaces (`#ffffff` light, `#171717` dark
> card). In **light mode** `chart-3`, `chart-4` and `chart-5` sit below 3:1, so any view using
> them must ship direct labels or a table view. **Re-run the validator before changing a color.**

Most contrast audits produce a PDF nobody reads again. This one produced a sentence in the
constitution that tells you what to do about the three colors that failed and when to re-check.

### 10.6 Hygiene for vendored generators

shadcn, Prisma, OpenAPI clients and Supabase type generation all write code into your repo, and
that code does not match your house style. Fleet writes the rules down:

- **Never hand-write a component the generator already ships.** `pnpm ui:add <name>`.
- **`src/components/ui/` is vendored. Don't hand-edit it.** Wrap or compose instead.
- **Run `pnpm format` after every `ui:add`**, because the generator emits double quotes and
  semicolons and the repo is configured the other way. Stating this stops a formatting-only diff
  landing in the next unrelated PR.
- **Record generator-specific gotchas with their reason.** "Bind Select/Switch/Checkbox through
  `<Controller>`, not `watch()`, because `watch()` trips the React Compiler lint" is exactly the
  Part 0.3 habit applied to a library quirk.

### 10.7 Single registration points

Two one-liners from the same file that prevent a whole category of drift:

- **`src/config/nav.ts` — add a route to nav.ts, not to the sidebar.** One registry, so nothing
  can exist in navigation without existing in config, or vice versa.
- **`src/types/fleet.ts` — domain vocabulary; the UI never invents status strings.** This is the
  cheapest possible version of an intent model: one file that owns the domain's nouns and enum
  values, cited as authoritative in the constitution. If Part 4 is more than you want to adopt,
  adopt this line instead.

Plus the fixture convention: **fixtures use fixed timestamps and get replaced wholesale when the
API lands.** Fixed timestamps make snapshots stable; "replaced wholesale" says out loud that
they are scaffolding, so nobody starts patching them as if they were data.

### 10.8 Frameworks are starting to write your agent file

Fleet's `AGENTS.md` opens with a block the framework maintains:

```markdown
<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know
This version has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/`
before writing any code.
This block is written and re-added by `next dev`. Removing it from a diff only re-creates the
uncommitted change; committing it with your work keeps the tree clean.
<!-- END:nextjs-agent-rules -->
```

Two things worth knowing. **Your agent file may not be entirely yours**, so keep your own
conventions below a clearly delimited vendor block rather than interleaved with it. And the
note about committing it is good practice to copy for any tool that regenerates a tracked file:
say what regenerates it and what happens if you fight it, or you get an endless dirty worktree
that everyone works around.

### 10.9 Preflight a handoff across a boundary you don't control

A small pattern from dbiz-landing, worth generalizing. SVGs handed to a Drupal site are uploaded
by content editors, rendered through `<img>`, and sanitized on the way in. That combination fails
*silently*:

```js
/* These assets are sanitized on the way in. That combination silently removes
   anything it does not like: no error, no warning, just a static or half-broken
   graphic discovered days later. Each check below encodes one way that has
   actually gone wrong. */

const checks = [
  { name: 'no SMIL',
    /* the sanitizer allows `animatetransform` but NOT the plain `animate`
       element, so a SMIL build arrives stripped. All motion must live in CSS. */
    fail: (svg) => /<animate[\s>]|<set[\s>]/.test(svg) && 'contains SMIL elements' },
  { name: 'motion is CSS',
    fail: (svg) => /@keyframes/.test(svg) && !/<style[\s>]/.test(svg) && 'keyframes outside a <style>' },
]
```

**Any time you hand an artifact to a system you do not control, write a preflight that encodes
its silent failures.** Uploads to a CMS, emails through a rendering client, files into a
partner's SFTP, a webhook payload into someone else's parser. The failures are silent by
definition, which is precisely why a checklist in someone's head does not work.

### 10.10 The internal console

The repo runs a Next.js admin app over the spec model: triage, open questions, decisions,
milestones, a governance scorecard, a delivery Gantt. It is worth noting as a pattern because of
one property: **it makes the spec model legible to people who will never open a JSON file**,
which is what keeps non-engineers participating in it. The scorecard view in particular ("lane ×
milestone coverage") is what turns "are we on track" from an opinion into a query.

If you adopt the spec model, budget for a read-only web view of it early. It does not need to be
an editor.

**But an editor changes who can participate.** VBS went further and built the model *canvas*: an
app whose whole job is authoring and reviewing the model, with four capabilities worth naming.

- **AI editing with a diff and an approval step.** Its design principle states the rule
  precisely: *"AI as collaborator, not magic. Show exactly what changed (diffs), let users
  approve/reject, maintain full version history. Transparency builds trust."* An AI that edits a
  source of truth must produce a reviewable diff, never a silent write. This is the same contract
  as a pull request, and it is the minimum bar for letting a model touch a shared artifact.
- **Consensus review, section by section, with approve/dispute per reviewer.** A spec is signed
  off by several people who disagree about different parts. Tracking agreement per section per
  reviewer is what turns "did everyone approve?" from an email thread into a query, and it makes
  a *dispute* a first-class recorded state rather than silence.
- **BRD generation from the live model.** The client-facing requirements document is a rendering
  of the model, not a parallel document that drifts from it. If you owe a customer a formal
  requirements artifact, generate it, or you will maintain two truths.
- **Productized for reuse.** The README's "Using for a new project" section names exactly three
  things to change: the model data, a root `project.config.ts` holding every project-specific
  UI string, and a state reset. **A tool built for one project becomes a tool for the next one
  only if someone does the work of naming the seams**, and a single config file plus a documented
  reset is most of that work.

The trade-off to go in with eyes open: an editor makes the model editable by non-engineers, which
is the point, and it also means the model now lives in a database with its own versioning rather
than only in git. Decide early which one is canonical, and write down the answer (Part 5.2).

---

## Part 11 — Adoption path

Ordered by return on effort. Each phase is independently valuable; stop wherever the return
flattens for your team.

### Phase 1 — one afternoon

1. Write `CLAUDE.md` with: project identity, ownership by name and directory, 5 to 8 numbered
   hard rules, and the "what enforces what" table (leave cells empty, they are your backlog).
2. `ln -s CLAUDE.md AGENTS.md`.
3. `"prepare": "git config core.hooksPath scripts/git-hooks"` and a pre-commit hook that runs
   `tsc --noEmit` and `eslint` on staged paths only.
4. `scripts/doctor.sh`.
5. `DECISIONS.md` with the format header and your first three entries, written from memory.

**Return**: an agent that stops guessing; a new hire productive a day earlier.

### Phase 2 — one week

6. Move your top 3 conventions into ESLint `no-restricted-syntax`, each with a message that
   names the fix and a comment that names the incident. Write the probe file.
7. `check_locale_keys.py` (or the Node equivalent).
8. `check_env.py`.
9. `scripts/session-status.sh` + the SessionStart hook.
10. `docs/ONBOARDING.md` including the "so a rejected commit is not a mystery" section.
11. The permissions allowlist for read-only commands.

11b. **If any model output reaches a user, build the eval harness now** (Part 9). Twenty
    questions, five of them negative controls, three scored dimensions, one pass threshold.
    It is a weekend and it is not optional once you have shipped a model.

**Return**: drift stops at commit time instead of at review time. This is the phase with the
highest measurable payoff.

### Phase 3 — two to three weeks

12. `packages/fixtures` + `verify:fixtures`: every Zod schema parses its fixtures.
12b. If a prompt in your product describes a schema, generate it from the schema (Part 4.15).
    One script, and it removes a whole class of "the model got worse" investigations.
13. `check_stray_components.py` with its allowlist-with-reasons.
14. The tier boundary and the `server-only` / `client-only` enforcement.
15. `errorToSurface` and the four-surface decision procedure, written into the constitution.
16. Write the "no gate catches this" section: your assembly rules, your shell, and "open the
    nearest sibling before you write a new one".
17. `post-commit` stub feed + `docs/case-study/`, with rapid mode.

17b. If you have a dashboard: the three token families and the dataviz rules (Part 10.5), plus
    a contrast validation whose result is recorded as a rule.
18b. A `source_policy` block naming what can approve a requirement, with the conflict and
    unknown rules written down (Part 4.9). This is cheap and it does most of Part 4's work.

**Return**: consistency in the places gates cannot reach, which is where enterprise codebases
actually diverge.

### Phase 4 — ongoing, one bounded context at a time

18. `packages/intent/intent-<domain>.json` for your highest-churn domain only.
19. `intent-verify.sh`, then `intent_lint/` as check classes accumulate.
20. `docs/freshness-protocol.md`: your events, propagations, and gates.
21. Generation headers on generated files; the `@ai-policy: read-only` list.
22. `PROGRESS.md` with the size cap and archive from day one.
23. Two-state verification wherever you report a coverage number.
24. A read-only web view of the model.
25. The core/annex split and a validator that gates the split itself (Part 4.10).
26. Fail-closed readiness per capability (Part 4.11), and prototype tracing to open
    questions if you demo speculative UI (Part 4.12).
27. Content hashes on every cited source, so a decision cannot close against nothing
    (Part 4.13).
28. `drift:check` in every consuming app, so contract coverage is a number rather than a
    feeling (Part 5.5). This is the one to build first if you have a client asking for status.
29. Generated schemas, API stubs and migrations from the model (Part 4.14), then a single
    validator across every representation of the same fact (Part 4.16).

**Return**: AI-generated code you can trust because it was generated from a contract, plus
requirements traceability that survives an audit.

---

## Appendix A — Copy-paste starters

### A.1 Pre-commit hook skeleton

```bash
#!/bin/bash
# Wired via: git config core.hooksPath scripts/git-hooks  (set by `pnpm prepare`)
# Bypass in a genuine emergency with: git commit --no-verify
set -u
repo_root="$(git rev-parse --show-toplevel)"; cd "$repo_root" || exit 1

staged="$(git diff --cached --name-only --diff-filter=ACMR)"
[ -z "$staged" ] && exit 0
status=0

run_gate () {          # run_gate <name> <path-regex> <command> <fix-hint>
  local name="$1" pattern="$2" cmd="$3" hint="$4"
  [ "$status" -eq 0 ] || return 0
  printf '%s\n' "$staged" | grep -qE "$pattern" || return 0
  if ! eval "$cmd"; then
    echo "✗ ${name} failed. ${hint}" >&2
    status=1
  fi
}

run_gate "i18n"   '^messages/|^app/|^components/' \
         'node scripts/check-locale-keys.mjs --check' \
         'Add the key to BOTH messages/en.json and messages/ar.json, then re-stage.'

run_gate "env"    '^env.ts$|^\.env\.example$' \
         'node scripts/check-env.mjs' \
         'Add the var to env.ts AND .env.example AND the deploy config.'

run_gate "ds"     '^app/.*/_components/' \
         'node scripts/check-stray-components.mjs --check' \
         'Promote it to packages/ui, or allowlist it with a reason.'

[ "$status" -eq 0 ] && echo "gate passed ✓"
exit "$status"
```

### A.2 The "what enforces what" table stub

```markdown
## What enforces what

| Command | Enforces | Runs |
|---|---|---|
| `pnpm lint` | Hard rules 1–4, as ESLint errors | pre-commit |
| `pnpm typecheck` | Types | pre-commit |
| `pnpm i18n:check` | Every literal key resolves; locale parity | pre-commit |
| `pnpm env:check` | env.ts ↔ .env.example ↔ deploy config | pre-commit |
| `pnpm verify:fixtures` | Every schema parses its fixtures | pre-commit |
| `pnpm ds:check` | No stray reusable component; no duplicate definition | pre-commit |
| `pnpm bundle:check` | Per-route JS budget | CI |
| `pnpm flags:check` | Flags have an owner and a removal date | CI |

Deliberate non-gates (nags, because a credential-less clone cannot satisfy them):
| `pnpm links:check` | Preview links on tickets match the local map | SessionStart nag + nightly cron |
```

### A.3 Decision-log entry template

```markdown
### 2026-08-30 | billing | Seat changes prorate at period end, not immediately

**Priya, 2026-08-30:** "customers keep getting surprise invoices mid-month"

**Decided:** seat additions take effect immediately but bill at the next period boundary.

**Why not immediate proration:** it produces an invoice per seat change, which is what the
complaints are about, and Stripe's proration line items are unreadable to a customer.

**Dead end:** we tried batching proration into a daily job first. It moved the surprise from
per-change to per-day rather than removing it.

**Boundary:** this applies to seat count only. Plan upgrades still prorate immediately, because
the customer initiated a change they expect to pay for now.
```

### A.4 The four-surface rule, ready to paste into a constitution

```markdown
## Which surface a message uses

No gate catches this one, and it is the one a ticket will decide for you if you let it. A
ticket's error table says WHAT to say; it has no authority over WHERE it goes. Ask these in
order and stop at the first yes.

1. **Nothing to show?** The page could not load its subject at all. Full-page empty state with
   a single retry.
2. **One specific value wrong, missing, or refused?** Inline, at that value. Only the field
   knows where the user has to go; a page-level banner makes them hunt.
3. **Still true while they're looking at it?** A standing condition: showing cached data, a
   write that hasn't landed, read-only mode, degraded integration. A persistent banner. It
   persists because the condition does.
4. **Is it over?** Nothing to decide, nothing still broken, result already visible. A toast.

Tie-breakers:
- If the condition outlives four seconds, it cannot be a toast.
- A toast carries no recovery action. Undo is the only exception.
- An action goes where there is one to offer, and exactly once.
- The same claim takes the same surface on every page, app-wide.

The classifier in `lib/errors/errorToSurface.ts` returns a surface and a message KEY, never a
resolved string, so no page re-decides.
```

---

## Appendix B — Anti-patterns this repo learned the hard way

Each of these is a real incident, with the fix.

| Anti-pattern | What happened | Fix |
|---|---|---|
| **A rule that silently never fires** | `Literal[value=/^[0-9]+$/]` matched nothing, because esquery regex tests don't apply to numeric attribute values. It read as coverage for weeks. | Every new check ships with a probe that must fail and a probe that must pass. Match on `raw`, not `value`, for numbers. |
| **A narrow selector that missed the wrapped form** | `fontSize: 12` was caught; `fontSize: cond ? 9 : 10` sailed past. | Use a descendant selector (`Property[key.name='fontSize'] Literal[raw=/^[0-9.]+$/]`), not a direct-value match. |
| **A gate nobody can satisfy** | A check needing Jira credentials sat in pre-commit and taught people `--no-verify`. | Demote to a SessionStart nag, and give the nag a nightly CI actor. |
| **A nag nobody acts on** | Sixteen commits moved the map; none reached Jira. 52 tickets read as undesigned and nothing looked broken. | The nag needs a leg: a cron that runs the fix when `--check` reports drift. |
| **Counting citations as verification** | "371 linked" sounded like 371 verified. 26 of 47 scope escapes sat on links every gate called perfect. | Two-state verification: asserted vs verified/contradicted, with verdicts keyed to a content hash. |
| **A resume block that only ever grew** | Reached 101 KB and 25 entries, injected into every session ahead of any actual work. | Hard size cap, 3 or 4 newest entries, an archive section, stated as a per-turn tax. |
| **Ceremony on every turn** | A Stop hook nudged a session-state rewrite even on fully-committed mechanical turns. | Removed the hook. Opt-in by an explicit rule about what "resume-state" means. |
| **A copy-paste duplicate the reuse gate could not see** | The reuse check counted importers, so a component pasted into two files with zero importers each was invisible. | Add a second check: the same component name *defined* in 2+ files, exported or not. Copy-paste is the worse failure, because there is no single source at all. |
| **Blanket-disabling a rule for one exemption** | The component catalog legitimately hardcodes specimen strings, and the instinct was to turn the whole rule off there. | Re-declare the rule minus the one half that doesn't apply. A hex in the catalog still fails. |
| **A screen batch that invented its own shell** | Every value legal, every gate green, and a whole folder inconsistent with the rest of the app. | Write the assembly rules down under a heading that says no gate catches them, and mandate "open the nearest sibling first". |
| **Two names for one fact** | "You're offline." / "You are offline." / "Offline." / no mention at all, across four screens. | Make the shared half structural: the component owns the opener, the screen passes only its own detail. |
| **A destructive re-seed** | The global seed overwrote rows whose recommendations only existed in the DB. | Field-level ownership map, a non-lossy seed path, and a `db:check` that refuses rather than clobbers. |
| **A silent escape hatch** | A mode that skipped the case-study feed without saying so would have killed the feed unnoticed. | The hook prints a reminder on every commit while the mode is on, and spools to `.git/` rather than dropping. |
| **A CI job racing its own deploy** | Links pushed on merge resolved before the page was built, and a Smart Card cached the generic shell forever. | Cron, not merge trigger. State the race in the workflow header. |
| **A decision closed against unregistered evidence** | An open question was marked resolved citing a transcript that was never registered or hashed. Every gate was green. | Every citation must resolve to a registered source carrying a content hash. |
| **A generator that overwrites the answers to make its own check pass** | A `--check` that goes green by regenerating over recorded content is not a gate. | It goes green by reconciling the tool with the model, never the other way round. |
| **Filling an unknown with a sensible default** | The default failure of both juniors and LLMs. A convention silently becomes a requirement. | An `unknown_rule` that blocks the affected implementation instead of guessing. |
| **An eval suite with no negative controls** | It measures capability and says nothing about fabrication, which is the failure that destroys trust. | A category of questions the system should decline, scored on its own two dimensions. |
| **Gating an eval on a subjective dimension** | Judge noise on "voice" or "tone" makes the suite flaky, and a flaky red is a red people stop reading. | Measure all dimensions, gate on the unambiguous ones only. |
| **A status color reused as a series color** | Red means "critical" and "product line 3" on the same screen. | Three token families with non-overlapping jobs; status is reserved. |
| **A silent sanitizer on a handoff boundary** | SVGs uploaded to a CMS arrived stripped, with no error, discovered days later. | A preflight encoding each silent failure, run before the handoff. |
| **A prompt that describes a stale schema** | A field is added to the type, the system prompt keeps describing the old shape, and it reads as a model quality problem. | Generate the schema half of the prompt from the types; treat `ai-prompt-mismatch` as a peer of `schema-mismatch`. |
| **A hand-maintained "what we've built" checklist** | It lies within a week. | Parse the real types with the compiler API and score coverage against the contract. |
| **A merged rule that drops its ancestors' ids** | Every ticket, email and comment citing BR-021 now resolves to nothing. | "Consolidates former BR-002, BR-021" stays in the rule text forever. |
| **A silent naming mismatch between model and code** | The model is snake_case and domain-shaped, the app camelCase and UI-shaped, so a coverage check reports false gaps or someone demands a rename. | An explicit `fieldAliases` map. A mapping table is honest; a forced rename is a fight. |
| **An AI that writes to a source of truth without a diff** | Nobody can see what changed, so nobody trusts the artifact. | Diff, approve/reject, version history. The same contract as a pull request. |

---

## Closing note

A closing observation from the survey that produced this document's additions. Five sibling
projects were read for practices worth keeping. The ones that had them were not the ones with
the most code: they were the four that had been forced to answer a hard question in public. A
regulated hardware client produced the provenance model. A product that ships a model to users
produced the eval harness. A dashboard product produced the dataviz rules. A repo that hands
assets to someone else's sanitizer produced the preflight. **The practice worth extracting is
almost always downstream of an accountability, not of an ambition.** If a repo has nothing worth
extracting, it usually means nothing about it has been checkable by someone else yet.

The corollary showed up in the survey too: **the practice you are missing is usually in the repo
that had to answer a question you have not been asked yet.** Synacor has the strongest gates
because it has the most people committing to it. VBS has contract coverage because a client asked
how far along the build was and "mostly done" was not an answer. Enatel has fail-closed
provenance because a regulated buyer will eventually ask who approved a requirement. None of
those teams was being more rigorous than the others. Each was being exactly as rigorous as its
accountability required, and the whole value of reading across a portfolio is getting the
mechanism before the question arrives.

If you take one thing from this document, take Part 0.3: **every rule carries the incident that
produced it.** The gates in Part 2 are mechanically useful, and the spec model in Part 4 is
genuinely powerful, but neither survives contact with a team that does not understand why they
exist. A codebase where every constraint can explain itself is one where the constraints get
maintained instead of routed around, and that is the whole difference between a style guide and
a system.

Start with the constitution and one pre-commit hook. Add a gate the week after each time you fix
the same bug twice.
