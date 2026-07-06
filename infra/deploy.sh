#!/usr/bin/env bash
# Idempotent prod deploy for the Grafana dashboards + reporting schema.
# Runs on the prod host (ai-srv) — directly, or via the self-hosted GitHub
# Actions runner (.github/workflows/deploy-dashboards.yml).
#
#   bash infra/deploy.sh
#
# DB credentials come from the environment (REPORTING_DB_HOST /
# REPORTING_DB_PASSWORD — set as GitHub Actions secrets); if absent, they are
# sourced from infra/docker/.env on the host. Nothing is destructive:
# init.sql is CREATE ... IF NOT EXISTS + threshold seed with ON CONFLICT DO
# NOTHING; views.sql is DROP VIEW IF EXISTS + recreate. Existing metric_counts
# and manual_inputs data is preserved.
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
DB_USER="${REPORTING_DB_USER:-reporting}"
DB_NAME="${REPORTING_DB_NAME:-reporting}"
GRAFANA_CONTAINER="${GRAFANA_CONTAINER:-ai-sdlc-metrics-grafana}"
cd "$REPO_DIR"

# Credentials: prefer the environment (CI secrets); fall back to the host .env.
if [[ -z "${REPORTING_DB_HOST:-}" || -z "${REPORTING_DB_PASSWORD:-}" ]]; then
  echo "→ sourcing DB credentials from infra/docker/.env"
  set -a; . infra/docker/.env; set +a
fi
: "${REPORTING_DB_HOST:?REPORTING_DB_HOST is required}"
: "${REPORTING_DB_PASSWORD:?REPORTING_DB_PASSWORD is required}"

psql_file() {  # $1 = path to a .sql file, piped into psql inside a throwaway container
  docker run -i --rm --network host -e PGPASSWORD="$REPORTING_DB_PASSWORD" \
    postgres:17-alpine psql -h "$REPORTING_DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
    -v ON_ERROR_STOP=1 -f - < "$1"
}

echo "== 1/4 apply schema (idempotent) =="
psql_file infra/db/init.sql
psql_file infra/db/views.sql

echo "== 2/4 regenerate dashboards =="
python3 infra/grafana/generate.py

echo "== 3/4 restart Grafana so it re-provisions =="
docker restart "$GRAFANA_CONTAINER"

echo "== 4/4 health check =="
sleep 6
if ! docker ps --filter "name=$GRAFANA_CONTAINER" --filter status=running -q | grep -q .; then
  echo "ERROR: $GRAFANA_CONTAINER is not running after restart" >&2
  exit 1
fi
if docker logs "$GRAFANA_CONTAINER" 2>&1 | grep -q "finished to provision dashboards"; then
  echo "✓ deploy OK — Grafana running and dashboards provisioned"
else
  echo "WARNING: could not confirm dashboard provisioning in logs; check manually" >&2
fi
