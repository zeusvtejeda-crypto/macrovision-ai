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
update tasks set title = 'vencida' where title = 'vencida';
reset role;

set role service_role;
select pg_temp.check((select count(*) from public.claim_due_reminders(100)) = 1, 'aviso reprogramado se envía otra vez');
reset role;

select pg_temp.check((select count(*) from tasks where done and reminded_at is not null) = 0, 'tareas completadas nunca se reclaman');
\echo TODAS LAS PRUEBAS SQL PASARON
