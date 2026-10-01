#!/usr/bin/env bash
# Runs the database rule checks against the local Supabase stack.
#   ./scripts/test-db.sh            # uses the local stack
#   DB_URL=... ./scripts/test-db.sh # or a database you point it at
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

PSQL="$(command -v psql || true)"
if [ -z "$PSQL" ] && [ -x /opt/homebrew/opt/libpq/bin/psql ]; then
  PSQL=/opt/homebrew/opt/libpq/bin/psql
fi
if [ -z "$PSQL" ]; then
  echo "psql not found. Install libpq (brew install libpq) or add psql to PATH." >&2
  exit 1
fi

cd "$(dirname "$0")/.."
"$PSQL" "$DB_URL" -v ON_ERROR_STOP=1 -f tests/db/rules.test.sql
