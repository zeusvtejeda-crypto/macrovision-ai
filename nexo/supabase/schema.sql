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
    -- Siri/Atajos (api/shortcut.js) actúa con service_role acotado al usuario del token.
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- Sincronización en vivo entre dispositivos (Realtime respeta RLS)
do $$
declare t text;
begin
  foreach t in array array['tasks','notes','transactions','memories','chat_messages'] loop
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
-- Supabase ya no concede privilegios implícitos en tablas nuevas (changelog 45329): el cron y Siri los
-- necesitan (concedidos arriba en el bucle de tablas).

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
  -- También para service_role (Siri/Atajos actúan con él); solo el superusuario (mantenimiento) se salta esto.
  if current_user not in ('authenticated', 'service_role') or new.remind_at is null or new.done or new.reminded_at is not null then
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
-- p_replaces: endpoint anterior de ESTE dispositivo (rotación/renovación); se borra antes de aplicar el límite.
drop function if exists public.register_push_subscription(text, text, text, text);
create or replace function public.register_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null, p_replaces text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  sub_id uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not public.is_push_endpoint(p_endpoint) then raise exception 'invalid push endpoint' using errcode = '22023'; end if;

  if p_replaces is not null and p_replaces <> p_endpoint then
    delete from public.push_subscriptions where user_id = uid and endpoint = p_replaces;
  end if;

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
revoke all on function public.register_push_subscription(text, text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text, text) to authenticated;

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

-- ============================================================
-- Siri y Atajos: tokens personales
-- ============================================================
-- El token ("nexo_…") se genera en el navegador y se muestra una sola vez; aquí solo se guarda su
-- SHA-256. /api/shortcut lo valida con service_role y actúa solo sobre los datos de ese usuario.
create table if not exists public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  prefix text not null check (prefix ~ '^nexo_[A-Za-z0-9_-]{4}$'),
  time_zone text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  window_start timestamptz,
  window_count int not null default 0,
  day_start date,
  day_count int not null default 0
);
-- Caducan al año (se crea uno nuevo y se pega una vez en el atajo; iCloud lo lleva a los demás equipos).
alter table public.api_tokens add column if not exists expires_at timestamptz not null default now() + interval '1 year';
create index if not exists api_tokens_user on public.api_tokens (user_id);

alter table public.api_tokens enable row level security;
alter table public.api_tokens force row level security;
drop policy if exists "owner_select" on public.api_tokens;
drop policy if exists "owner_insert" on public.api_tokens;
drop policy if exists "owner_delete" on public.api_tokens;
create policy "owner_select" on public.api_tokens for select to authenticated using (user_id = auth.uid());
create policy "owner_insert" on public.api_tokens for insert to authenticated with check (user_id = auth.uid());
create policy "owner_delete" on public.api_tokens for delete to authenticated using (user_id = auth.uid());
revoke all on public.api_tokens from anon, authenticated;
-- El hash no se expone al navegador después de crearlo; los contadores son del servidor.
grant select (id, user_id, name, prefix, time_zone, created_at, last_used_at, expires_at) on public.api_tokens to authenticated;
grant insert (name, token_hash, prefix, time_zone) on public.api_tokens to authenticated;
grant delete on public.api_tokens to authenticated;
grant select, update on public.api_tokens to service_role;

-- Máximo 10 tokens por cuenta.
create or replace function public.api_tokens_limit() returns trigger
language plpgsql set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('nexo_tokens:' || new.user_id::text, 0));
  if (select count(*) from public.api_tokens where user_id = new.user_id) >= 10 then
    raise exception 'Máximo 10 tokens por cuenta: revoca uno antes de crear otro' using errcode = '54000';
  end if;
  return new;
end $$;
drop trigger if exists api_tokens_limit on public.api_tokens;
create trigger api_tokens_limit before insert on public.api_tokens
  for each row execute function public.api_tokens_limit();

-- Valida un token y cuenta su uso (límite por minuto y por día UTC por token, y por día por cuenta
-- sumando todos sus tokens). Solo cuentan las solicitudes permitidas; se serializa por cuenta.
-- 0 filas = no existe, revocado o vencido. reason: null | minute | token_day | account_day.
drop function if exists public.use_api_token(text, int, int);
drop function if exists public.use_api_token(text, int, int, int);
create or replace function public.use_api_token(
  p_hash text, p_per_minute int default 20, p_per_day int default 300, p_per_user_day int default 500
) returns table (user_id uuid, time_zone text, allowed boolean, reason text)
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid;
  r public.api_tokens%rowtype;
  today_utc date := (now() at time zone 'utc')::date;
  wc int; dc int; others int; why text;
begin
  select t.user_id into uid from public.api_tokens t where t.token_hash = p_hash and t.expires_at > now();
  if not found then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('nexo_api_user:' || uid::text, 0));
  select * into r from public.api_tokens t where t.token_hash = p_hash for update;
  wc := case when r.window_start > now() - interval '1 minute' then r.window_count else 0 end;
  dc := case when r.day_start = today_utc then r.day_count else 0 end;
  select coalesce(sum(case when t.day_start = today_utc then t.day_count else 0 end), 0) into others
    from public.api_tokens t where t.user_id = uid and t.id <> r.id;
  why := case when wc >= p_per_minute then 'minute'
              when dc >= p_per_day then 'token_day'
              when others + dc >= p_per_user_day then 'account_day' end;
  if why is null then
    update public.api_tokens t
       set window_count = wc + 1, window_start = case when wc = 0 then now() else t.window_start end,
           day_count = dc + 1, day_start = today_utc, last_used_at = now()
     where t.id = r.id;
  end if;
  return query select uid, r.time_zone, why is null, why;
end $$;
revoke all on function public.use_api_token(text, int, int, int) from public, anon, authenticated;
grant execute on function public.use_api_token(text, int, int, int) to service_role;

-- ============================================================
-- NEXO v2 — asistente general: áreas, proyectos, tareas ampliadas, captura, clientes,
-- reuniones, contenido, biblioteca, estudios, finanzas, hábitos, revisiones, memoria,
-- historial de acciones, agenda, ajustes, sincronización y búsqueda.
-- Idempotente: se puede volver a ejecutar sobre cualquier versión anterior.
-- ============================================================

-- ---------- Columnas y reglas comunes a todas las tablas de usuario ----------
-- updated_at/version (sincronización y conflictos), deleted_at (borrado lógico y deshacer),
-- RLS por usuario, permisos explícitos, Realtime.
create or replace function public.nexo_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.version := coalesce(old.version, 0) + 1;
  return new;
end $$;

create or replace procedure public.nexo_common(t text)
language plpgsql as $$
begin
  execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);
  execute format('alter table public.%I add column if not exists deleted_at timestamptz', t);
  execute format('alter table public.%I add column if not exists version int not null default 1', t);
  execute format('drop trigger if exists nexo_touch on public.%I', t);
  execute format('create trigger nexo_touch before update on public.%I for each row execute function public.nexo_touch()', t);
  execute format('create index if not exists %I on public.%I (user_id, updated_at)', t || '_user_updated', t);
  execute format('alter table public.%I enable row level security', t);
  execute format('alter table public.%I force row level security', t);
  execute format('drop policy if exists "owner_all" on public.%I', t);
  execute format('create policy "owner_all" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  execute format('revoke all on public.%I from anon', t);
  execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  execute format('grant select, insert, update, delete on public.%I to service_role', t);
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
    execute format('alter publication supabase_realtime add table public.%I', t);
  end if;
end $$;

-- ---------- Ajustes ----------
create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  time_zone text not null default 'America/Mazatlan',
  currency text not null default 'MXN',
  locale text not null default 'es-MX',
  prefs jsonb not null default '{}'::jsonb,      -- notificaciones: {quiet_from, quiet_to, digest_at, ...}
  ics_token text,                                 -- calendario ICS privado (se genera al activarlo)
  created_at timestamptz not null default now()
);
call public.nexo_common('settings');

-- ---------- Áreas (Vida personal, VILLEDA, Estudios, proyectos propios…) ----------
create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null default 'other' check (kind in ('personal', 'work', 'study', 'project', 'other')),
  color text,
  icon text,
  sort int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
call public.nexo_common('areas');

-- Clientes/marcas se definen antes que proyectos (los proyectos los referencian).
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  area_id uuid references public.areas(id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  kind text not null default 'client' check (kind in ('client', 'brand', 'own')),
  status text not null default 'active' check (status in ('lead', 'active', 'paused', 'past')),
  industry text,
  website text,
  socials jsonb not null default '{}'::jsonb,
  services text[] not null default '{}',
  notes text,
  important_dates jsonb not null default '[]'::jsonb,   -- [{label, on}]
  brand_kit jsonb not null default '{}'::jsonb,         -- ver docs/MODELO.md
  logo_attachment_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
call public.nexo_common('clients');

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  area_id uuid references public.areas(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  success_criteria text,                 -- criterio explícito de avance
  target_on date,
  status text not null default 'active' check (status in ('active', 'done', 'dropped')),
  created_at timestamptz not null default now()
);
call public.nexo_common('goals');

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  area_id uuid references public.areas(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  goal_id uuid references public.goals(id) on delete set null,
  name text not null check (char_length(name) between 1 and 160),
  description text,
  status text not null default 'active' check (status in ('active', 'paused', 'done', 'archived')),
  due_on date,
  color text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
call public.nexo_common('projects');

-- ---------- Adjuntos (Supabase Storage, bucket privado 'attachments', carpeta = user_id) ----------
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  owner_table text,
  owner_id uuid,
  bucket text not null default 'attachments',
  path text not null unique,              -- '<user_id>/<uuid>-<nombre>'
  name text not null,
  mime text,
  size bigint,
  kind text not null default 'other' check (kind in ('image', 'audio', 'video', 'document', 'other')),
  created_at timestamptz not null default now(),
  constraint attachments_path_owner check (path like (user_id::text || '/%'))
);
call public.nexo_common('attachments');
create index if not exists attachments_owner on public.attachments (user_id, owner_table, owner_id);

do $$ begin
  if to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
      values ('attachments', 'attachments', false, 52428800)
      on conflict (id) do nothing;
    drop policy if exists "attachments_owner_select" on storage.objects;
    drop policy if exists "attachments_owner_insert" on storage.objects;
    drop policy if exists "attachments_owner_update" on storage.objects;
    drop policy if exists "attachments_owner_delete" on storage.objects;
    create policy "attachments_owner_select" on storage.objects for select to authenticated
      using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
    create policy "attachments_owner_insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
    create policy "attachments_owner_update" on storage.objects for update to authenticated
      using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
    create policy "attachments_owner_delete" on storage.objects for delete to authenticated
      using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;

-- ---------- Contactos y reuniones (las tareas los referencian) ----------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  company text,
  role text,
  relation text,
  email text,
  phone text,
  notes text,
  tags text[] not null default '{}',
  last_interaction_at timestamptz,
  next_followup_on date,
  created_at timestamptz not null default now()
);
call public.nexo_common('contacts');

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  code text,
  teacher text,
  period text,
  schedule jsonb not null default '[]'::jsonb,   -- [{weekday 1-7, start 'HH:MM', end 'HH:MM', room}]
  color text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
call public.nexo_common('subjects');

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  kind text not null default 'event' check (kind in ('event', 'block')),  -- block = bloque de trabajo
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  location text,
  notes text,
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  external_uid text,                        -- evento importado por Atajos (evita duplicados)
  source text not null default 'nexo' check (source in ('nexo', 'shortcut', 'import')),
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
call public.nexo_common('events');
create index if not exists events_user_starts on public.events (user_id, starts_at);
create unique index if not exists events_external_uid on public.events (user_id, external_uid) where external_uid is not null;

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  contact_ids uuid[] not null default '{}',
  attendees text[] not null default '{}',
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  objective text,
  agenda jsonb not null default '[]'::jsonb,        -- [string]
  questions jsonb not null default '[]'::jsonb,     -- [string]
  notes text,
  transcript text,
  transcript_attachment_id uuid references public.attachments(id) on delete set null,
  summary jsonb,                                    -- {summary, agreements[], decisions[], proposed_tasks[], open_questions[], followup_draft, next_step}
  summary_at timestamptz,
  status text not null default 'planned' check (status in ('planned', 'held', 'processed', 'cancelled')),
  created_at timestamptz not null default now()
);
call public.nexo_common('meetings');

-- ---------- Tareas: sistema único reutilizado por todos los módulos ----------
alter table public.tasks add column if not exists description text;
alter table public.tasks add column if not exists area_id uuid references public.areas(id) on delete set null;
alter table public.tasks add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.tasks add column if not exists goal_id uuid references public.goals(id) on delete set null;
alter table public.tasks add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.tasks add column if not exists contact_id uuid references public.contacts(id) on delete set null;
alter table public.tasks add column if not exists meeting_id uuid references public.meetings(id) on delete set null;
alter table public.tasks add column if not exists subject_id uuid references public.subjects(id) on delete set null;
alter table public.tasks add column if not exists parent_id uuid references public.tasks(id) on delete cascade;
alter table public.tasks add column if not exists kind text not null default 'task';
alter table public.tasks add column if not exists priority smallint not null default 3;
alter table public.tasks add column if not exists status text not null default 'pending';
alter table public.tasks add column if not exists planned_on date;
alter table public.tasks add column if not exists estimated_minutes int;
alter table public.tasks add column if not exists depends_on uuid[] not null default '{}';
alter table public.tasks add column if not exists recurrence jsonb;   -- {freq: daily|weekly|monthly|yearly, interval, byweekday[], until}
alter table public.tasks add column if not exists origin text not null default 'manual';
alter table public.tasks add column if not exists origin_id uuid;
alter table public.tasks add column if not exists tags text[] not null default '{}';
alter table public.tasks add column if not exists sort int not null default 0;
alter table public.tasks drop constraint if exists tasks_kind_check;
alter table public.tasks add constraint tasks_kind_check check (kind in ('task', 'followup', 'exam', 'deliverable'));
alter table public.tasks drop constraint if exists tasks_priority_check;
alter table public.tasks add constraint tasks_priority_check check (priority between 1 and 4);
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check check (status in ('pending', 'in_progress', 'blocked', 'review', 'done'));
alter table public.tasks drop constraint if exists tasks_origin_check;
alter table public.tasks add constraint tasks_origin_check check (origin in ('manual', 'chat', 'siri', 'meeting', 'capture', 'recurrence', 'study', 'import'));
update public.tasks set status = 'done' where done and status <> 'done';
call public.nexo_common('tasks');
-- (nexo_common concede todo; las columnas del cron siguen siendo solo del servidor)
revoke insert, update on public.tasks from authenticated;
grant insert (id, title, description, notes, category, due_at, remind_at, area_id, project_id, goal_id, client_id, contact_id, meeting_id,
  subject_id, parent_id, kind, priority, status, done, done_at, planned_on, estimated_minutes, depends_on, recurrence, origin, origin_id,
  tags, sort, deleted_at, created_at) on public.tasks to authenticated;
grant update (title, description, notes, category, due_at, remind_at, area_id, project_id, goal_id, client_id, contact_id, meeting_id,
  subject_id, parent_id, kind, priority, status, done, done_at, planned_on, estimated_minutes, depends_on, recurrence, origin, origin_id,
  tags, sort, deleted_at) on public.tasks to authenticated;
create index if not exists tasks_user_planned on public.tasks (user_id, planned_on) where deleted_at is null;
create index if not exists tasks_user_project on public.tasks (user_id, project_id) where deleted_at is null;
create index if not exists tasks_parent on public.tasks (parent_id) where parent_id is not null;

-- done <-> status siempre coherentes (el checkbox y el estado se pueden cambiar por separado).
create or replace function public.tasks_sync_done() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'done' then new.done := true; elsif new.done then new.status := 'done'; end if;
  elsif new.done is distinct from old.done then
    new.status := case when new.done then 'done' when old.status = 'done' then 'pending' else new.status end;
  elsif new.status is distinct from old.status then
    new.done := new.status = 'done';
  end if;
  if new.done and new.done_at is null then new.done_at := now(); end if;
  if not new.done then new.done_at := null; end if;
  return new;
end $$;
drop trigger if exists tasks_sync_done on public.tasks;
create trigger tasks_sync_done before insert or update of done, status on public.tasks
  for each row execute function public.tasks_sync_done();

-- Repetición: al completar una tarea recurrente se crea la siguiente ocurrencia (una sola vez).
create or replace function public.next_occurrence(d date, rule jsonb) returns date
language plpgsql immutable as $$
declare
  freq text := rule->>'freq';
  n int := greatest(1, coalesce((rule->>'interval')::int, 1));
  days int[];
  i int;
  cand date;
begin
  if d is null or freq is null then return null; end if;
  if freq = 'weekly' and jsonb_typeof(rule->'byweekday') = 'array' and jsonb_array_length(rule->'byweekday') > 0 then
    select array_agg((x)::int) into days from jsonb_array_elements_text(rule->'byweekday') x;  -- 1 = lunes … 7 = domingo
    for i in 1..7 * n + 7 loop
      cand := d + i;
      if extract(isodow from cand)::int = any(days) and ((cand - d) / 7 + 1 >= n or n = 1) then
        -- con intervalo > 1, solo semanas múltiplo del intervalo contadas desde la semana de d
        if n = 1 or ((date_trunc('week', cand)::date - date_trunc('week', d)::date) / 7) % n = 0 then return cand; end if;
      end if;
    end loop;
    return null;
  end if;
  return case freq
    when 'daily' then d + n
    when 'weekly' then d + 7 * n
    when 'monthly' then (d + (n || ' months')::interval)::date
    when 'yearly' then (d + (n || ' years')::interval)::date
  end;
end $$;

-- security definer: la siguiente ocurrencia la crea el servidor (fija user_id, columna que el usuario no escribe).
create or replace function public.tasks_recur() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base date; nxt date; until_d date;
begin
  if not (new.done and not old.done) or new.recurrence is null or new.deleted_at is not null then return new; end if;
  if exists (select 1 from public.tasks where origin = 'recurrence' and origin_id = new.id) then return new; end if;
  base := coalesce(new.planned_on, new.due_at::date, current_date);
  nxt := public.next_occurrence(base, new.recurrence);
  until_d := (new.recurrence->>'until')::date;
  if nxt is null or (until_d is not null and nxt > until_d) then return new; end if;
  insert into public.tasks (user_id, title, description, notes, category, area_id, project_id, goal_id, client_id, contact_id,
      subject_id, kind, priority, planned_on, due_at, estimated_minutes, recurrence, origin, origin_id, tags, remind_at)
  values (new.user_id, new.title, new.description, new.notes, new.category, new.area_id, new.project_id, new.goal_id, new.client_id,
      new.contact_id, new.subject_id, new.kind, new.priority,
      case when new.planned_on is not null then nxt end,
      case when new.due_at is not null then (nxt + (new.due_at - new.due_at::date)) end,
      new.estimated_minutes, new.recurrence, 'recurrence', new.id, new.tags,
      case when new.remind_at is not null and new.remind_at > now() - interval '1 day' then new.remind_at + ((nxt - base) * interval '1 day') end);
  return new;
end $$;
drop trigger if exists tasks_recur on public.tasks;
create trigger tasks_recur after update of done on public.tasks
  for each row execute function public.tasks_recur();

-- ---------- Bandeja de entrada (captura rápida para clasificar después) ----------
create table if not exists public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'idea', 'task', 'voice', 'photo', 'document', 'link', 'expense', 'meeting_note')),
  raw_text text,
  url text,
  attachment_id uuid references public.attachments(id) on delete set null,
  suggestion jsonb,          -- {type, area_id, project_id, client_id, tags[], confidence, reason}
  extraction jsonb,          -- lo que la IA extrajo (editable antes de confirmar)
  status text not null default 'pending' check (status in ('pending', 'organized', 'discarded')),
  organized_table text,
  organized_id uuid,
  source text not null default 'app' check (source in ('app', 'siri', 'share', 'chat')),
  created_at timestamptz not null default now()
);
call public.nexo_common('inbox_items');

-- ---------- Notas (apuntes, notas de reunión, ideas) ----------
alter table public.notes add column if not exists area_id uuid references public.areas(id) on delete set null;
alter table public.notes add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.notes add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.notes add column if not exists subject_id uuid references public.subjects(id) on delete set null;
alter table public.notes add column if not exists meeting_id uuid references public.meetings(id) on delete set null;
alter table public.notes add column if not exists kind text not null default 'note';
alter table public.notes add column if not exists origin text not null default 'manual';
alter table public.notes drop constraint if exists notes_kind_check;
alter table public.notes add constraint notes_kind_check check (kind in ('note', 'idea', 'study', 'meeting', 'journal'));
call public.nexo_common('notes');

-- ---------- Acuerdos de reuniones (→ tareas sin duplicar) ----------
create table if not exists public.agreements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  kind text not null default 'agreement' check (kind in ('agreement', 'decision', 'question')),
  text text not null check (char_length(text) between 1 and 2000),
  owner text,                                  -- responsable ("Por definir" si no hay)
  due_on date,
  status text not null default 'open' check (status in ('open', 'done', 'dropped')),
  task_id uuid references public.tasks(id) on delete set null,
  fingerprint text not null,                   -- md5(texto normalizado): reprocesar una transcripción no duplica
  created_at timestamptz not null default now()
);
call public.nexo_common('agreements');
create unique index if not exists agreements_unique on public.agreements (meeting_id, kind, fingerprint);

create or replace function public.text_fingerprint(t text) returns text
language sql immutable as $$
  select md5(btrim(regexp_replace(lower(coalesce(t, '')), '[^a-z0-9áéíóúñü]+', ' ', 'g')))
$$;
create or replace function public.agreements_fingerprint() returns trigger
language plpgsql as $$
begin
  new.fingerprint := public.text_fingerprint(new.text);
  if new.owner is null or btrim(new.owner) = '' then new.owner := 'Por definir'; end if;
  return new;
end $$;
drop trigger if exists agreements_fingerprint on public.agreements;
create trigger agreements_fingerprint before insert or update of text, owner on public.agreements
  for each row execute function public.agreements_fingerprint();

-- ---------- Plan de contenido ----------
create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  objective text,
  topic text not null check (char_length(topic) between 1 and 200),
  format text,                 -- reel, carrusel, post, historia, video, blog…
  channel text,                -- instagram, tiktok, facebook, web…
  publish_on date,
  copy text,
  script text,
  resources jsonb not null default '[]'::jsonb,    -- [{attachment_id | url, label}]
  status text not null default 'idea' check (status in ('idea', 'draft', 'production', 'review', 'approved', 'published')),
  notes text,
  created_at timestamptz not null default now()
);
call public.nexo_common('content_items');

-- Búsqueda en español sin acentos: configuración 'nexo_es' = spanish + unaccent (si la extensión existe).
do $$ begin
  begin
    create extension if not exists unaccent;
  exception when others then raise notice 'unaccent no disponible: búsqueda sin quitar acentos'; end;
  if not exists (select 1 from pg_ts_config where cfgname = 'nexo_es') then
    create text search configuration public.nexo_es (copy = pg_catalog.spanish);
  end if;
  if exists (select 1 from pg_extension where extname = 'unaccent') then
    alter text search configuration public.nexo_es
      alter mapping for hword, hword_part, word, asciiword, asciihword, hword_asciipart with unaccent, spanish_stem;
  end if;
end $$;

-- array_to_string es STABLE; las columnas generadas exigen IMMUTABLE (para text[] es seguro).
create or replace function public.f_join(a text[]) returns text language sql immutable parallel safe as $$ select array_to_string(a, ' ') $$;

-- ---------- Biblioteca ----------
create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  author text,
  kind text not null default 'link' check (kind in ('article', 'document', 'book', 'snippet', 'video', 'podcast', 'link', 'note')),
  source_url text,
  attachment_id uuid references public.attachments(id) on delete set null,
  tags text[] not null default '{}',
  area_id uuid references public.areas(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  read_status text not null default 'unread' check (read_status in ('unread', 'reading', 'read')),
  summary text,
  key_ideas text[] not null default '{}',
  applications text[] not null default '{}',
  scope text not null default 'link_only' check (scope in ('full', 'excerpt', 'transcript', 'link_only', 'none')),
  content text,                 -- texto disponible (completo, fragmento o transcripción)
  content_pages int,
  fingerprint text,             -- para detectar duplicados (url normalizada o hash del contenido)
  added_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
call public.nexo_common('resources');
alter table public.resources add column if not exists search tsvector
  generated always as (to_tsvector('public.nexo_es', coalesce(title, '') || ' ' || coalesce(author, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(content, '') || ' ' || public.f_join(tags))) stored;
create index if not exists resources_search on public.resources using gin (search);
create index if not exists resources_fingerprint on public.resources (user_id, fingerprint) where fingerprint is not null;

alter table public.notes add column if not exists search tsvector
  generated always as (to_tsvector('public.nexo_es', coalesce(title, '') || ' ' || coalesce(content, '') || ' ' || public.f_join(tags))) stored;
create index if not exists notes_search on public.notes using gin (search);

-- ---------- Estudios ----------
create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  score numeric(6,2) not null,
  max_score numeric(6,2) not null default 100,
  weight numeric(5,2),          -- porcentaje del total, opcional
  graded_on date,
  created_at timestamptz not null default now()
);
call public.nexo_common('grades');

-- ---------- Finanzas ----------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null default 'bank' check (kind in ('cash', 'bank', 'card', 'savings', 'other')),
  scope text not null default 'personal' check (scope in ('personal', 'business')),
  currency text not null default 'MXN',
  opening_balance numeric(14,2) not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
call public.nexo_common('accounts');

alter table public.transactions add column if not exists account_id uuid references public.accounts(id) on delete set null;
alter table public.transactions add column if not exists scope text not null default 'personal';
alter table public.transactions add column if not exists status text not null default 'paid';
alter table public.transactions add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.transactions add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.transactions add column if not exists transfer_id uuid;           -- las dos patas de una transferencia comparten id
alter table public.transactions add column if not exists receipt_attachment_id uuid references public.attachments(id) on delete set null;
alter table public.transactions add column if not exists currency text not null default 'MXN';
alter table public.transactions add column if not exists recurring_id uuid;
alter table public.transactions add column if not exists due_on date;
alter table public.transactions add column if not exists notes text;
alter table public.transactions drop constraint if exists transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check check (kind in ('expense', 'income', 'transfer_out', 'transfer_in'));
alter table public.transactions drop constraint if exists transactions_scope_check;
alter table public.transactions add constraint transactions_scope_check check (scope in ('personal', 'business'));
alter table public.transactions drop constraint if exists transactions_status_check;
alter table public.transactions add constraint transactions_status_check check (status in ('paid', 'pending', 'planned'));
call public.nexo_common('transactions');
create index if not exists transactions_user_status on public.transactions (user_id, status, occurred_on) where deleted_at is null;

create table if not exists public.recurring_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  kind text not null default 'subscription' check (kind in ('subscription', 'payment', 'income')),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'MXN',
  scope text not null default 'personal' check (scope in ('personal', 'business')),
  category text not null,
  cadence jsonb not null default '{"freq":"monthly","interval":1}'::jsonb,
  next_on date not null,
  account_id uuid references public.accounts(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);
call public.nexo_common('recurring_items');

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  scope text not null default 'personal' check (scope in ('personal', 'business')),
  category text not null,
  month date not null,            -- primer día del mes
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'MXN',
  created_at timestamptz not null default now()
);
call public.nexo_common('budgets');
create unique index if not exists budgets_unique on public.budgets (user_id, scope, category, month) where deleted_at is null;

-- ---------- Hábitos y revisiones ----------
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  area_id uuid references public.areas(id) on delete set null,
  frequency jsonb not null default '{"per":"day","times":1}'::jsonb,   -- {per: day|week, times, weekdays[]}
  color text,
  active boolean not null default true,
  paused_at timestamptz,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
call public.nexo_common('habits');

create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  logged_on date not null,
  value numeric(8,2) not null default 1,
  note text,
  created_at timestamptz not null default now()
);
call public.nexo_common('habit_logs');
create unique index if not exists habit_logs_unique on public.habit_logs (habit_id, logged_on) where deleted_at is null;

create table if not exists public.daily_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  review_on date not null,
  went_well text,
  blocked_by text,
  learned text,
  energy smallint check (energy between 1 and 5),
  tomorrow_priority text,
  ai_summary text,
  suggested jsonb,                -- [{task_id|title, reason}]
  created_at timestamptz not null default now()
);
call public.nexo_common('daily_reviews');
create unique index if not exists daily_reviews_unique on public.daily_reviews (user_id, review_on) where deleted_at is null;

create table if not exists public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start date not null,
  data jsonb not null default '{}'::jsonb,   -- {progress[], backlog[], patterns[], keep[], adjust[], actions[]}
  ai_generated_at timestamptz,
  created_at timestamptz not null default now()
);
call public.nexo_common('weekly_reviews');
create unique index if not exists weekly_reviews_unique on public.weekly_reviews (user_id, week_start) where deleted_at is null;

-- ---------- Prioridades del día ----------
create table if not exists public.priorities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  task_ids uuid[] not null default '{}',
  reasons jsonb not null default '{}'::jsonb,   -- {task_id: motivo}
  source text not null default 'user' check (source in ('user', 'ai')),
  created_at timestamptz not null default now()
);
call public.nexo_common('priorities');
create unique index if not exists priorities_unique on public.priorities (user_id, day) where deleted_at is null;

-- ---------- Memoria tipada ----------
alter table public.memories add column if not exists kind text not null default 'preference';
alter table public.memories add column if not exists source text not null default 'confirmed';
alter table public.memories add column if not exists origin text not null default 'ui';
alter table public.memories add column if not exists origin_id uuid;
alter table public.memories add column if not exists confidence numeric(3,2);
alter table public.memories drop constraint if exists memories_kind_check;
alter table public.memories add constraint memories_kind_check check (kind in ('preference', 'goal', 'routine', 'project', 'decision', 'constraint', 'style', 'fact'));
alter table public.memories drop constraint if exists memories_source_check;
alter table public.memories add constraint memories_source_check check (source in ('confirmed', 'inferred'));
call public.nexo_common('memories');

-- ---------- Historial de acciones del asistente (y deshacer) ----------
create table if not exists public.action_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  actor text not null check (actor in ('chat', 'siri', 'ui', 'cron', 'sync')),
  tool text not null,
  summary text not null,
  target_table text,
  target_id uuid,
  op text not null default 'update' check (op in ('insert', 'update', 'delete', 'other')),
  before jsonb,
  after jsonb,
  reversible boolean not null default false,
  undone_at timestamptz,
  batch_id uuid,
  created_at timestamptz not null default now()
);
alter table public.action_log enable row level security;
alter table public.action_log force row level security;
drop policy if exists "owner_select" on public.action_log;
create policy "owner_select" on public.action_log for select to authenticated using (user_id = auth.uid());
revoke all on public.action_log from anon, authenticated;
grant select on public.action_log to authenticated;
grant select, insert, update on public.action_log to service_role;
create index if not exists action_log_user_created on public.action_log (user_id, created_at desc);

-- El chat también se sincroniza/descarga (solo lectura desde el cliente de sincronización).
call public.nexo_common('chat_messages');

-- ---------- Valores iniciales por cuenta ----------
create or replace function public.ensure_defaults() returns jsonb
language plpgsql security invoker set search_path = public as $$
declare uid uuid := auth.uid(); s public.settings%rowtype;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  insert into public.settings (user_id) values (uid) on conflict (user_id) do nothing;
  if not exists (select 1 from public.areas where user_id = uid) then
    insert into public.areas (user_id, name, kind, color, icon, sort) values
      (uid, 'Vida personal', 'personal', '#06b6d4', '🏠', 1),
      (uid, 'VILLEDA', 'work', '#6366f1', '💼', 2),
      (uid, 'Estudios', 'study', '#f59e0b', '🎓', 3);
  end if;
  select * into s from public.settings where user_id = uid;
  return to_jsonb(s);
end $$;
revoke all on function public.ensure_defaults() from public, anon;
grant execute on function public.ensure_defaults() to authenticated;

-- ---------- Sincronización con control de conflictos ----------
-- Tablas que el cliente puede sincronizar y columnas que solo escribe el servidor.
create or replace function public.sync_tables() returns text[] language sql immutable as $$
  select array['settings','areas','clients','goals','projects','attachments','contacts','subjects','events','meetings','tasks',
               'inbox_items','notes','agreements','content_items','resources','grades','accounts','transactions','recurring_items',
               'budgets','habits','habit_logs','daily_reviews','weekly_reviews','priorities','memories']
$$;
create or replace function public.sync_readonly_cols() returns text[] language sql immutable as $$
  select array['id','user_id','version','updated_at','search','reminded_at','remind_attempts','reminder_status','ics_token']
$$;

-- Columnas de `row` que existen en la tabla y no son de solo lectura.
create or replace function public.sync_cols(p_table text, p_row jsonb) returns text[]
language sql stable set search_path = public as $$
  select coalesce(array_agg(c.column_name::text order by c.ordinal_position), '{}')
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = p_table
     and p_row ? c.column_name::text
     and not (c.column_name::text = any (public.sync_readonly_cols()))
$$;

-- p_changes: [{table, id, op: 'upsert'|'delete', base_version: int|null, row: {...}}]
-- Devuelve [{table, id, status: 'applied'|'conflict'|'rejected', version, server: fila actual (en conflicto), error}]
create or replace function public.sync_push(p_changes jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  ch jsonb; t text; rid uuid; op text; base int; row_j jsonb; cols text[]; cur int; cur_deleted timestamptz;
  server_row jsonb; results jsonb := '[]'::jsonb; col_list text; sel_list text;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  for ch in select * from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) loop
    t := ch->>'table'; op := coalesce(ch->>'op', 'upsert'); base := (ch->>'base_version')::int;
    row_j := coalesce(ch->'row', '{}'::jsonb);
    begin
      rid := (ch->>'id')::uuid;
      if t is null or not (t = any (public.sync_tables())) then
        results := results || jsonb_build_object('table', t, 'id', rid, 'status', 'rejected', 'error', 'tabla no sincronizable');
        continue;
      end if;
      execute format('select version, deleted_at from public.%I where id = $1', t) into cur, cur_deleted using rid;
      if cur is null then
        if op = 'delete' then
          results := results || jsonb_build_object('table', t, 'id', rid, 'status', 'applied', 'version', null);
          continue;
        end if;
        cols := public.sync_cols(t, row_j);
        col_list := (select string_agg(format('%I', c), ', ') from unnest(cols) c);
        sel_list := (select string_agg(format('r.%I', c), ', ') from unnest(cols) c);
        if col_list is null then
          execute format('insert into public.%I (id) values ($1)', t) using rid;
        else
          execute format('insert into public.%I (id, %s) select $1, %s from jsonb_populate_record(null::public.%I, $2) r', t, col_list, sel_list, t) using rid, row_j;
        end if;
        results := results || jsonb_build_object('table', t, 'id', rid, 'status', 'applied', 'version', 1);
      else
        if base is null or base <> cur then
          execute format('select to_jsonb(x) from public.%I x where id = $1', t) into server_row using rid;
          results := results || jsonb_build_object('table', t, 'id', rid, 'status', 'conflict', 'version', cur, 'server', server_row);
          continue;
        end if;
        if op = 'delete' then
          if cur_deleted is null then execute format('update public.%I set deleted_at = now() where id = $1', t) using rid; end if;
        else
          cols := public.sync_cols(t, row_j);
          col_list := (select string_agg(format('%I', c), ', ') from unnest(cols) c);
          sel_list := (select string_agg(format('r.%I', c), ', ') from unnest(cols) c);
          if col_list is not null then
            if array_length(cols, 1) = 1 then
              execute format('update public.%I set %s = (select %s from jsonb_populate_record(null::public.%I, $2) r) where id = $1', t, col_list, sel_list, t) using rid, row_j;
            else
              execute format('update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $2) r) where id = $1', t, col_list, sel_list, t) using rid, row_j;
            end if;
          end if;
        end if;
        execute format('select version from public.%I where id = $1', t) into cur using rid;
        results := results || jsonb_build_object('table', t, 'id', rid, 'status', 'applied', 'version', cur);
      end if;
    exception when unique_violation or foreign_key_violation or check_violation or invalid_text_representation or insufficient_privilege or not_null_violation or others then
      results := results || jsonb_build_object('table', t, 'id', ch->>'id', 'status', 'rejected', 'error', sqlerrm);
    end;
  end loop;
  return results;
end $$;
revoke all on function public.sync_push(jsonb) from public, anon;
grant execute on function public.sync_push(jsonb) to authenticated;

-- Cambios desde p_since (incluye borrados lógicos). Máx. 1000 filas por tabla; `more` indica que hay que seguir.
create or replace function public.sync_pull(p_since timestamptz default '1970-01-01', p_tables text[] default null)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare t text; rows jsonb; n int; out jsonb := '{}'::jsonb; tables text[] := coalesce(p_tables, public.sync_tables() || array['chat_messages']);
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  foreach t in array tables loop
    if not (t = any (public.sync_tables() || array['chat_messages'])) then continue; end if;
    execute format('select coalesce(jsonb_agg(to_jsonb(x) - ''search''), ''[]''::jsonb), count(*) from (select * from public.%I where updated_at > $1 order by updated_at limit 1001) x', t)
      into rows, n using p_since;
    if n > 1000 then rows := rows - 1000; end if;
    out := out || jsonb_build_object(t, jsonb_build_object('rows', rows, 'more', n > 1000));
  end loop;
  return jsonb_build_object('server_time', now(), 'tables', out);
end $$;
revoke all on function public.sync_pull(timestamptz, text[]) from public, anon;
grant execute on function public.sync_pull(timestamptz, text[]) to authenticated;

-- ---------- Deshacer una acción del asistente ----------
create or replace function public.undo_action(p_id uuid, p_user uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := coalesce(auth.uid(), case when current_user = 'service_role' then p_user end);
  a public.action_log%rowtype; cols text[]; col_list text; sel_list text; owner uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into a from public.action_log where id = p_id and user_id = uid;
  if not found then return jsonb_build_object('ok', false, 'error', 'Acción no encontrada'); end if;
  if a.undone_at is not null then return jsonb_build_object('ok', false, 'error', 'Ya se deshizo'); end if;
  if not a.reversible or a.target_table is null or a.target_id is null or not (a.target_table = any (public.sync_tables())) then
    return jsonb_build_object('ok', false, 'error', 'Esta acción no se puede deshacer');
  end if;
  execute format('select user_id from public.%I where id = $1', a.target_table) into owner using a.target_id;
  if owner is distinct from uid then return jsonb_build_object('ok', false, 'error', 'Registro no encontrado'); end if;
  if a.op = 'insert' then
    execute format('update public.%I set deleted_at = now() where id = $1', a.target_table) using a.target_id;
  elsif a.op = 'delete' then
    execute format('update public.%I set deleted_at = null where id = $1', a.target_table) using a.target_id;
  elsif a.op = 'update' and a.before is not null then
    cols := public.sync_cols(a.target_table, a.before);
    cols := array(select c from unnest(cols) c where c not in ('created_at', 'deleted_at'));
    col_list := (select string_agg(format('%I', c), ', ') from unnest(cols) c);
    sel_list := (select string_agg(format('r.%I', c), ', ') from unnest(cols) c);
    if col_list is not null then
      if array_length(cols, 1) = 1 then
        execute format('update public.%I set %s = (select %s from jsonb_populate_record(null::public.%I, $2) r) where id = $1', a.target_table, col_list, sel_list, a.target_table) using a.target_id, a.before;
      else
        execute format('update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $2) r) where id = $1', a.target_table, col_list, sel_list, a.target_table) using a.target_id, a.before;
      end if;
    end if;
  else
    return jsonb_build_object('ok', false, 'error', 'Esta acción no se puede deshacer');
  end if;
  update public.action_log set undone_at = now() where id = p_id;
  return jsonb_build_object('ok', true, 'table', a.target_table, 'id', a.target_id);
end $$;
revoke all on function public.undo_action(uuid, uuid) from public, anon;
grant execute on function public.undo_action(uuid, uuid) to authenticated, service_role;

-- ---------- Búsqueda global ----------
create or replace function public.search_all(p_q text, p_limit int default 30, p_user uuid default null)
returns table (kind text, id uuid, title text, snippet text, rank real, updated_at timestamptz)
language plpgsql security invoker set search_path = public as $$
declare q tsquery; uid uuid := coalesce(auth.uid(), case when current_user = 'service_role' then p_user end); like_q text;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if coalesce(btrim(p_q), '') = '' then return; end if;
  q := websearch_to_tsquery('public.nexo_es', p_q);
  like_q := '%' || btrim(p_q) || '%';
  return query
  with hits as (
    select 'task'::text k, t.id, t.title, left(coalesce(t.description, t.notes, ''), 160) sn,
           ts_rank(to_tsvector('public.nexo_es', t.title || ' ' || coalesce(t.description, '') || ' ' || coalesce(t.notes, '')), q) r, t.updated_at u
      from public.tasks t where t.user_id = uid and t.deleted_at is null
       and (to_tsvector('public.nexo_es', t.title || ' ' || coalesce(t.description, '') || ' ' || coalesce(t.notes, '')) @@ q or t.title ilike like_q)
    union all
    select 'note', n.id, coalesce(n.title, left(n.content, 60)), left(n.content, 160), ts_rank(n.search, q), n.updated_at
      from public.notes n where n.user_id = uid and n.deleted_at is null and (n.search @@ q or n.title ilike like_q)
    union all
    select 'resource', r.id, r.title, left(coalesce(r.summary, r.content, r.source_url, ''), 160), ts_rank(r.search, q), r.updated_at
      from public.resources r where r.user_id = uid and r.deleted_at is null and (r.search @@ q or r.title ilike like_q)
    union all
    select 'meeting', m.id, m.title, left(coalesce(m.objective, m.notes, ''), 160),
           ts_rank(to_tsvector('public.nexo_es', m.title || ' ' || coalesce(m.objective, '') || ' ' || coalesce(m.notes, '') || ' ' || coalesce(m.transcript, '')), q), m.updated_at
      from public.meetings m where m.user_id = uid and m.deleted_at is null
       and (to_tsvector('public.nexo_es', m.title || ' ' || coalesce(m.objective, '') || ' ' || coalesce(m.notes, '') || ' ' || coalesce(m.transcript, '')) @@ q or m.title ilike like_q)
    union all
    select 'agreement', a.id, a.text, 'Acuerdo · ' || a.owner, ts_rank(to_tsvector('public.nexo_es', a.text), q), a.updated_at
      from public.agreements a where a.user_id = uid and a.deleted_at is null and (to_tsvector('public.nexo_es', a.text) @@ q or a.text ilike like_q)
    union all
    select 'client', c.id, c.name, left(coalesce(c.notes, c.industry, ''), 160), ts_rank(to_tsvector('public.nexo_es', c.name || ' ' || coalesce(c.notes, '')), q), c.updated_at
      from public.clients c where c.user_id = uid and c.deleted_at is null and (to_tsvector('public.nexo_es', c.name || ' ' || coalesce(c.notes, '')) @@ q or c.name ilike like_q)
    union all
    select 'contact', ct.id, ct.name, coalesce(ct.company, ct.email, ''), 0.5::real, ct.updated_at
      from public.contacts ct where ct.user_id = uid and ct.deleted_at is null and (ct.name ilike like_q or ct.email ilike like_q or ct.company ilike like_q)
    union all
    select 'project', p.id, p.name, left(coalesce(p.description, ''), 160), ts_rank(to_tsvector('public.nexo_es', p.name || ' ' || coalesce(p.description, '')), q), p.updated_at
      from public.projects p where p.user_id = uid and p.deleted_at is null and (to_tsvector('public.nexo_es', p.name || ' ' || coalesce(p.description, '')) @@ q or p.name ilike like_q)
    union all
    select 'content', ci.id, ci.topic, left(coalesce(ci.copy, ''), 160), ts_rank(to_tsvector('public.nexo_es', ci.topic || ' ' || coalesce(ci.copy, '') || ' ' || coalesce(ci.script, '')), q), ci.updated_at
      from public.content_items ci where ci.user_id = uid and ci.deleted_at is null and (to_tsvector('public.nexo_es', ci.topic || ' ' || coalesce(ci.copy, '') || ' ' || coalesce(ci.script, '')) @@ q or ci.topic ilike like_q)
    union all
    select 'inbox', i.id, left(coalesce(i.raw_text, i.url, ''), 80), 'Bandeja de entrada', 0.3::real, i.updated_at
      from public.inbox_items i where i.user_id = uid and i.deleted_at is null and i.status = 'pending' and (i.raw_text ilike like_q or i.url ilike like_q)
  )
  select h.k, h.id, h.title, h.sn, h.r, h.u from hits h order by h.r desc, h.u desc limit greatest(1, least(p_limit, 100));
end $$;
revoke all on function public.search_all(text, int, uuid) from public, anon;
grant execute on function public.search_all(text, int, uuid) to authenticated, service_role;

-- ---------- Duplicados ----------
create or replace function public.find_contact_duplicates(p_name text, p_email text default null, p_phone text default null, p_user uuid default null)
returns setof public.contacts
language sql stable security invoker set search_path = public as $$
  select * from public.contacts c
   where c.user_id = coalesce(auth.uid(), case when current_user = 'service_role' then p_user end) and c.deleted_at is null
     and (lower(btrim(c.name)) = lower(btrim(p_name))
          or (p_email is not null and p_email <> '' and lower(c.email) = lower(btrim(p_email)))
          -- teléfonos: últimos 10 dígitos (ignora lada +52 y formato)
          or (p_phone is not null and length(regexp_replace(p_phone, '\D', '', 'g')) >= 7
              and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10)))
$$;
revoke all on function public.find_contact_duplicates(text, text, text, uuid) from public, anon;
grant execute on function public.find_contact_duplicates(text, text, text, uuid) to authenticated, service_role;
