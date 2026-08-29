#!/usr/bin/env bash
#
# Session start banner. Runs when a coding session opens, and by hand any time.
#
# Two jobs. It orients whoever just sat down: are you behind, what is running,
# where do you pick up. And it is where the checks that cannot be commit gates
# get their audience, because a check that needs credentials or the network has
# to nag somewhere, and the moment someone opens the repo is the moment they can
# act on it.
#
# THREE RULES.
#
# 1. Never block on the network. The git sync line reads local refs only, then
#    fetches in the background so the NEXT session is accurate. A banner that
#    takes four seconds is a banner people disable.
#
# 2. Silent unless it matters. Lines that have nothing to say print nothing. A
#    banner that always prints eight lines gets skimmed and then ignored, which
#    means the one time it says something urgent, nobody reads it.
#
# 3. Under a second, always. Everything here is a local file read or a git
#    plumbing command.
#
# Wire it into your agent's session-start hook, and add it to the README so
# people can run it directly:  bash scripts/session-status.sh

set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" || exit 0

# ------------------------------------------------------- 1. git position ---
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  branch=$(git branch --show-current 2>/dev/null || echo detached)
  if upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null); then
    behind=$(git rev-list --count "HEAD..$upstream" 2>/dev/null || echo 0)
    ahead=$(git rev-list --count "$upstream..HEAD" 2>/dev/null || echo 0)
    if   [ "$behind" -gt 0 ] && [ "$ahead" -gt 0 ]; then
      echo "git:   diverged from $upstream. $behind behind, $ahead ahead"
    elif [ "$behind" -gt 0 ]; then
      echo "git:   $behind behind $upstream. Pull before you start"
    elif [ "$ahead" -gt 0 ]; then
      echo "git:   $ahead unpushed commit(s) on $branch"
    fi
    # Silent when in sync. Rule 2.
  else
    echo "git:   $branch has no upstream branch set"
  fi
  dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  [ "$dirty" -gt 0 ] && echo "git:   $dirty uncommitted change(s)"

  # Refresh origin for next time. Never blocks.
  ( nohup git fetch --quiet >/dev/null 2>&1 & ) >/dev/null 2>&1
fi

# ----------------------------------------------------- 2. setup problems ---
# The two that silently disable everything else, so they are worth one line each.

hooks="$(git config core.hooksPath 2>/dev/null)"
if [ "$hooks" != "scripts/git-hooks" ]; then
  echo "setup: git hooks are NOT wired, so no checks run on commit."
  echo "       fix: git config core.hooksPath scripts/git-hooks"
fi

if [ -f .env.example ] && [ ! -f .env.local ]; then
  echo "setup: no .env.local. Run: cp .env.example .env.local"
fi

# ---------------------------------------------------------- 3. the nags ----
# Checks that cannot be commit gates because the person committing may not be
# able to satisfy them. See chapter 2 on the gate-versus-nag distinction.

# Contract coverage, if there is a contract. Offline and instant.
if [ -f contract.json ] && [ -f scripts/check-contract-coverage.mjs ]; then
  cov=$(node scripts/check-contract-coverage.mjs 2>/dev/null | grep -o 'Overall type-layer coverage: [0-9]*%' || true)
  [ -n "$cov" ] && echo "build: ${cov#Overall type-layer coverage: } of the contract is implemented  (pnpm coverage for the breakdown)"
fi

# Stale build-log stubs. A queue that grows forever is a queue nobody drains,
# so say the number out loud once it stops being small.
if [ -f docs/build-log/_pending.md ]; then
  pending=$(grep -c '^- \[ \]' docs/build-log/_pending.md 2>/dev/null || echo 0)
  [ "$pending" -gt 10 ] && echo "log:   $pending undrained build-log stub(s). Worth 10 minutes before they go cold"
fi

# Rapid mode left on. It is meant to be temporary, and forgetting it on is how
# the feed quietly stops.
if [ "$(git config --bool myproject.rapid 2>/dev/null)" = "true" ]; then
  spooled=$(wc -l < "$(git rev-parse --git-dir)/rapid-skipped-stubs" 2>/dev/null | tr -d ' ' || echo 0)
  echo "log:   rapid mode is ON, $spooled stub(s) spooled. Drain and: git config --unset myproject.rapid"
fi

# Flags past their removal date. Cheap to compute, and flag debt is the quiet
# killer of a long-lived SaaS codebase.
if [ -f src/lib/flags.json ]; then
  today=$(date +%Y-%m-%d)
  expired=$(node -e "
    const f=require('./src/lib/flags.json');
    const n=Object.entries(f).filter(([,v])=>v.removeBy && v.removeBy < '$today').map(([k])=>k);
    if(n.length) console.log(n.length + ' flag(s) past removal date: ' + n.join(', '));
  " 2>/dev/null || true)
  [ -n "$expired" ] && echo "flags: $expired"
fi

# ------------------------------------------------------- 4. how to run -----
echo "run:   pnpm dev      the app          -> http://localhost:3000"
echo "       pnpm check    every gate, the way CI runs them"
echo "       pnpm doctor   what your machine is missing"

# ------------------------------------------------------- 5. where to pick --
# Print the resume pointer, if there is one. Everything between the markers goes
# into the session verbatim, so the file has a hard size cap. See chapter 7.
if [ -f docs/PROGRESS.md ]; then
  awk '/<!-- RESUME:START -->/{flag=1;next}/<!-- RESUME:END -->/{flag=0}flag' docs/PROGRESS.md | head -40
fi

exit 0
