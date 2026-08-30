# Memory

Three artifacts that stop knowledge leaving with people: a decision log, a build
log fed automatically, and a resume pointer for whoever sits down next.

Git log answers "what changed". None of these compete with it. They answer "why
is it like this" — why the empty state is a full-page illustration here and a
one-liner there, why this one screen is allowed to break the token system, why
the banner pattern won over the toast. That is the question that costs the most
time, and no tool reconstructs it.

## Decisions

`docs/DECISIONS.md`. Append only, newest at the top. Start at Tier 1.

```markdown
### 2026-08-30 | invoices | Overdue is a persistent banner, not a toast

**Priya, 2026-08-30:** "customers keep missing the overdue notice and then
dispute the late fee"

**Decided:** overdue renders as a persistent banner on the invoice list and
detail, dismissible per invoice and re-shown after seven days. Toasts stay for
transient confirmations only, because an overdue invoice is a state, not an
event, and state gets a persistent surface.

**Why not a toast:** it is gone in four seconds, and the people who miss it are
exactly the people who were not looking.

**Dead end:** we tried a badge on the sidebar count first. Nobody connected the
number to money owed.

**Boundary:** invoice states only. This does not license a banner for every
warning; the banner slot holds one message, worst first.
```

Four habits that make this worth keeping:

**Quote the person, with the date.** Six weeks later a paraphrase is
indistinguishable from a reconstruction. A quote is evidence, and it also records
what the actual problem was rather than the solution someone reached for.

**Record the dead ends.** Most of the value of a decision log is in the options
that lost. Without them, someone re-proposes the sidebar badge in March.

**Give exceptions a boundary.** "Boundary: invoice states only" is what stops a
pattern decision becoming precedent for every warning in the product.

**Never edit an old entry.** If you disagree, write a new one that supersedes it
and say so. The history of a changed mind is more useful than a tidy file.

The constitution should say the log is authoritative: settled decisions do not
get quietly re-opened in a pull request that looks routine.

## The build log {#build-log}

Tier 4, or Tier 3 if the team is changing.

A per-area document with a narrative at the top and a dated log at the bottom
that says what changed and, crucially, why. It stays current because a
post-commit hook feeds it.

`scripts/git-hooks/post-commit` appends one line per meaningful commit to
`docs/build-log/_pending.md`:

```
- [ ] `d3ee0e5` 2026-08-30 [ui] feat(invoices): overdue banner on list and detail (4 file(s))
```

That file is a raw feed, not the log. Later, you or an assistant turns each stub
into a dated entry that captures the reasoning, and ticks it off.

**Why a feed rather than just writing the log.** Nobody remembers to start a log.
Everybody can drain a queue. The hook converts an act of discipline into an act
of tidying, which is much easier to sustain.

**Rules for draining:**

- Capture the why and the dead ends, not the what. Git log already has the what.
- **Do not invent rationale.** If you do not know why, leave the stub unticked
  for a person. A fabricated reason is worse than a gap, because it will be
  believed.
- Tick or delete drained stubs, and commit the log edit alongside.

**Three things in the hook worth understanding**, because each one is a bug you
would otherwise hit:

```bash
# Skip replayed commits. During a rebase or cherry-pick these were already
# logged when first authored, and writing to the worktree here dirties it,
# which aborts the next pick mid-rebase.
if [ -d "$git_dir/rebase-merge" ] || [ -f "$git_dir/CHERRY_PICK_HEAD" ]; then exit 0; fi

# --root, or the very first commit in a repository logs nothing: diff-tree has
# no parent to compare against and silently prints an empty list, so the feed
# starts empty and looks like it is not wired up.
files="$(git diff-tree --root --no-commit-id --name-only -r HEAD)"

# Skip commits that only touch the build log, or the feed talks about itself.
real="$(printf '%s\n' "$files" | grep -vE '^docs/build-log/' || true)"
```

**Rapid mode.** During a burst of fast commits, a hook that dirties the worktree
every time is intolerable:

```bash
git config myproject.rapid true       # off: git config --unset myproject.rapid
```

Stubs are still written, to `.git/rapid-skipped-stubs`, which git ignores by
construction. Rapid means "do not touch my worktree", not "lose the feed". Two
principles here that generalise:

**An escape hatch that loses data will be used to lose data.** Spool, do not
skip.

**A silent bypass is how a feed dies without anyone noticing.** The hook prints a
reminder every single time rapid mode is on, and the session banner reports it
too.

## Session state {#session}

Tier 4, and Tier 3 if work gets picked up and put down.

`docs/PROGRESS.md`, with the resume block between markers so a tool can print it:

```markdown
<!-- RESUME:START -->
## Where to pick up

**State.** Invoice list and detail are done. The overdue banner is built, but
dismissing it is local state only and does not persist.

**Next step.** Store dismissals in user preferences, then remove the stub in
src/components/OverdueBanner.tsx:31.

**Open question.** Does dismissing on the list also dismiss on the detail?
Asked design 2026-08-28.
<!-- RESUME:END -->

## Archive
(older entries, so the block above stays small)
```

Four fields: state, next step, open questions, and relevant files or commits.

### The size cap is not optional

This is the mistake worth learning from someone else. In one project this block
grew to 101 KB and 25 dated entries, because entries were only ever appended.
That is roughly 25,000 tokens of month-old narrative injected ahead of every
session's actual work, before anyone typed anything.

**Cap it at about 3 KB and three or four entries.** Cold entries move to the
archive below the markers. Write the cap into the file itself, next to the
marker, so the next person knows it is deliberate:

```markdown
<!-- Keep this block under 3 KB and no more than four entries. Everything
     between the markers is printed into every session, so its length is a cost
     paid on every turn. Move cold entries to the archive below. -->
```

If you build a session-state mechanism, build the cap and the archive on day one.

### Update it only when it earns its keep

Update the block when someone asks you to, or when a session ends leaving real
resume state: an open question awaiting an answer, a half-finished multi-step
task, or a next step that is not obvious from the commit message.

Skip it for mechanical or fully-committed work. The commit already captured that,
and rewriting the block on top is pure cost.

This is a correction worth internalising: **assistant ceremony has a cost, and
the cost is paid on every turn.** One project had a hook nudging a session-state
rewrite at the end of every session, including sessions where everything was
already committed. It was removed and replaced with an explicit rule about what
counts as resume state.

### The session banner

`scripts/session-status.sh`. Runs when a session opens and by hand any time.

```
git:   3 behind origin/main. Pull before you start
build: 80% of the contract is implemented  (pnpm coverage for the breakdown)
flags: 1 flag past removal date: newInvoiceTable
run:   pnpm dev      the app          -> http://localhost:3000
       pnpm check    every gate, the way CI runs them
       pnpm doctor   what your machine is missing
## Where to pick up
...
```

Three rules that make it a banner people read.

**Never block on the network.** The git line reads local refs only, then fetches
in the background so the next session is accurate. A four-second banner gets
disabled.

**Silent unless it matters.** Lines with nothing to say print nothing. In the
example above there is no "hooks not wired" line and no "no .env.local" line,
because both are fine. A banner that always prints eight lines gets skimmed, and
then the one time it says something urgent nobody reads it.

**This is where the nags live.** Checks that cannot be commit gates get their
audience here, at the moment somebody has just arrived and can act on them. See
[chapter 3](03-gates.md).

Wire it into your assistant's session-start hook and also document it as a
command, so people can run it directly.

## Assistant permissions

Pre-approve the commands that cannot cause damage:

```json
"permissions": {
  "allow": [
    "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)",
    "Bash(pnpm check)", "Bash(pnpm doctor)", "Bash(pnpm coverage)"
  ]
}
```

This removes dozens of prompts per session, which is what keeps a person actually
reading the prompts that remain. Allowlist read-only and idempotent commands
only. Never allowlist anything that writes to a shared system.
