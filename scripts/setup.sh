#!/usr/bin/env bash
# setup.sh — one-shot dev environment setup
#
# Usage:
#   sh scripts/setup.sh          # copy .env files only
#   sh scripts/setup.sh --full   # copy .env files + bun install + db:up + build packages + migrate
#   sh scripts/setup.sh --clean  # remove .env files, stop Docker, wipe volumes + build outputs
#   sh scripts/setup.sh --clean --hard  # --clean + also remove node_modules
#
# Safe to re-run: existing .env files are skipped; missing keys are backfilled.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ── colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
RESET='\033[0m'

info()    { printf "${GREEN}[setup]${RESET} %s\n" "$*"; }
warn()    { printf "${YELLOW}[setup]${RESET} %s\n" "$*"; }
error()   { printf "${RED}[setup]${RESET} %s\n" "$*" >&2; }
divider() { printf "\n%s\n\n" "────────────────────────────────────────────────"; }

# ── Clean mode ────────────────────────────────────────────────────────────────
if [ "${1:-}" = "--clean" ]; then
  HARD="${2:-}"

  divider
  info "Step 1 — Removing generated .env files"
  divider

  remove_env() {
    if [ -f "$1" ]; then rm "$1" && info "Removed: $1"; else warn "Not found, skipping: $1"; fi
  }
  remove_env ".env"
  remove_env "apps/api/.env"
  remove_env "apps/web-shell/.env"

  divider
  info "Step 2 — Stopping Docker containers and removing volumes"
  divider
  if docker info >/dev/null 2>&1; then
    docker compose -f docker-compose.local.yml down -v --remove-orphans
    info "Docker containers and volumes removed."
  else
    warn "Docker is not running — skipping."
  fi

  divider
  info "Step 3 — Removing Turbo cache (.turbo/)"
  divider
  if [ -d ".turbo" ]; then rm -rf .turbo && info "Removed: .turbo/"; else warn "Not found, skipping: .turbo/"; fi

  divider
  info "Step 4 — Removing dist/ outputs from packages/*"
  divider
  for pkg_dir in packages/*/; do
    if [ -d "${pkg_dir}dist" ]; then rm -rf "${pkg_dir}dist" && info "Removed: ${pkg_dir}dist"; fi
  done

  if [ "$HARD" = "--hard" ]; then
    divider
    info "Step 5 — Removing node_modules (--hard)"
    divider
    rm -rf node_modules && info "Removed: node_modules/"
    find apps packages -maxdepth 2 -name node_modules -type d -exec rm -rf {} + 2>/dev/null || true
    info "Removed any nested node_modules/"
  fi

  divider
  info "Clean complete. Re-run with: bun run setup:full"
  if [ "$HARD" != "--hard" ]; then
    echo ""
    echo "  Tip: use --hard to also remove node_modules:"
    echo "       bun run setup:clean -- --hard"
  fi
  echo ""
  exit 0
fi

# ── helpers ───────────────────────────────────────────────────────────────────
copy_env() {
  local src="$1"
  local dest="$2"
  if [ ! -f "$src" ]; then
    warn "Skipping $dest — no example file found at $src"
    return
  fi
  if [ ! -f "$dest" ]; then
    cp "$src" "$dest"
    info "Created: $dest"
    return
  fi
  # File exists — backfill any keys present in example but missing in dest
  local added=0
  while IFS= read -r line; do
    key="$(printf '%s' "$line" | grep -E '^[A-Za-z_][A-Za-z0-9_]*=' | cut -d= -f1 || true)"
    if [ -n "$key" ] && ! grep -qE "^${key}=" "$dest"; then
      printf '\n%s' "$line" >> "$dest"
      info "Backfilled missing key into $dest: $key"
      added=$((added + 1))
    fi
  done < "$src"
  if [ "$added" -eq 0 ]; then
    warn "Already exists (up to date), skipping: $dest"
  fi
}

# ── Prompt helper ─────────────────────────────────────────────────────────────
# ask_env <file> <KEY> <default> <description>
# Prompts user for a value; pressing Enter accepts the default.
# Writes/replaces the key in the target file.
ask_env() {
  local file="$1" key="$2" default="$3" desc="$4"
  # Skip if key already has a non-placeholder value
  local current
  current="$(grep -m1 "^${key}=" "$file" 2>/dev/null | cut -d= -f2- || true)"
  if [ -n "$current" ] && [ "$current" != "$default" ]; then
    info "  $key already set in $file — skipping"
    return
  fi
  printf "${GREEN}[setup]${RESET} %s\n" "$desc"
  printf "  ${YELLOW}%s${RESET} [default: %s]: " "$key" "$default"
  if [ -t 0 ] || [ -e /dev/tty ]; then
    read -r input </dev/tty || input=""
  else
    input=""
  fi
  local value="${input:-$default}"
  # Replace or append the key
  if grep -qE "^${key}=" "$file"; then
    # Use a temp file for portability (no sed -i on all shells)
    local tmp
    tmp="$(mktemp)"
    grep -v "^${key}=" "$file" > "$tmp"
    printf '%s=%s\n' "$key" "$value" >> "$tmp"
    mv "$tmp" "$file"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$file"
  fi
  info "  Set $key in $file"
}

# ── Step 1: Copy all .env files ───────────────────────────────────────────────
divider
info "Step 1/6 — Copying .env files"
divider

copy_env ".env.example"                  ".env"
copy_env "apps/api/.env.example"         "apps/api/.env"
copy_env "apps/web-shell/.env.example"   "apps/web-shell/.env"

# ── Interactive prompts for required keys ─────────────────────────────────────
divider
info "Configuring required keys (press Enter to accept the default)"
divider

ask_env "apps/api/.env" \
  "JWT_SECRET" \
  "local-dev-secret-change-in-production" \
  "JWT signing secret for the API"

echo ""
warn "SSO keys (needed for Microsoft Entra login — skip for local dev with LOCAL_DEV=1):"
ask_env "apps/web-shell/.env" \
  "NEXT_PUBLIC_MICROSOFT_CLIENT_ID" \
  "" \
  "Entra app client ID (Azure portal → App registrations)"
ask_env "apps/web-shell/.env" \
  "MICROSOFT_CLIENT_SECRET" \
  "" \
  "Entra app client secret"
ask_env "apps/web-shell/.env" \
  "NEXT_PUBLIC_MICROSOFT_TENANT_ID" \
  "" \
  "Entra tenant ID"

echo ""
warn "AI keys (optional for local dev — agents will be disabled without OPENAI_API_KEY):"
ask_env "apps/api/.env" \
  "OPENAI_API_KEY" \
  "" \
  "OpenAI API key (get from platform.openai.com — leave blank to disable agents locally)"

echo ""

# ── Full mode ─────────────────────────────────────────────────────────────────
if [ "${1:-}" != "--full" ]; then
  info "Done. Run 'sh scripts/setup.sh --full' to also install, build, and migrate."
  exit 0
fi

# ── Step 2: bun install ───────────────────────────────────────────────────────
divider
info "Step 2/6 — Installing dependencies (bun install)"
divider
bun install

# ── Step 3: Start Postgres + Redis ────────────────────────────────────────────
divider
info "Step 3/6 — Starting Postgres + Redis (docker compose)"
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
info "Step 4/6 — Building workspace packages"
divider
bun run --filter "@future/*" build

# ── Step 5: Run migrations ────────────────────────────────────────────────────
divider
info "Step 5/6 — Running DB migrations"
divider
# bun run --cwd changes the working directory, so apps/api/.env is not
# auto-loaded. Export DATABASE_URL explicitly from apps/api/.env first.
if [ -f "apps/api/.env" ]; then
  export DATABASE_URL
  DATABASE_URL="$(grep -m1 '^DATABASE_URL=' apps/api/.env | cut -d= -f2-)"
fi
bun run db:migrate

# ── Step 6: Seed ─────────────────────────────────────────────────────────────
divider
info "Step 6/6 — Seeding database"
divider
bun run db:seed

# ── Done ──────────────────────────────────────────────────────────────────────
divider
info "Setup complete. You're ready to dev."
echo ""
echo "  Start the API:          bun run dev --filter=@future/api"
echo "  Start API + shell:      bun run dev --filter=@future/api --filter=@future/web-shell"
echo "  Run unit tests:         bun run test:unit"
echo "  Provision a tenant:     bun run tenant:provision --name ... --slug ... --plan starter --admin-name ... --admin-email ..."
echo "  Stop local infra:       bun run db:down"
echo ""
echo "  Full guide: QUICKSTART.md"
echo ""
