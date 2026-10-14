-- Pruebas de RLS, avisos y suscripciones push. Cada fallo lanza una excepción.
\set ON_ERROR_STOP 1
\set A '''00000000-0000-0000-0000-00000000000a'''
\set B '''00000000-0000-0000-0000-00000000000b'''
\set P256 '''BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM'''
\set AUTH '''tBHItJI5svbpez7KI4CCXg'''

create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FALLÓ: %', what; end if; raise notice 'ok: %', what; end $$;

-- ---------- Usuario A ----------
set role authenticated;
select set_config('request.jwt.claim.sub', :A, false) \g /dev/null
insert into tasks (title, remind_at) values
  ('vencida', now() - interval '1 minute'),
  ('futura', now() + interval '1 hour'),
  ('hecha', now() - interval '1 minute');
update tasks set done = true where title = 'hecha';
insert into transactions (kind, amount, category) values ('expense', 200, 'gasolina');
select pg_temp.check(public.register_push_subscription('https://web.push.apple.com/devA', :P256, :AUTH, 'iPhone') is not null, 'A registra su iPhone');
select pg_temp.check((select count(*) from push_subscriptions) = 1, 'A ve su suscripción');

-- Endpoint fuera de la lista (SSRF) → rechazado
do $$ begin
  perform public.register_push_subscription('https://169.254.169.254/x', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg');
  raise exception 'FALLÓ: aceptó endpoint no permitido';
exception when sqlstate '22023' then raise notice 'ok: endpoint no permitido rechazado'; end $$;

-- Inserción directa (sin la función) → sin permiso
do $$ begin
  insert into push_subscriptions (endpoint, p256dh, auth) values ('https://fcm.googleapis.com/fcm/send/x', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg');
  raise exception 'FALLÓ: insert directo permitido';
exception when insufficient_privilege then raise notice 'ok: insert directo bloqueado'; end $$;

-- authenticated no puede reclamar avisos (solo service_role)
do $$ begin
  perform public.claim_due_reminders(10);
  raise exception 'FALLÓ: authenticated pudo reclamar avisos';
exception when insufficient_privilege then raise notice 'ok: claim bloqueado para usuarios'; end $$;

-- ---------- Usuario B ----------
select set_config('request.jwt.claim.sub', :B, false) \g /dev/null
select pg_temp.check((select count(*) from tasks) = 0, 'B no ve tareas de A');
select pg_temp.check((select count(*) from push_subscriptions) = 0, 'B no ve dispositivos de A');
delete from push_subscriptions; -- no debe borrar nada de A
update tasks set remind_at = now() where true; -- no debe tocar nada de A
delete from tasks; -- tampoco
reset role;
select pg_temp.check((select count(*) from push_subscriptions where endpoint like '%devA') = 1, 'el DELETE de B no borró el iPhone de A');
select pg_temp.check((select count(*) from tasks) = 3, 'el DELETE de B no borró tareas de A');
select pg_temp.check((select remind_at > now() + interval '50 minutes' from tasks where title = 'futura'), 'el UPDATE de B no cambió avisos de A');
set role authenticated;

-- B inicia sesión en el mismo iPhone: el endpoint se reasigna a B
select count(*) from (select public.register_push_subscription('https://web.push.apple.com/devA', :P256, :AUTH, 'iPhone')) x \g /dev/null
select pg_temp.check((select count(*) from push_subscriptions) = 1, 'B ahora es dueño del dispositivo');

-- Límite de 10 dispositivos por usuario
do $$ declare g int; last_id uuid; begin
  for g in 1..12 loop
    last_id := public.register_push_subscription('https://fcm.googleapis.com/fcm/send/b' || g,
      'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg', 'Chrome');
    if not exists (select 1 from push_subscriptions where id = last_id) then raise exception 'FALLÓ: borró el dispositivo recién registrado'; end if;
  end loop;
end $$;
select pg_temp.check((select count(*) from push_subscriptions) = 10, 'máximo 10 dispositivos (conserva el recién registrado)');

-- ---------- Usuario A otra vez ----------
select set_config('request.jwt.claim.sub', :A, false) \g /dev/null
select pg_temp.check((select count(*) from push_subscriptions) = 0, 'A ya no recibe avisos en el iPhone de B');
select pg_temp.check((select count(*) from tasks where remind_at is not null) = 3, 'B no alteró las tareas de A');

-- ---------- Cron (service_role) ----------
reset role;
set role service_role;
select pg_temp.check((select count(*) from public.claim_due_reminders(100)) = 1, 'claim toma solo la vencida y pendiente');
select pg_temp.check((select count(*) from public.claim_due_reminders(100)) = 0, 'claim no repite');
select pg_temp.check((select remind_attempts from tasks where title = 'vencida') = 1, 'cuenta intentos');

-- Re-armar (reintento) y reprogramar
update tasks set reminded_at = null where title = 'vencida';
select pg_temp.check((select count(*) from public.claim_due_reminders(100)) = 1, 'reintento vuelve a reclamar');
select pg_temp.check((select remind_attempts from tasks where title = 'vencida') = 2, 'segundo intento');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :A, false) \g /dev/null
update tasks set remind_at = now() - interval '10 seconds' where title = 'vencida';
select pg_temp.check((select reminded_at is null and remind_attempts = 0 from tasks where title = 'vencida'), 'reprogramar re-arma el aviso');
update tasks set title = 'vencida (editada)' where title = 'vencida';
update tasks set title = 'vencida' where title = 'vencida (editada)';
select pg_temp.check((select reminded_at is null and remind_attempts = 0 from tasks where title = 'vencida'), 'editar el título no altera el estado del aviso');

-- El usuario no puede tocar las columnas del cron
do $$ begin
  update tasks set reminded_at = null, remind_attempts = -1000 where true;
  raise exception 'FALLÓ: authenticated escribió remind_attempts';
exception when insufficient_privilege then raise notice 'ok: columnas del cron protegidas (update)'; end $$;
do $$ begin
  insert into tasks (title, reminded_at) values ('x', now());
  raise exception 'FALLÓ: authenticated insertó reminded_at';
exception when insufficient_privilege then raise notice 'ok: columnas del cron protegidas (insert)'; end $$;
do $$ begin
  insert into tasks (title, remind_at) values ('x', '1970-01-01');
  raise exception 'FALLÓ: aceptó aviso en el pasado';
exception when sqlstate '22023' then raise notice 'ok: aviso en el pasado rechazado'; end $$;
do $$ begin
  update tasks set remind_at = '1970-01-01' where title = 'futura';
  raise exception 'FALLÓ: reprogramó al pasado';
exception when sqlstate '22023' then raise notice 'ok: reprogramar al pasado rechazado'; end $$;
reset role;

set role service_role;
select pg_temp.check((select count(*) from public.claim_due_reminders(100)) = 1, 'aviso reprogramado se envía otra vez');
reset role;

select pg_temp.check((select count(*) from tasks where done and reminded_at is not null) = 0, 'tareas completadas nunca se reclaman');

-- ---------- Tope de 200 avisos pendientes por usuario ----------
set role authenticated;
select set_config('request.jwt.claim.sub', :B, false) \g /dev/null
insert into tasks (title, remind_at) select 'spam ' || g, now() + interval '1 day' from generate_series(1, 200) g;
do $$ begin
  insert into tasks (title, remind_at) values ('201', now() + interval '1 day');
  raise exception 'FALLÓ: permitió más de 200 avisos pendientes';
exception when sqlstate '54000' then raise notice 'ok: tope de 200 avisos pendientes'; end $$;
reset role;

-- ---------- Cola justa: 1000 avisos viejos de B no bloquean el de A ----------
update tasks set remind_at = now() - interval '2 hours' where title like 'spam %';  -- como superusuario (simula datos)
insert into tasks (user_id, title, remind_at)
  select :B::uuid, 'spam extra ' || g, now() - interval '3 hours' from generate_series(1, 800) g;
insert into tasks (user_id, title, remind_at) values (:A::uuid, 'de A', now() - interval '1 minute');
set role service_role;
create temp table claimed as select * from public.claim_due_reminders(100);
reset role;
select pg_temp.check((select count(*) from claimed where title = 'de A') = 1, 'el aviso de A sale aunque B tenga 1000 en cola');
select pg_temp.check((select count(*) from claimed where user_id = :B::uuid) <= 5, 'máx. 5 avisos por usuario y ciclo');

-- ---------- Avisos con más de 12 h de retraso: expiran sin enviarse ----------
insert into tasks (user_id, title, remind_at) values (:A::uuid, 'muy vieja', now() - interval '13 hours');
set role service_role;
select pg_temp.check((select count(*) from public.claim_due_reminders(100) where title = 'muy vieja') = 0, 'aviso viejo no se envía');
reset role;
select pg_temp.check((select reminder_status = 'expired' and reminded_at is not null from tasks where title = 'muy vieja'), 'aviso viejo queda como expirado');
-- ---------- Desmarcar tareas no salta los límites ----------
set role authenticated;
select set_config('request.jwt.claim.sub', :A, false) \g /dev/null
insert into tasks (title, remind_at) values ('reabrir', now() + interval '1 hour');
update tasks set done = true where title = 'reabrir';
reset role;
update tasks set remind_at = now() - interval '2 hours' where title = 'reabrir'; -- el aviso venció mientras estaba hecha
set role authenticated;
select set_config('request.jwt.claim.sub', :A, false) \g /dev/null
update tasks set done = false, done_at = null where title = 'reabrir';
select pg_temp.check((select reminder_status = 'missed' and reminded_at is not null from tasks where title = 'reabrir'),
  'desmarcar una tarea con aviso vencido no lo dispara (queda missed)');
reset role;

insert into auth.users values ('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false) \g /dev/null
insert into tasks (title, remind_at) select 'lote ' || g, now() + interval '1 day' from generate_series(1, 200) g;
update tasks set done = true where title like 'lote %'; -- los "oculta" del conteo
insert into tasks (title, remind_at) values ('extra', now() + interval '1 day');
do $$ begin
  update tasks set done = false where title like 'lote %';
  raise exception 'FALLÓ: desmarcar permitió superar 200 pendientes';
exception when sqlstate '54000' then raise notice 'ok: desmarcar respeta el tope de 200'; end $$;
reset role;

-- ---------- Cola por turnos: 21 cuentas con 5+ avisos cada una no retrasan a A ----------
update tasks set reminded_at = now(), reminder_status = 'sent' where reminded_at is null; -- limpiar cola
insert into auth.users select ('00000000-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid from generate_series(1, 21) g;
insert into tasks (user_id, title, remind_at)
  select ('00000000-0000-0000-0000-0000000001' || lpad(u::text, 2, '0'))::uuid, 'ola', now() - interval '4 minutes'
  from generate_series(1, 21) u, generate_series(1, 10) n;
insert into tasks (user_id, title, remind_at) values (:A::uuid, 'aviso de A', now() - interval '1 minute');
set role service_role;
select pg_temp.check((select count(*) from public.claim_due_reminders(100) where title = 'aviso de A') = 1,
  'por turnos: el aviso de A sale en el primer ciclo aunque 21 cuentas tengan cola');
reset role;

-- ---------- Reclamos huérfanos (la función se cayó) → 'unknown', sin reenvío ----------
insert into tasks (user_id, title, remind_at, reminded_at) values (:A::uuid, 'huerfana', now() - interval '20 minutes', now() - interval '15 minutes');
set role service_role;
select pg_temp.check((select count(*) from public.claim_due_reminders(100) where title = 'huerfana') = 0, 'reclamo huérfano no se reenvía');
reset role;
select pg_temp.check((select reminder_status = 'unknown' from tasks where title = 'huerfana'), 'reclamo huérfano queda como desconocido');

-- ---------- Suscripciones caducadas (gone_at) ----------
set role authenticated;
select set_config('request.jwt.claim.sub', :A, false) \g /dev/null
select count(*) from (select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/a-mac', :P256, :AUTH, 'Mac')) x \g /dev/null
reset role;
select id as amac from push_subscriptions where endpoint like '%a-mac' \gset
set role authenticated;
select set_config('request.jwt.claim.sub', :B, false) \g /dev/null
-- B intenta marcar como caducado el Mac de A pasando su id
select public.mark_push_gone(array[:'amac']::uuid[]) \g /dev/null
reset role;
select pg_temp.check((select gone_at is null from push_subscriptions where endpoint like '%a-mac'), 'mark_push_gone no toca dispositivos de otros');
update push_subscriptions set gone_at = now() where endpoint like '%a-mac';
set role authenticated;
select set_config('request.jwt.claim.sub', :A, false) \g /dev/null
select count(*) from (select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/a-mac', :P256, :AUTH, 'Mac')) x \g /dev/null
select pg_temp.check((select gone_at is null from push_subscriptions where endpoint like '%a-mac'), 're-registrar limpia gone_at');
reset role;
-- Límite de 10: las caducadas ceden su lugar antes que las activas
delete from push_subscriptions where user_id = :A::uuid;
insert into push_subscriptions (user_id, endpoint, p256dh, auth, created_at, gone_at)
  select :A::uuid, 'https://fcm.googleapis.com/fcm/send/vivo' || g, :P256, :AUTH, now() - (g || ' days')::interval, null
  from generate_series(1, 7) g
  union all
  select :A::uuid, 'https://fcm.googleapis.com/fcm/send/muerto' || g, :P256, :AUTH, now(), now()
  from generate_series(1, 3) g;
set role authenticated;
select set_config('request.jwt.claim.sub', :A, false) \g /dev/null
select count(*) from (select public.register_push_subscription('https://web.push.apple.com/nuevo', :P256, :AUTH, 'iPhone')) x \g /dev/null
reset role;
select pg_temp.check((select count(*) from push_subscriptions where user_id = :A::uuid and gone_at is null) = 8,
  'límite de 10: 7 activas + 1 nueva se conservan; se descarta una caducada');

-- Rotación con la cuenta llena (10): reemplazar no desaloja a ningún otro dispositivo
delete from push_subscriptions where user_id = :A::uuid;
insert into push_subscriptions (user_id, endpoint, p256dh, auth, created_at)
  select :A::uuid, 'https://fcm.googleapis.com/fcm/send/otro' || g, :P256, :AUTH, now() - (g || ' days')::interval
  from generate_series(1, 9) g;
insert into push_subscriptions (user_id, endpoint, p256dh, auth) values (:A::uuid, 'https://web.push.apple.com/ipad-viejo', :P256, :AUTH);
set role authenticated;
select set_config('request.jwt.claim.sub', :A, false) \g /dev/null
select count(*) from (select public.register_push_subscription('https://web.push.apple.com/ipad-nuevo', :P256, :AUTH, 'iPad',
  'https://web.push.apple.com/ipad-viejo')) x \g /dev/null
reset role;
select pg_temp.check((select count(*) from push_subscriptions where user_id = :A::uuid and endpoint like '%otro%') = 9
  and not exists (select 1 from push_subscriptions where endpoint like '%ipad-viejo')
  and exists (select 1 from push_subscriptions where endpoint like '%ipad-nuevo'),
  'rotación con 10 dispositivos: reemplaza sin desalojar a otro');

-- ---------- Desmarcar: estado 'missed' (no 'expired') ----------
select pg_temp.check((select reminder_status from tasks where title = 'reabrir') = 'missed', 'desmarcar tarde → missed');

-- ---------- Siri y Atajos: tokens personales ----------
set role authenticated;
select set_config('request.jwt.claim.sub', :A, false) \g /dev/null
insert into api_tokens (name, token_hash, prefix, time_zone) values ('iPhone', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'nexo_AbCd', 'America/Mexico_City');
select pg_temp.check((select count(*) from api_tokens) = 1, 'A ve su token');
do $$ begin
  perform token_hash from api_tokens;
  raise exception 'FALLÓ: el navegador puede leer token_hash';
exception when insufficient_privilege then raise notice 'ok: token_hash no es legible desde el navegador'; end $$;
do $$ begin
  insert into api_tokens (name, token_hash, prefix, user_id) values ('x', 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', 'nexo_AbCd', '00000000-0000-0000-0000-00000000000b');
  raise exception 'FALLÓ: insertó token para otra cuenta';
exception when insufficient_privilege then raise notice 'ok: no puede crear tokens para otra cuenta'; end $$;
do $$ begin
  update api_tokens set window_count = -999;
  raise exception 'FALLÓ: editó contadores';
exception when insufficient_privilege then raise notice 'ok: contadores protegidos'; end $$;
do $$ begin
  perform public.use_api_token('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  raise exception 'FALLÓ: authenticated pudo usar use_api_token';
exception when insufficient_privilege then raise notice 'ok: use_api_token solo para el servidor'; end $$;
select set_config('request.jwt.claim.sub', :B, false) \g /dev/null
select pg_temp.check((select count(*) from api_tokens) = 0, 'B no ve tokens de A');
delete from api_tokens;
reset role;
select pg_temp.check((select count(*) from api_tokens) = 1, 'B no puede revocar tokens de A');

set role service_role;
select pg_temp.check((select user_id = :A::uuid and allowed and time_zone = 'America/Mexico_City' from public.use_api_token('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 3, 100)), 'token válido → usuario A');
select pg_temp.check((select count(*) from public.use_api_token('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 3, 100)) = 0, 'token desconocido → nada');
select pg_temp.check((select allowed from public.use_api_token('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 3, 100)), '2º uso permitido');
select pg_temp.check((select allowed from public.use_api_token('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 3, 100)), '3er uso permitido');
select pg_temp.check((select not allowed from public.use_api_token('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 3, 100)), '4º uso en el mismo minuto → límite');
update api_tokens set window_start = now() - interval '2 minutes';
select pg_temp.check((select allowed from public.use_api_token('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 3, 100)), 'pasado el minuto se permite de nuevo');
update api_tokens set day_count = 100, day_start = (now() at time zone 'utc')::date, window_start = null;
select pg_temp.check((select not allowed from public.use_api_token('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 3, 100)), 'límite diario');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :A, false) \g /dev/null
delete from api_tokens where name = 'iPhone';
reset role;
set role service_role;
select pg_temp.check((select count(*) from public.use_api_token('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')) = 0, 'token revocado deja de funcionar');
reset role;

-- Tokens vencidos no funcionan; tope diario por cuenta (suma de tokens)
insert into api_tokens (user_id, name, token_hash, prefix, expires_at) values (:A::uuid, 'viejo', 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 'nexo_AbCd', now() - interval '1 day');
set role service_role;
select pg_temp.check((select count(*) from public.use_api_token('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')) = 0, 'token vencido → nada');
reset role;
delete from api_tokens where name = 'viejo';
insert into api_tokens (user_id, name, token_hash, prefix, day_start, day_count) values
  (:A::uuid, 'uno', '1111111111111111111111111111111111111111111111111111111111111111', 'nexo_AbCd', (now() at time zone 'utc')::date, 250),
  (:A::uuid, 'dos', '2222222222222222222222222222222222222222222222222222222222222222', 'nexo_AbCd', (now() at time zone 'utc')::date, 250);
set role service_role;
select pg_temp.check((select not allowed from public.use_api_token('1111111111111111111111111111111111111111111111111111111111111111', 20, 300, 500)), 'tope diario por cuenta (500 entre todos sus tokens)');
reset role;
delete from api_tokens where name in ('uno', 'dos');
select pg_temp.check(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_messages'),
  'chat_messages en Realtime (lo dicho por Siri aparece en un chat abierto)');

-- Máximo 10 tokens por cuenta
set role authenticated;
select set_config('request.jwt.claim.sub', :A, false) \g /dev/null
insert into api_tokens (name, token_hash, prefix) select 't' || g, lpad(to_hex(g), 64, '0'), 'nexo_AbCd' from generate_series(1, 10) g;
do $$ begin
  insert into api_tokens (name, token_hash, prefix) values ('11', 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd', 'nexo_AbCd');
  raise exception 'FALLÓ: más de 10 tokens';
exception when sqlstate '54000' then raise notice 'ok: máximo 10 tokens por cuenta'; end $$;
reset role;

-- Siri actúa con service_role: los avisos siguen validándose (no en el pasado)
set role service_role;
do $$ begin
  insert into tasks (user_id, title, remind_at) values ('00000000-0000-0000-0000-00000000000a', 'x', now() - interval '1 hour');
  raise exception 'FALLÓ: service_role creó un aviso en el pasado';
exception when sqlstate '22023' then raise notice 'ok: avisos validados también para service_role'; end $$;
-- Todo lo que hace api/shortcut.js (herramientas + historial) con service_role
insert into tasks (user_id, title, remind_at) values (:A::uuid, 'siri tarea', now() + interval '1 hour');
update tasks set done = true, done_at = now() where title = 'siri tarea' and user_id = :A::uuid;
insert into notes (user_id, content) values (:A::uuid, 'siri nota');
insert into transactions (user_id, kind, amount, category) values (:A::uuid, 'expense', 50, 'café');
insert into memories (user_id, content) values (:A::uuid, 'siri memoria');
insert into chat_messages (user_id, role, content) values (:A::uuid, 'user', 'hola'), (:A::uuid, 'assistant', 'hola');
select count(*) from notes where user_id = :A::uuid \g /dev/null
select count(*) from push_subscriptions where user_id = :A::uuid and gone_at is null \g /dev/null
reset role;
select pg_temp.check((select count(*) from notes where content = 'siri nota') = 1, 'service_role puede hacer todo el flujo de Siri');

\echo TODAS LAS PRUEBAS SQL PASARON
