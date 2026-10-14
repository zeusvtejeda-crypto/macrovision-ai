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
\echo TODAS LAS PRUEBAS SQL PASARON
