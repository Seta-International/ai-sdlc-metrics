#!/usr/bin/env bash
# bootstrap.sh — one-shot dev environment setup
#
# Usage:
#   sh scripts/bootstrap.sh          # copy .env files only
#   sh scripts/bootstrap.sh --full   # copy .env files + bun install + db:up + build packages + migrate
#
# Safe to re-run: existing .env files are never overwritten.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ── colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
RESET='\033[0m'

info()    { printf "${GREEN}[bootstrap]${RESET} %s\n" "$*"; }
warn()    { printf "${YELLOW}[bootstrap]${RESET} %s\n" "$*"; }
error()   { printf "${RED}[bootstrap]${RESET} %s\n" "$*" >&2; }
divider() { printf "\n%s\n\n" "────────────────────────────────────────────────"; }

# ── helpers ───────────────────────────────────────────────────────────────────
copy_env() {
  local src="$1"
  local dest="$2"
  if [ ! -f "$src" ]; then
    warn "Skipping $dest — no example file found at $src"
    return
  fi
  if [ -f "$dest" ]; then
    warn "Already exists, skipping: $dest"
  else
    cp "$src" "$dest"
    info "Created: $dest"
  fi
}

# ── Step 1: Copy all .env files ───────────────────────────────────────────────
divider
info "Step 1/5 — Copying .env files"
divider

copy_env ".env.example"                  ".env"
copy_env "apps/api/.env.example"         "apps/api/.env"
copy_env "apps/web-shell/.env.example"   "apps/web-shell/.env"
copy_env "agents/langfuse/.env.example"  "agents/langfuse/.env"

cat <<'NOTICE'

  ┌──────────────────────────────────────────────────────────────────────┐
  │ NEXT: fill in the blanks in your new .env files.                     │
  │                                                                      │
  │  .env                    → JWT_SECRET (any 32-char random string)    │
  │  apps/web-shell/.env     → NEXT_PUBLIC_TENANT_ID                     │
  │                            NEXT_PUBLIC_MICROSOFT_CLIENT_ID           │
  │                            MICROSOFT_CLIENT_SECRET                   │
  │                            NEXT_PUBLIC_MICROSOFT_TENANT_ID           │
  │  agents/langfuse/.env    → NEXTAUTH_SECRET (any 32-char random str)  │
  │                                                                      │
  │  For local dev without SSO, the LOCAL_DEV vars in .env.example       │
  │  let you skip the Entra setup entirely.                              │
  └──────────────────────────────────────────────────────────────────────┘

NOTICE

# ── Full mode ─────────────────────────────────────────────────────────────────
if [ "${1:-}" != "--full" ]; then
  info "Done. Run 'sh scripts/bootstrap.sh --full' to also install, build, and migrate."
  exit 0
fi

# ── Step 2: bun install ───────────────────────────────────────────────────────
divider
info "Step 2/5 — Installing dependencies (bun install)"
divider
bun install

# ── Step 3: Start Postgres + Redis ────────────────────────────────────────────
divider
info "Step 3/5 — Starting Postgres + Redis (docker compose)"
divider
bun run db:up

info "Waiting for Postgres to be ready..."
for i in $(seq 1 20); do
  if docker exec future-postgres pg_isready -U future -d future >/dev/null 2>&1; then
    info "Postgres is ready."
    break
  fi
  if [ "$i" -eq 20 ]; then
    error "Postgres did not become ready in time. Check: bun run db:logs"
    exit 1
  fi
  sleep 1
done

# ── Step 4: Build workspace packages ─────────────────────────────────────────
divider
info "Step 4/5 — Building workspace packages"
divider
bun run --filter "@future/*" build

# ── Step 5: Run migrations ────────────────────────────────────────────────────
divider
info "Step 5/5 — Running DB migrations"
divider
bun run db:migrate

# ── Done ──────────────────────────────────────────────────────────────────────
divider
info "Bootstrap complete. You're ready to dev."
echo ""
echo "  Start the API:          bun run dev --filter=@future/api"
echo "  Start API + shell:      bun run dev --filter=@future/api --filter=@future/web-shell"
echo "  Run unit tests:         bun run test:unit"
echo "  Provision a tenant:     bun run tenant:provision --name ... --slug ... --plan starter --admin-name ... --admin-email ..."
echo "  Stop local infra:       bun run db:down"
echo ""
echo "  Full guide: QUICKSTART.md"
echo ""
