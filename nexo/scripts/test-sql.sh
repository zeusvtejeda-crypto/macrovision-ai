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
"${RUN[@]}" "$PGBIN/initdb" -D "$DIR/data" -A trust -U postgres -E UTF8 --locale=C.UTF-8 >/dev/null
"${RUN[@]}" "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p 5499 -k $DIR -c listen_addresses=''" -l "$DIR/log" start >/dev/null
PSQL=("${RUN[@]}" "$PGBIN/psql" -h "$DIR" -p 5499 -U postgres -v ON_ERROR_STOP=1 -qAt)
"${PSQL[@]}" -c "create database nexo" >/dev/null
"${PSQL[@]}" -d nexo -f "$DIR/mock_supabase.sql" 2>&1 | grep -v "wal_level\|HINT" || true
apply_schema() { if ! "${PSQL[@]}" -d nexo -f "$DIR/schema.sql" >"$DIR/schema.out" 2>&1; then echo "FALLÓ schema.sql ($1):"; grep -v "NOTICE" "$DIR/schema.out" | tail -5; exit 1; fi; }
apply_schema "1ª vez"
apply_schema "2ª vez (idempotencia)"
"${PSQL[@]}" -d nexo -f "$DIR/assertions.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'

# Concurrencia: dos sesiones insertan 150 avisos cada una para el mismo usuario a la vez → el tope (200) se mantiene.
D="'00000000-0000-0000-0000-00000000000d'"
"${PSQL[@]}" -d nexo -c "insert into auth.users values ($D)" >/dev/null
TX="set role authenticated; select set_config('request.jwt.claim.sub', $D, false); begin;
insert into tasks (title, remind_at) select 'conc ' || g, now() + interval '1 day' from generate_series(1, 150) g;
select pg_sleep(1); commit;"
("${PSQL[@]}" -d nexo -c "$TX" >/dev/null 2>&1 || true) &
sleep 0.3
("${PSQL[@]}" -d nexo -c "$TX" >/dev/null 2>&1 || true) &
wait
N=$("${PSQL[@]}" -d nexo -c "select count(*) from tasks where user_id = $D and reminded_at is null and not done")
if [ "$N" -le 200 ]; then echo "  ok: tope de 200 con inserciones concurrentes ($N pendientes)"; else echo "FALLÓ: inserciones concurrentes superaron el tope ($N)"; exit 1; fi
