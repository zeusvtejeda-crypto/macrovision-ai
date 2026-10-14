#!/usr/bin/env bash
# Prueba supabase/schema.sql en un Postgres local temporal (requiere binarios de PostgreSQL 15+).
# Uso: npm run test:sql
set -euo pipefail
cd "$(dirname "$0")/.."
PGBIN="${PGBIN:-$(dirname "$(command -v initdb || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
DIR="$(mktemp -d /var/tmp/nexo-pg.XXXX)"
RUN=()
if [ "$(id -u)" = 0 ]; then chown postgres "$DIR"; RUN=(runuser -u postgres --); fi
cp supabase/schema.sql supabase/tests/*.sql "$DIR/"; chmod 644 "$DIR"/*.sql
cleanup() { "${RUN[@]}" "$PGBIN/pg_ctl" -D "$DIR/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
"${RUN[@]}" "$PGBIN/initdb" -D "$DIR/data" -A trust -U postgres >/dev/null
"${RUN[@]}" "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p 5499 -k $DIR -c listen_addresses=''" -l "$DIR/log" start >/dev/null
PSQL=("${RUN[@]}" "$PGBIN/psql" -h "$DIR" -p 5499 -U postgres -v ON_ERROR_STOP=1 -qAt)
"${PSQL[@]}" -c "create database nexo" >/dev/null
"${PSQL[@]}" -d nexo -f "$DIR/mock_supabase.sql" 2>&1 | grep -v "wal_level\|HINT" || true
"${PSQL[@]}" -d nexo -f "$DIR/schema.sql" >/dev/null 2>&1
"${PSQL[@]}" -d nexo -f "$DIR/schema.sql" >/dev/null 2>&1   # idempotencia
"${PSQL[@]}" -d nexo -f "$DIR/assertions.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'
