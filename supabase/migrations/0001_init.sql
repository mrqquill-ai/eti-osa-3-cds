-- CDS Clearance Queue — initial schema
-- Run this in the Supabase SQL editor (or via supabase db push).

-- =========================================================
-- Tables
-- =========================================================

create table if not exists public.session_settings (
  id              integer primary key default 1,
  batch_size      integer not null default 30 check (batch_size between 20 and 50),
  current_batch   integer not null default 0,
  registration_open boolean not null default true,
  session_started_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);

-- Seed the single settings row.
insert into public.session_settings (id) values (1)
on conflict (id) do nothing;

create table if not exists public.registrations (
  id             uuid primary key default gen_random_uuid(),
  state_code     text not null,
  full_name      text not null,
  queue_number   integer not null,
  batch_number   integer not null,
  registered_at  timestamptz not null default now(),
  served_at      timestamptz,
  voided         boolean not null default false,
  device_id      text
);

-- Unique queue numbers per active session.
create unique index if not exists registrations_queue_number_key
  on public.registrations (queue_number);

-- A given state_code can only register once per active session
-- (enforced for non-voided rows so a voided entry can be re-done).
create unique index if not exists registrations_active_state_code_key
  on public.registrations (state_code)
  where voided = false;

create index if not exists registrations_batch_idx on public.registrations (batch_number);
create index if not exists registrations_registered_at_idx on public.registrations (registered_at);

-- Archive table for "Reset day".
-- Created manually (not with LIKE) to avoid inheriting unique indexes
-- from the live table, which would block archiving multiple days.
create table if not exists public.registrations_archive (
  id             uuid default gen_random_uuid(),
  state_code     text,
  full_name      text,
  queue_number   integer,
  batch_number   integer,
  registered_at  timestamptz,
  served_at      timestamptz,
  voided         boolean default false,
  device_id      text,
  archived_at    timestamptz not null default now()
);

-- =========================================================
-- Atomic registration function
-- Assigns the next queue_number and computes batch_number in a single
-- transaction so concurrent inserts from multiple manager devices
-- never collide.
-- =========================================================

create or replace function public.register_corps_member(
  p_state_code text,
  p_full_name  text,
  p_device_id  text default null
)
returns public.registrations
language plpgsql
as $$
declare
  v_settings public.session_settings;
  v_next_q   integer;
  v_batch    integer;
  v_row      public.registrations;
begin
  -- Lock the settings row to serialize queue assignment.
  select * into v_settings from public.session_settings where id = 1 for update;

  if not v_settings.registration_open then
    raise exception 'registration_closed' using errcode = 'P0001';
  end if;

  -- Reject duplicate state codes for active (non-voided) entries.
  if exists (
    select 1 from public.registrations
    where state_code = p_state_code and voided = false
  ) then
    raise exception 'duplicate_state_code' using errcode = 'P0002';
  end if;

  -- Spam protection: max 5 registrations per device per session.
  if p_device_id is not null and (
    select count(*) from public.registrations
    where device_id = p_device_id
      and registered_at >= v_settings.session_started_at
  ) >= 5 then
    raise exception 'device_limit_reached' using errcode = 'P0003';
  end if;

  -- Count ALL rows (including voided) so voiding never causes a
  -- duplicate queue_number collision with the unique index.
  select coalesce(max(queue_number), 0) + 1
    into v_next_q
    from public.registrations;

  v_batch := ceil(v_next_q::numeric / v_settings.batch_size)::int;

  insert into public.registrations (
    state_code, full_name, queue_number, batch_number, device_id
  ) values (
    p_state_code, p_full_name, v_next_q, v_batch, p_device_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- =========================================================
-- Reset day: archive everything and reset settings.
-- =========================================================

create or replace function public.reset_day(p_batch_size integer default 30)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.registrations_archive
    select r.*, now() from public.registrations r;

  -- Supabase blocks bare DELETEs as a safety net; the explicit WHERE
  -- clause satisfies the check while still removing every row.
  delete from public.registrations where id is not null;

  update public.session_settings
     set batch_size = p_batch_size,
         current_batch = 0,
         registration_open = true,
         session_started_at = now()
   where id = 1;
end;
$$;

-- =========================================================
-- Realtime + RLS
-- =========================================================

-- Add tables to the realtime publication, but skip silently if already added
-- (so this migration is safe to re-run).
do $$
begin
  begin
    alter publication supabase_realtime add table public.registrations;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.session_settings;
  exception when duplicate_object then null;
  end;
end $$;

-- v1 has no auth — allow anon read/write through RLS.
alter table public.registrations enable row level security;
alter table public.session_settings enable row level security;

drop policy if exists "anon all registrations" on public.registrations;
create policy "anon all registrations" on public.registrations
  for all using (true) with check (true);

drop policy if exists "anon all settings" on public.session_settings;
create policy "anon all settings" on public.session_settings
  for all using (true) with check (true);
