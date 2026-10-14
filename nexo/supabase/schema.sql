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
create index if not exists tasks_pending_reminders on public.tasks (remind_at)
  where remind_at is not null and reminded_at is null and done = false;

-- Cambiar la hora del aviso lo vuelve a armar (permite reprogramar un aviso ya enviado).
create or replace function public.tasks_rearm_reminder() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.remind_at is distinct from old.remind_at then
    new.reminded_at := null;
    new.remind_attempts := 0;
  end if;
  return new;
end $$;
drop trigger if exists tasks_rearm_reminder on public.tasks;
create trigger tasks_rearm_reminder before update of remind_at on public.tasks
  for each row execute function public.tasks_rearm_reminder();

-- Solo servicios de push reales (debe coincidir con isPushEndpoint() en api/_lib/push.js).
create or replace function public.is_push_endpoint(u text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(length(u) < 1024 and u ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.push\.apple\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com)/', false)
$$;

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

-- Alta/actualización de la suscripción de este dispositivo. Si el endpoint estaba ligado a otra
-- cuenta (otro usuario usó este dispositivo), se reasigna: un dispositivo = una cuenta.
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
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = case when push_subscriptions.user_id = excluded.user_id then push_subscriptions.created_at else now() end
  returning id into sub_id;

  -- Máximo 10 dispositivos por usuario (se descartan los más antiguos).
  delete from public.push_subscriptions
  where user_id = uid and id <> sub_id and id in (
    select id from public.push_subscriptions where user_id = uid and id <> sub_id order by created_at desc offset 9
  );
  return sub_id;
end $$;
revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;

-- Reclama avisos vencidos de forma atómica (skip locked: dos crons simultáneos no duplican).
-- Solo service_role (servidor); se ejecuta con sus permisos (bypass RLS).
create or replace function public.claim_due_reminders(max_rows int default 100)
returns table (task_id uuid, user_id uuid, title text, due_at timestamp, remind_at timestamptz, attempts int)
language sql security invoker set search_path = public as $$
  with due as (
    select id from public.tasks
    where remind_at <= now() and reminded_at is null and done = false
    order by remind_at
    limit greatest(1, least(max_rows, 500))
    for update skip locked
  )
  update public.tasks t
     set reminded_at = now(), remind_attempts = t.remind_attempts + 1
    from due
   where t.id = due.id
  returning t.id, t.user_id, t.title, t.due_at, t.remind_at, t.remind_attempts;
$$;
revoke all on function public.claim_due_reminders(int) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(int) to service_role;
