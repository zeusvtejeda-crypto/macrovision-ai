-- NEXO — programa el envío de avisos cada minuto desde Supabase (gratis, sin Vercel Pro).
-- Ejecutar en SQL Editor DESPUÉS de desplegar en Vercel y de correr schema.sql.
--
-- 1) Activa las extensiones (también en Database → Extensions):
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Guarda la URL y el secreto en Vault UNA sola vez (cambia los valores; no los subas a git):
--    select vault.create_secret('https://TU-APP.vercel.app/api/cron/reminders', 'nexo_reminders_url');
--    select vault.create_secret('EL_MISMO_CRON_SECRET_DE_VERCEL', 'nexo_cron_secret');
--    Para cambiarlos después: select vault.update_secret(id, 'nuevo') usando el id de vault.secrets.

-- 3) Programa el job (idempotente):
select cron.unschedule(jobid) from cron.job where jobname = 'nexo-reminders';
select cron.schedule(
  'nexo-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'nexo_reminders_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nexo_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- 4) Limpieza diaria del historial de pg_cron (si no, crece ~1 MB/día y llena el plan Free):
select cron.unschedule(jobid) from cron.job where jobname = 'nexo-cron-cleanup';
select cron.schedule(
  'nexo-cron-cleanup',
  '17 3 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '3 days' $$
);

-- Verificar:
--   select * from cron.job_run_details order by start_time desc limit 5;   -- ¿corre el job?
--   select status_code, content from net._http_response order by created desc limit 5;  -- respuesta de Vercel (200 = ok)
-- Pausar:  select cron.unschedule('nexo-reminders');
-- (net._http_response se purga sola cada 6 h.)
