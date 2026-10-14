#!/usr/bin/env bash
# Aplica, en orden y con datos, los schema.sql de cada versión publicada y luego el actual (dos veces).
# Comprueba que la actualización conserva los datos. Uso: npm run test:migration
set -euo pipefail
cd "$(dirname "$0")/.."
VERSIONS=(7ad6899 57f92f4 73d9b51 ad31385 2c57352 9b80dcf)
PGBIN="${PGBIN:-$(dirname "$(command -v initdb || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
DIR="$(mktemp -d /var/tmp/nexo-mig.XXXX)"; RUN=()
if [ "$(id -u)" = 0 ]; then chown postgres "$DIR"; RUN=(runuser -u postgres --); fi
for v in "${VERSIONS[@]}"; do git show "$v:nexo/supabase/schema.sql" > "$DIR/s-$v.sql"; done
cp supabase/schema.sql "$DIR/s-new.sql"; cp supabase/tests/mock_supabase.sql "$DIR/"; chmod 644 "$DIR"/*.sql
cleanup() { "${RUN[@]}" "$PGBIN/pg_ctl" -D "$DIR/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
"${RUN[@]}" "$PGBIN/initdb" -D "$DIR/data" -A trust -U postgres -E UTF8 --locale=C.UTF-8 >/dev/null
"${RUN[@]}" "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p 5495 -k $DIR -c listen_addresses=''" -l "$DIR/log" start >/dev/null
P=("${RUN[@]}" "$PGBIN/psql" -h "$DIR" -p 5495 -U postgres -v ON_ERROR_STOP=1 -qAt)
"${P[@]}" -c "create database m" >/dev/null; "${P[@]}" -d m -f "$DIR/mock_supabase.sql" >/dev/null 2>&1
A=00000000-0000-0000-0000-00000000000a
apply() { if ! "${P[@]}" -d m -f "$DIR/s-$1.sql" >"$DIR/out" 2>&1; then echo "FALLÓ al aplicar $1:"; grep -v NOTICE "$DIR/out" | tail -3; exit 1; fi; echo "  ok: schema $1"; }
apply 7ad6899
"${P[@]}" -d m -c "insert into tasks (user_id, title, category) values ('$A', 'tarea v1', 'escuela'); insert into notes (user_id, content) values ('$A', 'nota v1'); insert into transactions (user_id, kind, amount, category) values ('$A', 'expense', 200, 'gasolina'); insert into memories (user_id, content) values ('$A', 'memoria v1')"
apply 57f92f4
"${P[@]}" -d m -c "insert into tasks (user_id, title, remind_at, reminded_at) values ('$A', 'aviso v2', now() - interval '1 day', now() - interval '1 day'); insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ('$A', 'https://web.push.apple.com/x', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg')"
apply 73d9b51; apply ad31385
"${P[@]}" -d m -c "insert into api_tokens (user_id, name, token_hash, prefix) values ('$A', 'token v4', '$(printf 'f%.0s' {1..64})', 'nexo_AbCd')"
apply 2c57352; apply 9b80dcf
apply new; apply new
"${P[@]}" -d m <<SQL
\set ON_ERROR_STOP 1
do \$\$ begin
  if (select count(*) from tasks) <> 2 then raise exception 'tareas perdidas'; end if;
  if (select status from tasks where title = 'tarea v1') <> 'pending' then raise exception 'status por defecto'; end if;
  if (select reminder_status from tasks where title = 'aviso v2') <> 'unknown' then raise exception 'backfill unknown'; end if;
  if (select version from tasks where title = 'tarea v1') <> 1 then raise exception 'version inicial'; end if;
  if (select count(*) from notes) + (select count(*) from transactions) + (select count(*) from memories) <> 3 then raise exception 'datos v1 perdidos'; end if;
  if (select scope from transactions limit 1) <> 'personal' or (select status from transactions limit 1) <> 'paid' then raise exception 'finanzas por defecto'; end if;
  if (select kind from memories limit 1) <> 'preference' then raise exception 'memoria por defecto'; end if;
  if (select count(*) from push_subscriptions) <> 1 or (select count(*) from api_tokens) <> 1 then raise exception 'push/tokens perdidos'; end if;
  if (select expires_at > now() from api_tokens) is not true then raise exception 'token sin caducidad'; end if;
end \$\$;
SQL
echo "MIGRACIÓN OK: datos conservados de v1 a la versión actual"
