-- NEXO — esquema Supabase. Ejecutar en SQL Editor. Idempotente (se puede volver a correr).
-- Cada fila pertenece a auth.uid(); RLS impide acceso cruzado entre cuentas.

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  notes text,
  category text not null default 'personal',
  due_at timestamp without time zone, -- hora local del usuario
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text,
  content text not null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('expense', 'income')),
  amount numeric(12,2) not null check (amount > 0),
  category text not null,
  description text,
  occurred_on date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  content text not null check (char_length(content) <= 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists tasks_user_due on public.tasks (user_id, done, due_at);
create index if not exists notes_user_created on public.notes (user_id, created_at desc);
create index if not exists tx_user_date on public.transactions (user_id, occurred_on);
create index if not exists chat_user_created on public.chat_messages (user_id, created_at desc);

-- RLS: solo el dueño puede ver/crear/editar/borrar
do $$
declare t text;
begin
  foreach t in array array['tasks','notes','transactions','memories','chat_messages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format(
      'create policy "owner_all" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Sincronización en vivo entre dispositivos (Realtime respeta RLS)
do $$
declare t text;
begin
  foreach t in array array['tasks','notes','transactions','memories'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ============================================================
-- Recordatorios con Web Push
-- ============================================================

-- remind_at es un instante absoluto (timestamptz): el cron lo compara con now().
alter table public.tasks add column if not exists remind_at timestamptz;
alter table public.tasks add column if not exists reminded_at timestamptz;
alter table public.tasks add column if not exists remind_attempts int not null default 0;
-- Resultado del envío: sent | no_devices | rejected | failed | expired | missed | unknown (lo escribe solo el servidor).
-- Migración (una sola vez, al crear la columna): la versión anterior no guardaba si el aviso llegó → 'unknown'.
do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'tasks' and column_name = 'reminder_status') then
    alter table public.tasks add column reminder_status text;
    update public.tasks set reminder_status = 'unknown' where reminded_at is not null;
  end if;
end $$;
create index if not exists tasks_pending_reminders on public.tasks (remind_at)
  where remind_at is not null and reminded_at is null and done = false;

-- Los usuarios solo escriben columnas propias; reminded_at/remind_attempts/reminder_status son del cron.
revoke insert, update on public.tasks from authenticated;
grant insert (title, notes, category, due_at, remind_at) on public.tasks to authenticated;
grant update (title, notes, category, due_at, done, done_at, remind_at) on public.tasks to authenticated;
-- Supabase ya no concede privilegios implícitos en tablas nuevas (changelog 45329): el cron los necesita.
grant select, update on public.tasks to service_role;

-- Cambiar la hora del aviso lo vuelve a armar (permite reprogramar un aviso ya enviado).
create or replace function public.tasks_rearm_reminder() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.remind_at is distinct from old.remind_at then
    new.reminded_at := null;
    new.remind_attempts := 0;
    new.reminder_status := null;
  end if;
  return new;
end $$;
drop trigger if exists tasks_rearm_reminder on public.tasks;
create trigger tasks_rearm_reminder before update of remind_at on public.tasks
  for each row execute function public.tasks_rearm_reminder();

-- Avisos de usuarios: no en el pasado (>5 min) y máximo 200 pendientes por cuenta.
-- También al desmarcar una tarea completada (vuelve a quedar pendiente): un aviso ya vencido
-- se marca 'missed' en lugar de dispararse, para que el checkbox siga funcionando.
create or replace function public.tasks_validate_reminder() returns trigger
language plpgsql set search_path = public as $$
declare
  reopened boolean := tg_op = 'UPDATE' and old.done and not new.done;
  rescheduled boolean := tg_op = 'INSERT' or new.remind_at is distinct from old.remind_at;
begin
  if current_user <> 'authenticated' or new.remind_at is null or new.done or new.reminded_at is not null then
    return new;
  end if;
  if not (reopened or rescheduled) then return new; end if;
  if new.remind_at < now() - interval '5 minutes' then
    if rescheduled then raise exception 'La hora del aviso ya pasó' using errcode = '22023'; end if;
    new.reminded_at := now();
    new.reminder_status := 'missed'; -- se reabrió cuando la hora del aviso ya había pasado
    return new;
  end if;
  -- Serializa por usuario para que inserciones concurrentes no se salten el tope.
  perform pg_advisory_xact_lock(hashtextextended('nexo_reminders:' || new.user_id::text, 0));
  if (select count(*) from public.tasks
      where user_id = new.user_id and remind_at is not null and reminded_at is null and done = false
        and id <> new.id) >= 200 then
    raise exception 'Demasiados avisos pendientes (máx. 200)' using errcode = '54000';
  end if;
  return new;
end $$;
drop trigger if exists tasks_validate_reminder on public.tasks;
create trigger tasks_validate_reminder before insert or update of remind_at, done on public.tasks
  for each row execute function public.tasks_validate_reminder();

-- Solo servicios de push reales (debe coincidir con isPushEndpoint() en api/_lib/push.js).
create or replace function public.is_push_endpoint(u text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(length(u) < 1024 and u ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|jmt17\.google\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.push\.apple\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com)/', false)
$$;
grant execute on function public.is_push_endpoint(text) to authenticated, service_role;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique check (public.is_push_endpoint(endpoint)),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}=*$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}=*$'),
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);
-- El servicio push respondió 404/410: no se envía más, pero la fila queda para que la app distinga
-- "caducó/rotó" (re-registrar) de "el usuario la quitó" (fila borrada → respetar). Las caducadas solo
-- se eliminan cuando hace falta lugar (límite de 10 por cuenta) y siempre antes que las activas.
alter table public.push_subscriptions add column if not exists gone_at timestamptz;
create index if not exists push_subs_user on public.push_subscriptions (user_id);

-- El usuario ve y borra sus dispositivos; el alta pasa por register_push_subscription().
-- Sin FORCE: la función security definer (dueña de la tabla) debe poder reasignar un endpoint.
alter table public.push_subscriptions enable row level security;
drop policy if exists "owner_select" on public.push_subscriptions;
drop policy if exists "owner_delete" on public.push_subscriptions;
create policy "owner_select" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "owner_delete" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());
revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant select, update, delete on public.push_subscriptions to service_role;

-- Alta/actualización de la suscripción de este dispositivo. Si el endpoint estaba ligado a otra
-- cuenta (otro usuario usó este dispositivo), se reasigna: un dispositivo = una cuenta.
-- p_user_agent: nombre legible del dispositivo (p. ej. "iPad").
create or replace function public.register_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  sub_id uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not public.is_push_endpoint(p_endpoint) then raise exception 'invalid push endpoint' using errcode = '22023'; end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, gone_at = null,
        user_agent = excluded.user_agent, created_at = case when push_subscriptions.user_id = excluded.user_id then push_subscriptions.created_at else now() end
  returning id into sub_id;

  -- Máximo 10 dispositivos por usuario: primero se descartan las caducadas, luego las activas más antiguas.
  delete from public.push_subscriptions
  where user_id = uid and id <> sub_id and id in (
    select id from public.push_subscriptions where user_id = uid and id <> sub_id
    order by (gone_at is null) desc, created_at desc offset 9
  );
  return sub_id;
end $$;
revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;

-- /api/push/test (con el JWT del usuario) marca como caducadas sus propias suscripciones (404/410).
create or replace function public.mark_push_gone(p_ids uuid[]) returns void
language sql security definer set search_path = public as $$
  update public.push_subscriptions set gone_at = now() where id = any(p_ids) and user_id = auth.uid();
$$;
revoke all on function public.mark_push_gone(uuid[]) from public, anon;
grant execute on function public.mark_push_gone(uuid[]) to authenticated;

-- Reclama avisos vencidos de forma atómica (skip locked: dos crons simultáneos no duplican).
-- Justo por usuario: máx. 5 por cuenta y ejecución, para que nadie acapare la cola.
-- Avisos con más de 12 h de retraso (cron caído) se marcan 'expired' sin enviarse.
-- Reclamos sin resultado tras 10 min (la función se cayó a medio envío) quedan 'unknown': no se
-- reenvían para no duplicar una notificación que quizá sí llegó.
-- Solo service_role (servidor); se ejecuta con sus permisos (bypass RLS).
create or replace function public.claim_due_reminders(max_rows int default 100)
returns table (task_id uuid, user_id uuid, title text, due_at timestamp, remind_at timestamptz, attempts int)
language sql security invoker set search_path = public as $$
  update public.tasks
     set reminded_at = now(), reminder_status = 'expired'
   where remind_at < now() - interval '12 hours' and reminded_at is null and done = false;

  update public.tasks
     set reminder_status = 'unknown'
   where reminder_status is null and reminded_at < now() - interval '10 minutes';


  with ranked as (
    select id, remind_at, row_number() over (partition by user_id order by remind_at) as rn
      from public.tasks
     where remind_at <= now() and reminded_at is null and done = false
  ), picked as (
    select t.id
      from public.tasks t
      join ranked r on r.id = t.id
     where r.rn <= 5 and t.reminded_at is null and t.done = false
     order by r.rn, r.remind_at  -- por turnos: el primer aviso de cada cuenta va antes que el segundo de otra
     limit greatest(1, least(max_rows, 500))
       for update of t skip locked
  )
  update public.tasks t
     set reminded_at = now(), remind_attempts = t.remind_attempts + 1, reminder_status = null
    from picked
   where t.id = picked.id
  returning t.id, t.user_id, t.title, t.due_at, t.remind_at, t.remind_attempts;
$$;
revoke all on function public.claim_due_reminders(int) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(int) to service_role;
