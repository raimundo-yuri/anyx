-- Run in a dedicated Supabase project's SQL Editor. No passwords or API keys here.
begin;
create table if not exists public.dexfin_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  format_version integer not null default 6 check (format_version = 6),
  document jsonb check (document is null or (jsonb_typeof(document) = 'object' and octet_length(document::text) <= 4194304)),
  updated_at timestamptz not null default now()
);
create table if not exists public.dexfin_sessions (
  id text primary key check (id ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists dexfin_sessions_user on public.dexfin_sessions(user_id);
create table if not exists public.dexfin_limits (
  bucket text primary key check (length(bucket) <= 100),
  started_at timestamptz not null,
  attempts integer not null check (attempts >= 0)
);
create index if not exists dexfin_limits_started on public.dexfin_limits(started_at);
alter table public.dexfin_state enable row level security;
alter table public.dexfin_sessions enable row level security;
alter table public.dexfin_limits enable row level security;
-- User JWTs and anonymous keys cannot bypass server validation or inspect sessions.
revoke all on public.dexfin_state, public.dexfin_sessions, public.dexfin_limits from public, anon, authenticated;
grant select, insert, update, delete on public.dexfin_state, public.dexfin_sessions, public.dexfin_limits to service_role;

create or replace function public.dexfin_open(p_user_id uuid) returns void
language sql security invoker set search_path = pg_catalog, public as $$
  insert into public.dexfin_state(user_id) values (p_user_id) on conflict (user_id) do nothing;
$$;
create or replace function public.dexfin_commit(p_user_id uuid, p_session_id text, p_expected bigint, p_document jsonb, p_format integer) returns bigint
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare result bigint;
begin
  update public.dexfin_state set document = p_document, revision = revision + 1, format_version = p_format, updated_at = now()
  where user_id = p_user_id and revision = p_expected and exists (select 1 from public.dexfin_sessions s where s.id = p_session_id and s.user_id = p_user_id and s.revoked_at is null and s.expires_at > now()) returning revision into result;
  return result;
end;
$$;
create or replace function public.dexfin_rate_limit(p_bucket text, p_limit integer, p_seconds integer) returns boolean
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare total integer;
begin
  if p_limit < 1 or p_limit > 100 or p_seconds < 1 or p_seconds > 3600 then return false; end if;
  delete from public.dexfin_limits where started_at < now() - interval '1 day';
  insert into public.dexfin_limits(bucket, started_at, attempts) values(p_bucket, now(), 1)
  on conflict(bucket) do update set
    attempts = case when dexfin_limits.started_at < now() - make_interval(secs => p_seconds) then 1 else least(dexfin_limits.attempts + 1, p_limit + 1) end,
    started_at = case when dexfin_limits.started_at < now() - make_interval(secs => p_seconds) then now() else dexfin_limits.started_at end
  returning attempts into total;
  return total <= p_limit;
end;
$$;
revoke all on function public.dexfin_open(uuid), public.dexfin_commit(uuid,text,bigint,jsonb,integer), public.dexfin_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.dexfin_open(uuid), public.dexfin_commit(uuid,text,bigint,jsonb,integer), public.dexfin_rate_limit(text,integer,integer) to service_role;
commit;
