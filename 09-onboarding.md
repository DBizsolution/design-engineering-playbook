# Onboarding and research

Two things: getting a person productive on day one, and making sure work starts
from what is true rather than from what someone assumed.

## The doctor script

`scripts/doctor.sh`. Install at Tier 2. It reports what is installed, what is
missing, and the exact command that fixes each gap.

```
Core, needed for everything:
  [ ok ] node v22.22.3
  [ ok ] pnpm 10.11.1
  [ ok ] git hooks wired (core.hooksPath = scripts/git-hooks)
  [MISS] .env.local is missing: STRIPE_WEBHOOK_SECRET, RESEND_API_KEY.
         Ask the team, or see .env.example for where each one comes from

Optional, only if you work on these:
  [note] docker not found. Only needed to run the database locally
```

Three rules make the difference between a doctor script people run and one they
ignore.

**It never exits non-zero.** A doctor that fails is a gate, and this is not a
gate. It is a diagnostic you run when something is wrong, and it has to finish
and print everything even when half the machine is missing.

**Sections are labelled by role.** A designer who only runs the dev server should
see at a glance that the Docker line does not apply to them. Without this, every
missing item reads as "you are broken".

**Every failure line contains its remedy.** Not "pnpm missing" but "pnpm missing.
Run: npm i -g pnpm". The whole point is that the reader does not have to go and
ask someone.

The version in this playbook also checks two things that silently disable
everything else: whether `core.hooksPath` is actually wired, and which specific
variables `.env.local` is missing compared to `.env.example`.

## The onboarding page

`docs/ONBOARDING.md`, written for the least technical person who will open the
repo. Not the readme; the readme is for people evaluating the project.

```markdown
# Getting started

You can be productive here without being a terminal expert.

## The 60-second start
1. `pnpm install`
2. `pnpm doctor`   tells you exactly what your machine is missing
3. `pnpm dev`      http://localhost:3000

## Words you will see
- **Contract**: `contract.json`, the description of what the product does.
- **Token**: a named colour or size in `globals.css`. Use these, never raw values.
- **Gate**: a check that runs when you commit.

## Guardrails, so a blocked commit is not a mystery

The repo checks a few things automatically. If a commit gets blocked, the message
tells you the fix, and they are all quick:

- No hardcoded colours in components. Use a token from globals.css.
- No raw text in the UI. Every string goes through `t('key')`.
- No physical left/right spacing. Use start/end so right-to-left languages mirror.
- Every API route needs input validation and an auth check.

If you get stuck, `git commit --no-verify` skips the checks. Use it when you are
blocked, then fix it in the next commit.
```

**That guardrails section is not optional if you have installed the gates.** A
blocked commit with no context is the fastest way to turn a good control into a
resented one. You owe people the list, the reason, and the escape hatch.

Being explicit about `--no-verify` is deliberate. People find it eventually. If
they find it during an incident at 11pm it becomes the default; if they find it
here, alongside "then fix it in the next commit", it stays an emergency tool.

## The runbook

`docs/RUNBOOK.md`, separate from the readme. Every way to run things, with the
gotchas.

Kept separate because a readme is read once and a runbook is read at 11pm when
something is broken. Point at it from the session banner by name.

What belongs in it: how to run each surface, how to reset local state, how to get
a fresh database, what to do when the build cache is stale, which errors are
expected on first run, and how to deploy plus how to roll back.

## Research before building {#research}

Tier 3 and up. Applies to any new screen, flow or module, or a significant change
to an existing one. Small fixes skip it.

### Read first

Before proposing anything, look at:

- **The contract**, for the entities and rules the feature touches.
- **Open questions and the decision log.** A feature that touches an open
  question surfaces it rather than guessing past it. Settled decisions do not get
  re-opened.
- **The tickets**, for acceptance criteria.
- **What the product does today**, if you are changing something that exists.
- **What the backend can actually do.** Read the API, the schema, a real captured
  payload. Not the documentation.
- **What already exists in the design system.** Know what you have before
  proposing something new.

### Which source wins when they disagree

They will disagree. The order, and a conflict is a finding to record rather than
a silent pick:

1. **What the system can actually do.** The hard floor. Nothing overrides it. A
   feature the backend cannot support gets its degraded or blocked state
   designed, deliberately.
2. **What the product currently does.** Match existing behaviour and meaning by
   default; adapt the form. Dropping or changing the meaning of a capability is a
   recorded decision, never a side effect of a redesign.
3. **What has been decided.** The contract and the decision log. Entries tracing
   to a recorded decision stand until re-decided.
4. **What is planned.** Tickets. **Input, not authority.**

Two lines worth putting in the constitution verbatim:

> **Tickets are input, not authority.** A ticket's error-handling table says what
> to say. It has no authority over where it goes, and its author was describing
> one screen, not designing a system.

> **A conflict between sources is a finding to record, never a silent pick.**

### Propose before building

Two or three options with a recommendation. For each one, say:

- which existing components it reuses, and what gaps it opens. A gap is a
  proposal to add something shared, never a one-off in a route folder;
- which tokens it needs. Existing ones only, or a named proposal;
- what it depends on from the backend, and what the degraded state looks like;
- concerns, in plain language.

Then ask, and wait. Record the outcome as a decision log entry when it settles
something.

**Why this is worth the ceremony at Tier 3 and up:** the expensive mistakes are
not bad code, they are building the right thing for the wrong requirement. The
research pass costs an hour. Building the wrong flow costs a sprint, and the
rework usually lands on someone else.

## Slash commands and shortcuts

If your team uses an AI assistant, ship a few commands so people do not have to
memorise anything:

```
.claude/commands/
  run.md        start a surface: dev, db, storybook
  check.md      run every gate and explain any failure
  commit.md     stage and commit the way this repo expects
  whats-new.md  what changed since I last pulled
```

For a mixed-experience team this is the highest-value accessibility work
available. A designer who can type `/run` and `/commit` is productive on day one
without learning the terminal, and the commands encode your conventions so the
output is right by default.

## A closing note on tone

Every artifact here is written for someone who does not have context and cannot
easily ask. That means:

- name the fix, not just the fault;
- say which sections do not apply to the reader;
- explain what a word means the first time you use it;
- and say what happens if they ignore the advice, so they can make the call.

The test is whether someone can get productive on a Sunday with nobody to ask.
