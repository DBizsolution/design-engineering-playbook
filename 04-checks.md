# The checks

Reference for each script in `scripts/`. Every one is tested and works as
written. For each: what it catches, why nothing else catches it, how to install
it, and how to tune it.

Together they hold the line that matters to a design engineer: the shipped UI
keeps using the token system, the copy stays translatable, shared components
stay shared, and the data behind the screens keeps matching what the screens
render.

They are all plain Node with no dependencies except the ones your project already
has. Run any of them with no arguments to see what it finds; add `--check` to
make it exit non-zero.

| Check | Catches | Tier |
|---|---|---|
| [lint rules](#lint) | hardcoded colour, sizes, physical spacing, untranslated copy | 2 |
| [probes](#probes) | a design rule that silently stopped working | 2 |
| [env](#env) | a variable the UI needs that will be missing in production | 1 |
| [api](#api) | a route behind the UI with no validation, auth, or rate limit | 2 |
| [fixtures](#fixtures) | a schema that no longer matches the data the UI renders | 2 |
| [i18n](#i18n) | a translation key that does not exist | 3 |
| [components](#components) | shared UI stranded in one route, or defined twice | 3 |
| [boundaries](#boundaries) | server code imported into the browser bundle | 3 |
| [coverage](#coverage) | how much of the contract is actually on screen | 2 |

---

## Lint rules {#lint}

`scripts/eslint-rules.mjs`

Encodes the design and copy rules from the constitution as ESLint errors. Import
the groups into your flat config:

```js
import { designRules, copyRules, boundaryRules } from './scripts/eslint-rules.mjs'

export default [
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...designRules, ...copyRules],
      ...boundaryRules,
    },
  },
  {
    // Specimens hardcode strings on purpose. Token rules still apply.
    files: ['**/*.stories.tsx'],
    rules: { 'no-restricted-syntax': ['error', ...designRules] },
  },
]
```

**What it catches.** Arbitrary hex in a Tailwind class or a style object.
Arbitrary font sizes, including inside a ternary. Physical directional spacing
(`pl-4`, `mr-2`, `left-0`, `text-right`, `border-l`). Hardcoded strings in
`aria-label`, `placeholder` and `alt`. Em dashes in JSX text.

**Why nothing else catches it.** All of these are well-formed TypeScript. The
compiler has no opinion about whether `bg-[#ff0055]` should have been a token,
and an assistant will produce that class in perfectly idiomatic Tailwind unless
something mechanical objects.

**Tuning.** The groups are split deliberately: `rtlRules` are correctness and
never relax; `tokenRules` are taste and a sandbox may relax them; `copyRules`
have different exemptions from both. See
[scope a rule instead of switching it off](03-gates.md).

For React Native, swap the class-name selectors for style-object ones. The
`fontSize` and spacing rules already work on style objects and transfer directly.

---

## Probes {#probes}

`scripts/check-probes.mjs` and `scripts/probes/rules.probe.tsx`

**What it catches.** A lint rule that matches nothing, and a lint rule that fires
on legitimate code.

**Why it matters more than it sounds.** A rule that matches nothing prints
exactly the same output as a rule with no violations to find. You will believe
you have coverage you do not have. Two real cases, both of which survived weeks
in production repos:

- `Literal[value=/^[0-9]+$/]` matched nothing, ever, because esquery regex tests
  do not apply to numeric attribute values. It needed `raw` instead of `value`.
- A direct-child `fontSize` selector caught `fontSize: 12` and missed
  `fontSize: compact ? 9 : 11`, which is the form real code actually contains.

**How it works.** The probe file contains a deliberate violation and its
legitimate counterpart on adjacent lines, annotated:

```tsx
const tokFail4 = { fontSize: 12 }                  // FAIL raw-size
const tokFail5 = { fontSize: compact ? 9 : 11 }    // FAIL raw-size-in-ternary
const tokOk4   = { fontSize: theme.type.sm }       // OK
const tokOk5   = { padding: 3 }                    // OK  off-scale nudge, no token exists
```

The runner asserts every FAIL produced at least one error and every OK produced
none. The OK lines matter as much: a rule that flags correct code gets disabled,
and then it protects nothing.

**Install.** Copy both files, add `"probes": "node scripts/check-probes.mjs"`,
and run it in CI plus in pre-commit whenever the lint config changes. **Add two
probe lines before you add a rule**, not after.

---

## Env {#env}

`scripts/check-env.mjs`

**What it catches.** Three things:

- a variable in your validated schema but missing from `.env.example`, so a new
  clone cannot boot and has no hint why;
- a variable in `.env.example` but not in the schema, so it is either dead or
  being read somewhere unvalidated;
- a `process.env.X` read directly in source without going through the schema, so
  it is `undefined` at runtime instead of failing at boot with a clear message.

Optionally, with a committed list of what the hosting platform has set, it also
catches a variable that will be missing in production.

**Why nothing else catches it.** Nothing in the type system knows that
`.env.example` and your Vercel project settings exist. The symptom reaches a
design engineer as a preview deploy that renders a blank screen, or a demo that
falls over in front of a client, with no hint that one variable is the reason.

**Assumes** you validate env at boot with Zod, which is worth doing anyway:

```ts
// src/env.ts
export const env = z.object({
  DATABASE_URL: z.string().url(),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
}).parse(process.env)
```

**Tuning.** `CONFIG.exempt` holds variables the platform injects (`NODE_ENV`,
`VERCEL_URL`, `PORT`), each with a reason. `CONFIG.deployListFile` is off by
default: it needs a file only someone with deploy access can produce, so
switching it on makes this a nag rather than a gate for most of the team.

Note the script parses `src/env.ts` with a regex rather than importing it. That
is deliberate: importing runs `.parse(process.env)`, which throws in CI where the
variables are not set, so the check would fail for the wrong reason.

---

## API routes {#api}

`scripts/check-api-routes.mjs`

**What it catches.** A route handler that accepts a body without validating it,
has no auth check, or declares no rate limit. Plus an exemption marker with no
stated reason. In a Next.js app these handlers sit directly behind your forms
and mutations: they are part of the UI's surface, whoever wrote them.

**Why nothing else catches it.** `req.json()` returns `any`, so TypeScript will
happily let you treat the result as whatever you claim. Nothing warns that a
handler has no auth call. Nothing counts requests.

**What it does not do.** It does not verify the checks are correct, only that
they are present. That is a much weaker claim and it still catches nearly every
real case, because the usual failure is not a subtly wrong auth check, it is no
auth check at all in a handler someone added at 6pm.

**Exemptions live in the route file**, so they travel with the code and appear in
the diff that makes them true:

```ts
// @api-public: Stripe calls this before any session exists. Authenticity comes
//              from the signature check below, not from a user session.
// @api-no-rate-limit: Stripe retries with backoff; dropping one loses the event.
```

A marker with a reason under twenty characters is itself an error. Making a route
public is a real decision and should read like one. A bare marker is how an
endpoint ends up public because somebody was debugging.

**Tuning.** `CONFIG.authCalls`, `validationCalls` and `rateLimitCalls` are arrays
of regexes. Add your own helper names. The defaults cover NextAuth, Clerk, Stripe
webhooks and the common Zod shapes.

For Pages Router, set `routeDirs: ['src/pages/api']` and remove the filename
filter.

---

## Fixtures {#fixtures}

`scripts/verify-fixtures.mjs`

**What it catches.** A schema that no longer parses the payload it claims to
describe. Also fixtures with no schema, and schemas with no fixture.

**Why it is the best value test in a TypeScript project.** TypeScript checks the
shape you told it about. It cannot check that the shape matches what the API
actually sends, because the data arrives as `any` and is asserted into existence.
When the two drift, the UI is where it surfaces: a column of `NaN`, an empty
state over data that exists, a date rendering as `Invalid Date`. This is the
check that notices the upstream change before a screen does.

**The discipline it enforces.** Schemas are parsers verified against real
captured payloads, not descriptions written from documentation. Add a field to a
schema, add a fixture that has it. Capture a weird production payload, add it as
a fixture, and the gate tells you which schemas do not fit.

**Convention.** `fixtures/invoice.json` is parsed by `InvoiceSchema`. Variants
use a dot: `fixtures/invoice.overdue.json` also uses `InvoiceSchema`. One schema
can own many cases (empty, minimal, full, the weird one from production) with no
per-fixture configuration.

**Output is actionable.** It prints the field path and the reason:

```
  invoice.overdue.json does not parse with InvoiceSchema:
      total: Invalid input: expected number, received string  [invalid_type]
      dueDate: Invalid input: expected string, received undefined  [invalid_type]
    One of the two is wrong. If the API changed, update the schema.
    If the fixture was hand-written, replace it with a real captured payload.
```

A schema with no fixture is reported but does not fail. It is worth knowing that
a schema has never been run against real data, but it is not a defect.

---

## Translations {#i18n}

`scripts/check-locale-keys.mjs`

**What it catches.** A `t('key')` with no entry in the base locale. A key in the
base locale missing from a translation. An incomplete plural set.

**Why nothing else catches it.** TypeScript cannot, because `t()` takes any
string. ESLint cannot, because the call is well-formed. And it does not crash:
i18next renders the key itself, so the screen shows `nav.settings` where a label
should be. If the key was on an `aria-label`, nothing shows at all and a screen
reader reads the dotted path aloud. Nobody catches that in a screenshot review.

**It also scans `*Key` props.** A key passed to a component rather than resolved
at the call site never appears inside a `t()`:

```tsx
<Banner titleKey="offline.title" />
```

Every `*Key` prop in a codebase like this is a locale key, so the shape alone is
enough to find them. This was a real blind spot in the project this came from.

**Plurals resolve correctly.** `t('items')` passes when `items_one` and
`items_other` are defined.

**Extra keys in some languages are allowed, deliberately.** Arabic, Polish,
Russian and Czech have plural categories English does not, so extra keys there
are correct. The reverse, a key missing from a translation, is always a bug.
`CONFIG.allowExtraKeysIn` holds the list.

**Unused keys are reported as info, never a failure.** Some call sites build keys
at runtime, `t(\`errors.${code}.title\`)`, so a key with no literal call site is
not proof of a dead string. Failing on it would train people to delete keys that
are in use.

---

## Stray components {#components}

`scripts/check-stray-components.mjs`

A design system's promise is one source per pattern. These two checks watch the
two ways that promise breaks in practice.

**Two separate checks**, because they fail differently.

**Reuse.** A component defined in one route's private folder but imported by two
or more other places is shared in practice while living somewhere private by
name. The next person looking for it will not find it and will write a second
one.

**Duplicates.** The same component name defined in two or more files. This is the
worse failure, because there is no single source at all, and the reuse check
cannot see it: that check counts importers, and two copy-pasted components have
zero importers each. In the project this came from, a table row component was
defined twice in two different sheets, with the same anatomy and the same
explanatory comment pasted into both. Every check was green.

**Neither is a proof.** Both are prompts for a human decision: promote it, or
allowlist it with a reason.

```js
const ALLOWLIST = {
  InvoiceRow: 'bound to the billing fixtures and the invoice status enum, not a ' +
              'tenant-neutral primitive. Shared by the list and the detail drawer ' +
              'on purpose so the two never drift.',
}
```

**It ignores** anything ending in `Page`, `Layout`, `Provider`, `Boundary` or
`Route`, since those are compositions rather than primitives, and any file with
no JSX in it, so a PascalCase constant in a helper module is not mistaken for a
component.

---

## Import boundaries {#boundaries}

`boundaryRules` in `scripts/eslint-rules.mjs`

**What it catches.** Server-only code imported into a client component, which
bundles it into the browser and ships your secrets. Anything outside an
experiments folder importing from inside it.

**Enforce important boundaries twice.** The lint rule matches the specifier text,
so it catches the shapes people actually write and misses ones they could
contrive. For a boundary that really matters, pair it with a script in
pre-commit that resolves paths properly. Two layers on purpose: the lint rule for
fast feedback in the editor, the script for the gate you actually trust.

**The boundaries worth having in a web project:**

```
src/lib/server/**   never imported from a "use client" file
src/experiments/**  nothing outside it may import from inside it
packages/core       must not import next, react, or the ORM client
features/billing    may not import from features/messaging, only from core
```

Also add the `server-only` and `client-only` npm packages to the relevant
modules. They fail at build time with a clear message, which complements the lint
rule.

**Why the experiments boundary makes the sandbox safe.** An experiment is allowed
to break the design system precisely because none of it can leak. Without the
one-way boundary, "we will clean it up when we promote it" becomes "it is in
production now".

---

## Contract coverage {#coverage}

`scripts/check-contract-coverage.mjs`

Covered fully in [chapter 6](06-contract.md). In short: it parses your real
TypeScript with the compiler API and reports how much of the contract the build
has actually implemented, scored at three layers.

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
```

The three layers are the point, and the UI column is the one a design engineer
answers for. `subscription` above is fully typed and appears in no fixture and
on no screen: built, never exercised, never shown. One combined percentage
would hide exactly that.
