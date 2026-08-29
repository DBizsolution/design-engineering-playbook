#!/usr/bin/env bash
#
# Preflight for a fresh clone. Reports what is installed, what is missing, and
# the exact command that fixes each gap.
#
# THREE RULES, and they are what make the difference between a doctor script
# people run and one they ignore.
#
# 1. It never exits non-zero. A doctor that fails is a gate, and this is not a
#    gate. It is a diagnostic you run when something is wrong, and it has to
#    finish and print everything even when half the machine is missing.
#
# 2. Sections are labelled by role. A designer who only runs the web preview
#    should be able to see at a glance that the database section does not apply
#    to them. Without this, every missing item reads as "you are broken".
#
# 3. Every failure line contains its remedy. Not "pnpm missing", but
#    "pnpm missing. Run: npm i -g pnpm". The whole point is that the person
#    reading it does not have to go and ask someone.
#
# Run:  pnpm doctor

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" || exit 0

ok()   { printf "  [ ok ] %s\n" "$1"; }
warn() { printf "  [note] %s\n" "$1"; }
bad()  { printf "  [MISS] %s\n" "$1"; }

echo ""
echo "Checking your machine"
echo ""

# ------------------------------------------------------------------ CORE ---
echo "Core, needed for everything:"

if command -v node >/dev/null 2>&1; then
  ver=$(node -v); major=${ver#v}; major=${major%%.*}
  if [ "${major:-0}" -ge 20 ]; then ok "node $ver"
  else warn "node $ver is old. Install 20 or newer: https://nodejs.org or use nvm"; fi
else
  bad "node missing. Install Node 20+: https://nodejs.org"
fi

command -v pnpm >/dev/null 2>&1 \
  && ok "pnpm $(pnpm -v)" \
  || bad "pnpm missing. Run: npm i -g pnpm"

command -v git >/dev/null 2>&1 \
  && ok "git $(git --version | awk '{print $3}')" \
  || bad "git missing. Install Xcode command line tools: xcode-select --install"

if [ -d node_modules ]; then ok "dependencies installed"
else warn "node_modules missing. Run: pnpm install"; fi

# Hooks. This one is easy to miss and it silently disables every gate, so it is
# worth checking explicitly rather than assuming `prepare` ran.
hooks_path="$(git config core.hooksPath 2>/dev/null)"
if [ "$hooks_path" = "scripts/git-hooks" ]; then
  ok "git hooks wired (core.hooksPath = scripts/git-hooks)"
else
  bad "git hooks NOT wired, so no checks run on commit. Run: pnpm install (or: git config core.hooksPath scripts/git-hooks)"
fi

# --------------------------------------------------------------- SECRETS ---
echo ""
echo "Environment, needed to boot the app:"

if [ -f .env.local ]; then
  missing=""
  while IFS= read -r line; do
    case "$line" in ''|\#*) continue;; esac
    name="${line%%=*}"
    grep -q "^${name}=" .env.local 2>/dev/null || missing="${missing} ${name}"
  done < .env.example
  if [ -z "$missing" ]; then ok ".env.local has every variable from .env.example"
  else bad ".env.local is missing:${missing}. Ask the team, or see .env.example for where each one comes from"; fi
else
  bad ".env.local missing. Run: cp .env.example .env.local, then fill it in"
fi

# -------------------------------------------------------------- OPTIONAL ---
echo ""
echo "Optional, only if you work on these:"

command -v docker >/dev/null 2>&1 \
  && ok "docker present (local database)" \
  || warn "docker not found. Only needed to run the database locally"

command -v gh >/dev/null 2>&1 \
  && ok "gh present (pull requests from the terminal)" \
  || warn "gh not found. Only needed for PR commands. brew install gh"

if [ -f package.json ] && grep -q '"playwright"' package.json 2>/dev/null; then
  [ -d ~/Library/Caches/ms-playwright ] || [ -d ~/.cache/ms-playwright ] \
    && ok "playwright browsers installed" \
    || warn "playwright browsers not installed. Run: pnpm exec playwright install"
fi

# ------------------------------------------------------------------ HINT ---
echo ""
echo "If everything above is [ ok ] or [note], run: pnpm dev"
echo "For design work you only need the Core section."
echo ""

exit 0
