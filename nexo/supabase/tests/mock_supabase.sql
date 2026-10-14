-- Simula lo mínimo de Supabase para probar schema.sql en un Postgres local.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
end $$;
grant usage on schema public, auth to anon, authenticated, service_role;
-- Como los proyectos Supabase actuales: SIN privilegios implícitos en tablas nuevas (changelog 45329).
-- schema.sql debe conceder explícitamente todo lo que use cada rol.
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b') on conflict do nothing;
