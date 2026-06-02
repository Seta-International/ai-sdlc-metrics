#!/usr/bin/env bash
set -euo pipefail

# Run from repo root or scripts/ — docker compose lives in db/
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DB_DIR="$SCRIPT_DIR/../db"
PSQL="docker compose -f $DB_DIR/docker-compose.yml exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d hackathon"
OUT="${1:-$SCRIPT_DIR/../datasets/output}"

mkdir -p "$OUT"

tables=$($PSQL -t -A -c \
  "SELECT schemaname||'.'||tablename FROM pg_tables
   WHERE schemaname IN ('core','pmo','ta','elc','lnd')
   ORDER BY schemaname, tablename;")

count=0
for qualified in $tables; do
  schema="${qualified%%.*}"
  table="${qualified##*.}"
  file="$OUT/${schema}__${table}.csv"
  echo ">> $file"
  $PSQL -c "\copy (SELECT * FROM ${schema}.${table}) TO STDOUT CSV HEADER" > "$file"
  count=$((count + 1))
done

echo "Done — $count CSV files in $OUT/"
