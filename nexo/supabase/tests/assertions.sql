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

-- ---------- Horas de silencio ----------
select pg_temp.check(not public.in_quiet_hours(:A::uuid), 'sin prefs → no hay silencio');
set role authenticated;
select set_config('request.jwt.claim.sub', :A, false) \g /dev/null
select public.ensure_defaults() \g /dev/null
update settings set prefs = '{"quiet_from":"22:00","quiet_to":"07:00"}', time_zone = 'America/Mazatlan';
reset role;
select pg_temp.check(public.in_quiet_hours(:A::uuid, '2026-10-14T06:30:00-07:00'), '06:30 Mazatlán está en silencio (22→07)');
select pg_temp.check(not public.in_quiet_hours(:A::uuid, '2026-10-14T12:00:00-07:00'), '12:00 no está en silencio');
select pg_temp.check(public.in_quiet_hours(:A::uuid, '2026-10-14T23:30:00-07:00'), '23:30 está en silencio');
update tasks set remind_at = now() - interval '1 minute', reminded_at = null, reminder_status = null where title = 'de A';
update settings set prefs = jsonb_build_object('quiet_from', to_char((now() at time zone 'America/Mazatlan') - interval '1 hour', 'HH24:MI'), 'quiet_to', to_char((now() at time zone 'America/Mazatlan') + interval '1 hour', 'HH24:MI')) where user_id = :A::uuid;
set role service_role;
select pg_temp.check((select count(*) from public.claim_due_reminders(100) where title = 'de A') = 0, 'en horas de silencio el aviso se pospone');
reset role;
update settings set prefs = '{}' where user_id = :A::uuid;
set role service_role;
select pg_temp.check((select count(*) from public.claim_due_reminders(100) where title = 'de A') = 1, 'al salir del silencio se envía');
reset role;

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
select pg_temp.check((select not allowed and reason = 'minute' from public.use_api_token('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 3, 100)), '4º uso en el mismo minuto → límite (motivo: minute)');
do $$ declare i int; begin for i in 1..25 loop perform public.use_api_token('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 3, 100); end loop; end $$;
select pg_temp.check((select window_count = 3 and day_count = 3 from api_tokens where name = 'iPhone'), 'las solicitudes rechazadas no cuentan');
update api_tokens set window_start = now() - interval '2 minutes';
select pg_temp.check((select allowed from public.use_api_token('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 3, 100)), 'pasado el minuto se permite de nuevo');
update api_tokens set day_count = 100, day_start = (now() at time zone 'utc')::date, window_start = null;
select pg_temp.check((select not allowed and reason = 'token_day' from public.use_api_token('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 3, 100)), 'límite diario (motivo: token_day)');
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
select pg_temp.check((select not allowed and reason = 'account_day' from public.use_api_token('1111111111111111111111111111111111111111111111111111111111111111', 20, 300, 500)), 'tope diario por cuenta (500 entre todos sus tokens; motivo: account_day)');
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


-- ============================================================
-- v2: valores iniciales, sincronización, deshacer, repetición, acuerdos, búsqueda, aislamiento
-- ============================================================
set role authenticated;
select set_config('request.jwt.claim.sub', :A, false) \g /dev/null
select public.ensure_defaults() \g /dev/null
select public.ensure_defaults() \g /dev/null
select pg_temp.check((select count(*) from areas) = 3 and (select count(*) from settings) = 1, 'ensure_defaults crea ajustes y 3 áreas una sola vez');
select pg_temp.check((select time_zone = 'America/Mazatlan' and currency = 'MXN' from settings), 'valores por defecto: Mazatlán / MXN');

select public.rotate_ics_token() as ics1 \gset
select public.rotate_ics_token() as ics2 \gset
select pg_temp.check(length(:'ics1') = 64 and :'ics1' <> :'ics2' and (select ics_token = :'ics2' from settings), 'rotate_ics_token genera y rota el token');
do $$ begin
  update settings set ics_token = 'x';
  raise exception 'FALLÓ: el usuario escribió ics_token';
exception when insufficient_privilege then raise notice 'ok: ics_token solo lo escribe el servidor'; end $$;

-- sync_push: crear con id del cliente, actualizar con versión, conflicto, borrar
select public.sync_push('[{"table":"tasks","id":"11111111-1111-1111-1111-111111111111","op":"upsert","base_version":null,
  "row":{"title":"Sincronizada","priority":2,"status":"pending","reminded_at":"2020-01-01T00:00:00Z","user_id":"00000000-0000-0000-0000-00000000000b"}}]'::jsonb) as r \gset
select pg_temp.check((:'r'::jsonb)->0->>'status' = 'applied' and ((:'r'::jsonb)->0->>'version')::int = 1, 'sync: crear → applied v1');
select pg_temp.check((select reminded_at is null and user_id = :A::uuid and priority = 2 from tasks where id = '11111111-1111-1111-1111-111111111111'),
  'sync: ignora columnas de solo lectura y user_id ajeno');
select public.sync_push('[{"table":"tasks","id":"11111111-1111-1111-1111-111111111111","op":"upsert","base_version":1,"row":{"title":"Editada en iPhone"}}]'::jsonb) as r \gset
select pg_temp.check((:'r'::jsonb)->0->>'status' = 'applied' and ((:'r'::jsonb)->0->>'version')::int = 2, 'sync: actualizar con versión correcta → v2');
select public.sync_push('[{"table":"tasks","id":"11111111-1111-1111-1111-111111111111","op":"upsert","base_version":1,"row":{"title":"Editada en Mac (vieja)"}}]'::jsonb) as r \gset
select pg_temp.check((:'r'::jsonb)->0->>'status' = 'conflict' and (:'r'::jsonb)->0->'server'->>'title' = 'Editada en iPhone', 'sync: versión vieja → conflicto con la fila del servidor');
select pg_temp.check((select title from tasks where id = '11111111-1111-1111-1111-111111111111') = 'Editada en iPhone', 'sync: el conflicto no sobrescribe');
select public.sync_push('[{"table":"tasks","id":"11111111-1111-1111-1111-111111111111","op":"delete","base_version":2}]'::jsonb) as r \gset
select pg_temp.check((:'r'::jsonb)->0->>'status' = 'applied' and (select deleted_at is not null from tasks where id = '11111111-1111-1111-1111-111111111111'), 'sync: borrar = borrado lógico');
select public.sync_push('[{"table":"api_tokens","id":"11111111-1111-1111-1111-111111111112","op":"upsert","row":{"name":"x"}},
  {"table":"tasks","id":"no-es-uuid","op":"upsert","row":{"title":"x"}},
  {"table":"tasks","id":"11111111-1111-1111-1111-111111111113","op":"upsert","row":{"title":"ok","status":"invalido"}}]'::jsonb) as r \gset
select pg_temp.check((select bool_and(x->>'status' = 'rejected') from jsonb_array_elements(:'r'::jsonb) x) and jsonb_array_length(:'r'::jsonb) = 3,
  'sync: tabla no permitida, id inválido y estado inválido → rejected sin abortar el lote');

-- sync_pull incluye borrados y respeta `since`
select public.sync_pull('1970-01-01') as pull \gset
select pg_temp.check((select count(*) from jsonb_array_elements((:'pull'::jsonb)->'tables'->'tasks'->'rows') x where x->>'id' = '11111111-1111-1111-1111-111111111111' and x->>'deleted_at' is not null) = 1,
  'sync_pull devuelve la fila borrada');
select pg_temp.check(jsonb_array_length(public.sync_pull(now() + interval '1 hour')->'tables'->'tasks'->'rows') = 0, 'sync_pull con since futuro → nada');

-- Otro usuario no puede tocar esa fila ni por sync
select set_config('request.jwt.claim.sub', :B, false) \g /dev/null
select public.sync_push('[{"table":"tasks","id":"11111111-1111-1111-1111-111111111111","op":"upsert","base_version":3,"row":{"title":"hackeada"}}]'::jsonb) as r \gset
select pg_temp.check((:'r'::jsonb)->0->>'status' = 'rejected', 'sync: B no puede escribir sobre el id de A (rejected, no conflict)');
reset role;
select pg_temp.check((select title from tasks where id = '11111111-1111-1111-1111-111111111111') = 'Editada en iPhone', 'sync: la fila de A quedó intacta');

-- done <-> status
set role authenticated;
select set_config('request.jwt.claim.sub', :A, false) \g /dev/null
insert into tasks (id, title, status) values ('22222222-2222-2222-2222-222222222222', 'estado', 'done');
select pg_temp.check((select done and done_at is not null from tasks where id = '22222222-2222-2222-2222-222222222222'), 'status done → done=true');
update tasks set done = false where id = '22222222-2222-2222-2222-222222222222';
select pg_temp.check((select status = 'pending' and done_at is null from tasks where id = '22222222-2222-2222-2222-222222222222'), 'desmarcar → pending');
update tasks set status = 'in_progress' where id = '22222222-2222-2222-2222-222222222222';
select pg_temp.check((select not done from tasks where id = '22222222-2222-2222-2222-222222222222'), 'in_progress → done=false');

-- Repetición
insert into tasks (id, title, planned_on, recurrence) values ('33333333-3333-3333-3333-333333333333', 'Regar plantas', '2026-10-14', '{"freq":"daily","interval":2}');
update tasks set done = true where id = '33333333-3333-3333-3333-333333333333';
select pg_temp.check((select count(*) from tasks where origin = 'recurrence' and origin_id = '33333333-3333-3333-3333-333333333333' and planned_on = '2026-10-16') = 1,
  'completar tarea recurrente crea la siguiente (cada 2 días)');
update tasks set done = false where id = '33333333-3333-3333-3333-333333333333';
update tasks set done = true where id = '33333333-3333-3333-3333-333333333333';
select pg_temp.check((select count(*) from tasks where origin_id = '33333333-3333-3333-3333-333333333333') = 1, 'volver a completar no duplica la siguiente');
select pg_temp.check(public.next_occurrence('2026-10-14', '{"freq":"weekly","byweekday":[1,4]}') = '2026-10-15', 'semanal por días: miércoles → jueves');
select pg_temp.check(public.next_occurrence('2026-10-15', '{"freq":"weekly","byweekday":[1,4]}') = '2026-10-19', 'semanal por días: jueves → lunes');
select pg_temp.check(public.next_occurrence('2026-01-31', '{"freq":"monthly"}') = '2026-02-28', 'mensual desde fin de mes');
insert into tasks (id, title, planned_on, recurrence) values ('33333333-3333-3333-3333-333333333334', 'Última vez', '2026-10-14', '{"freq":"daily","until":"2026-10-14"}');
update tasks set done = true where id = '33333333-3333-3333-3333-333333333334';
select pg_temp.check((select count(*) from tasks where origin_id = '33333333-3333-3333-3333-333333333334') = 0, 'repetición con "until" alcanzado no crea más');

-- Deshacer
update tasks set title = 'Título nuevo' where id = '22222222-2222-2222-2222-222222222222';
reset role;
insert into action_log (user_id, actor, tool, summary, target_table, target_id, op, before, after, reversible)
  values (:A::uuid, 'chat', 'editar_tarea', 'Cambió el título', 'tasks', '22222222-2222-2222-2222-222222222222', 'update',
          '{"title":"estado","reminded_at":"2020-01-01T00:00:00Z"}', '{"title":"Título nuevo"}', true)
  returning id as log_id \gset
set role authenticated;
select set_config('request.jwt.claim.sub', :B, false) \g /dev/null
select pg_temp.check(not (public.undo_action(:'log_id'::uuid)->>'ok')::boolean, 'B no puede deshacer acciones de A');
select set_config('request.jwt.claim.sub', :A, false) \g /dev/null
select pg_temp.check((public.undo_action(:'log_id'::uuid)->>'ok')::boolean, 'A deshace');
select pg_temp.check((select title = 'estado' and reminded_at is null from tasks where id = '22222222-2222-2222-2222-222222222222'), 'deshacer restaura el título e ignora columnas del cron');
select pg_temp.check(not (public.undo_action(:'log_id'::uuid)->>'ok')::boolean, 'no se deshace dos veces');
reset role;

-- Acuerdos sin duplicar
set role authenticated;
select set_config('request.jwt.claim.sub', :A, false) \g /dev/null
insert into meetings (id, title) values ('44444444-4444-4444-4444-444444444444', 'Kickoff Isoval');
insert into agreements (meeting_id, text, owner) values ('44444444-4444-4444-4444-444444444444', 'Enviar propuesta el viernes.', null) on conflict do nothing;
insert into agreements (meeting_id, text, owner) values ('44444444-4444-4444-4444-444444444444', 'enviar  PROPUESTA el viernes', 'Zeus') on conflict do nothing;
select pg_temp.check((select count(*) from agreements where meeting_id = '44444444-4444-4444-4444-444444444444') = 1, 'reprocesar una transcripción no duplica acuerdos');
select pg_temp.check((select owner = 'Por definir' from agreements where meeting_id = '44444444-4444-4444-4444-444444444444'), 'sin responsable → "Por definir"');

-- Búsqueda global y aislamiento
insert into notes (title, content, tags) values ('Hábitos atómicos', 'Las identidades se construyen con votos pequeños cada día.', '{libros}');
insert into resources (title, kind, summary) values ('Atomic Habits', 'book', 'Hábitos pequeños, resultados grandes.');
insert into clients (name, notes) values ('Isoval', 'Fabricante de aislantes; prefieren reels cortos.');
select pg_temp.check((select count(distinct kind) from public.search_all('hábitos')) = 2, 'search_all encuentra nota y recurso por "hábitos"');
select pg_temp.check((select count(distinct kind) from public.search_all('habitos')) = 2, 'search_all sin acentos ("habitos") encuentra lo mismo');
select pg_temp.check((select count(*) from public.search_all('isoval')) >= 2, 'search_all encuentra cliente y reunión');
select set_config('request.jwt.claim.sub', :B, false) \g /dev/null
select pg_temp.check((select count(*) from public.search_all('hábitos')) = 0, 'B no encuentra nada de A');
select pg_temp.check((select count(*) from clients) = 0 and (select count(*) from meetings) = 0 and (select count(*) from areas) = 0, 'RLS en tablas nuevas');
reset role;

-- Duplicados de contactos
set role authenticated;
select set_config('request.jwt.claim.sub', :A, false) \g /dev/null
insert into contacts (name, email, phone) values ('Ana López', 'ana@isoval.mx', '+52 311 123 4567');
select pg_temp.check((select count(*) from public.find_contact_duplicates('ana lópez')) = 1, 'duplicado por nombre');
select pg_temp.check((select count(*) from public.find_contact_duplicates('Otra', null, '3111234567')) = 1, 'duplicado por teléfono (sin formato)');
select pg_temp.check((select count(*) from public.find_contact_duplicates('Otra', 'ANA@isoval.mx')) = 1, 'duplicado por correo');
reset role;

\echo TODAS LAS PRUEBAS SQL PASARON
