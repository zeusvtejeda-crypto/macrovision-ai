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
