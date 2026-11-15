#!/usr/bin/env bash
# Runs the Supabase migrations + RLS test-suite against a throwaway local PostgreSQL.
# Requires PostgreSQL 15+ server binaries (initdb, pg_ctl). Usage: npm run test:db
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[ -x "$PGBIN/initdb" ] || PGBIN="$(dirname "$(command -v initdb)")"
TMP="$(mktemp -d)"
PORT="${PGPORT_TEST:-55432}"
RUN_AS=""
if [ "$(id -u)" = "0" ]; then
  RUN_AS="runuser -u postgres --"
  chown postgres "$TMP"
fi
cleanup() { $RUN_AS "$PGBIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
$RUN_AS "$PGBIN/initdb" -D "$TMP/data" -U postgres -A trust >/dev/null
$RUN_AS "$PGBIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" start -w >/dev/null
PSQL=(psql -h "$TMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -f "$ROOT/supabase/tests/00_supabase_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ applying $(basename "$f")"
  "${PSQL[@]}" -c "set client_min_messages = warning" -f "$f"
done
echo "→ running RLS tests"
"${PSQL[@]}" -t -o /dev/null -f "$ROOT/supabase/tests/01_rls.test.sql" 2>&1 | sed -E 's/^psql:[^ ]+ (NOTICE|ERROR):  /\1 /'
exit "${PIPESTATUS[0]}"
