# Start here

Copy-paste setup for each tier. Run these in order. Every tier assumes the ones
before it.

If you have not read the tier table in the [README](README.md), do that first.
Picking the wrong tier is the most common way this goes wrong: too much process
on a prototype gets abandoned, and too little on a long-lived product gets
expensive around month eight.

## Tier 1: prototype, landing page, spike

```bash
PB=~/engineering-playbook   # wherever you cloned this repo

# 1. The constitution.
cp $PB/examples/AGENTS.template.md AGENTS.md
$EDITOR AGENTS.md          # delete the Tier 3+ sections, fill in the brackets
ln -s AGENTS.md CLAUDE.md

# 2. Hooks, wired through the repo so every tool gets them.
mkdir -p scripts/git-hooks
cp $PB/scripts/git-hooks/pre-commit scripts/git-hooks/
chmod +x scripts/git-hooks/pre-commit
git config core.hooksPath scripts/git-hooks

# 3. Make it automatic for everyone who clones.
npm pkg set scripts.prepare="git config core.hooksPath scripts/git-hooks"

# 4. Env honesty.
cp $PB/scripts/check-env.mjs scripts/
npm pkg set scripts.env:check="node scripts/check-env.mjs --check"
node scripts/check-env.mjs   # tells you what is already out of sync

# 5. Decisions.
mkdir -p docs && cat > docs/DECISIONS.md <<'EOF'
# Decisions

Append only. Newest at the top. If you disagree with an entry, write a new one
that supersedes it; do not edit the old one.

Format:
### YYYY-MM-DD | area | one line saying what was decided
Who asked for it, in their words if you have them. What was decided. Why the
alternatives lost. Any dead end you tried first.
EOF
```

Then open `scripts/git-hooks/pre-commit` and delete every `run_gate` block for a
check you have not installed. At Tier 1 that leaves typecheck, lint and env.

**Verify it works.** This matters more than it sounds: a hook that is not wired
looks exactly like a hook with nothing to complain about.

```bash
echo "const x: string = 42" >> src/broken.ts
git add -A && git commit -m "test"     # must fail
git checkout . && rm -f src/broken.ts
```

## Tier 2: one app, fixed scope

Everything above, then:

```bash
PB=~/engineering-playbook   # wherever you cloned it

# Lint rules, and the probe that proves they fire.
cp $PB/scripts/eslint-rules.mjs scripts/
cp $PB/scripts/check-probes.mjs scripts/
mkdir -p scripts/probes && cp $PB/scripts/probes/rules.probe.tsx scripts/probes/

# Wire the rules into your flat config.
cat >> eslint.config.mjs <<'EOF'
// Design and copy guardrails. See scripts/eslint-rules.mjs for why they are
// split into groups rather than one flat list.
import { designRules, copyRules } from './scripts/eslint-rules.mjs'
EOF
$EDITOR eslint.config.mjs   # add: rules: { 'no-restricted-syntax': ['error', ...designRules, ...copyRules] }

npm pkg set scripts.probes="node scripts/check-probes.mjs"
pnpm probes                 # must print "ok" before you trust any of the rules

# API, fixtures, components.
cp $PB/scripts/check-api-routes.mjs $PB/scripts/verify-fixtures.mjs scripts/
npm pkg set scripts.api:check="node scripts/check-api-routes.mjs --check"
npm pkg set scripts.verify:fixtures="node scripts/verify-fixtures.mjs"

# Where messages go.
mkdir -p src/lib/errors
cp $PB/examples/errorToSurface.ts src/lib/errors/
cp $PB/examples/errorToSurface.test.mjs src/lib/errors/

# Onboarding.
cp $PB/scripts/doctor.sh scripts/ && chmod +x scripts/doctor.sh
npm pkg set scripts.doctor="bash scripts/doctor.sh"

# Contract coverage. This is the one that answers "are we halfway".
cp $PB/examples/contract.json contract.json
cp $PB/scripts/check-contract-coverage.mjs scripts/
$EDITOR contract.json                              # your entities and journeys
$EDITOR scripts/check-contract-coverage.mjs        # entityTypeMap and fieldAliases
npm pkg set scripts.coverage="node scripts/check-contract-coverage.mjs"

# One command that runs everything, the way CI will.
npm pkg set scripts.check="pnpm typecheck && pnpm lint && pnpm probes && pnpm env:check && pnpm api:check && pnpm verify:fixtures"
```

**Expect the first run to be red.** Every one of these finds real things on an
existing codebase. Do not fix them all before committing the scripts. Commit the
scripts, note the count, and fix them in batches. See
[graduating warnings](03-gates.md#graduating) for how to land a check on a
codebase that fails it.

## Tier 3: several apps sharing a contract

Everything above, then:

```bash
PB=~/engineering-playbook   # wherever you cloned it

# Translations.
cp $PB/scripts/check-locale-keys.mjs scripts/
npm pkg set scripts.i18n:check="node scripts/check-locale-keys.mjs --check"

# Shared UI discipline.
cp $PB/scripts/check-stray-components.mjs scripts/
npm pkg set scripts.ds:check="node scripts/check-stray-components.mjs --check"

# Coverage per consuming app, not one number for the repo.
for app in apps/*/ ; do
  cp $PB/scripts/check-contract-coverage.mjs "$app/scripts/"
done
```

Then the parts that are writing rather than copying:

- **Import boundaries.** Add `boundaryRules` from `scripts/eslint-rules.mjs` to
  your config, and decide which boundaries you actually have. See
  [chapter 4](04-checks.md#boundaries).
- **A source policy** in the contract: which document can approve a requirement,
  and what happens when two sources disagree. This is half a page and it settles
  a category of argument permanently. See [chapter 6](06-contract.md#source-policy).
- **Provenance on rules**: each business rule carries who agreed it, when, and in
  whose words. See [chapter 6](06-contract.md#provenance).

## Tier 4: long-lived product

Everything above, then:

```bash
PB=~/engineering-playbook   # wherever you cloned it

# Build log fed automatically.
cp $PB/scripts/git-hooks/post-commit scripts/git-hooks/
chmod +x scripts/git-hooks/post-commit
mkdir -p docs/build-log && touch docs/build-log/_pending.md

# Session start banner.
cp $PB/scripts/session-status.sh scripts/ && chmod +x scripts/session-status.sh
```

Wire the banner into your assistant's session-start hook. For Claude Code:

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "bash scripts/session-status.sh" }] }]
  },
  "permissions": {
    "allow": [
      "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)",
      "Bash(pnpm check)", "Bash(pnpm doctor)", "Bash(pnpm coverage)"
    ]
  }
}
```

That permissions list is worth doing. Pre-approving the commands that cannot
cause damage removes dozens of prompts per session, which is what keeps a person
actually reading the prompts that remain. Allowlist read-only and idempotent
commands only. Never allowlist anything that writes to a shared system.

Then the writing:

- **`docs/PROGRESS.md`** with the resume block between markers, and the size cap
  from day one. See [chapter 8](08-memory.md#session).
- **Codegen from the contract**, if the contract has earned it. See
  [chapter 6](06-contract.md#codegen).
- **A research protocol** in the constitution: what to read before building, and
  the order sources win in. See [chapter 9](09-onboarding.md#research).

## If you are adding this to an existing codebase

The instinct is to fix everything before turning a check on. Do not. You will
lose a week and turn nothing on.

1. Install the check and run it without `--check`. Write the number down.
2. Commit the script with the number in the commit message.
3. Set the check to warn rather than error, and record the debt in a table with a
   condition for graduating it to an error.
4. Clear the backlog in batches over a few weeks.
5. Flip it to error and delete the table row.

Chapter 3 covers this properly. It is the difference between a check you turn on
today and a check you keep meaning to turn on.
