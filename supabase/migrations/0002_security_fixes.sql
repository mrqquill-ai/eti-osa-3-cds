-- =============================================================
-- Security & bug-fix migration
-- Run this in the Supabase SQL editor AFTER the initial migration.
-- =============================================================

-- ─── 1. Admin secrets table (invisible to anon) ─────────────
-- Stores the admin PIN separately so it cannot be read via the API.
create table if not exists public.admin_secrets (
  id   integer primary key default 1,
  pin  text not null default '2025',
  constraint single_row_secrets check (id = 1)
);
alter table public.admin_secrets enable row level security;
-- No RLS policies = anon has zero access to this table.

insert into public.admin_secrets (id, pin) values (1, '2025')
on conflict (id) do nothing;

-- ─── 2. Lock down RLS ───────────────────────────────────────
-- Registrations: anon can only SELECT. All writes go through RPCs.
drop policy if exists "anon all registrations" on public.registrations;
drop policy if exists "anon read registrations" on public.registrations;
create policy "anon read registrations" on public.registrations
  for select using (true);

-- Session settings: anon can only SELECT.
drop policy if exists "anon all settings" on public.session_settings;
drop policy if exists "anon read settings" on public.session_settings;
create policy "anon read settings" on public.session_settings
  for select using (true);

-- ─── 3. Input validation constraints ────────────────────────
-- Protect against absurdly long inputs.
do $$
begin
  begin
    alter table public.registrations
      add constraint chk_full_name_length check (length(full_name) between 2 and 200);
  exception when duplicate_object then null;
  end;
  begin
    alter table public.registrations
      add constraint chk_state_code_length check (length(state_code) <= 20);
  exception when duplicate_object then null;
  end;
end $$;

-- ─── 4. Fix register_corps_member ───────────────────────────
-- Now security definer (so it can INSERT despite read-only RLS).
-- Fixes: voiding bug (counts ALL rows), spam limit, server-side geofence.
create or replace function public.register_corps_member(
  p_state_code text,
  p_full_name  text,
  p_device_id  text default null,
  p_lat        double precision default null,
  p_lng        double precision default null
)
returns public.registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.session_settings;
  v_next_q   integer;
  v_batch    integer;
  v_row      public.registrations;
  v_distance double precision;
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

  -- Server-side geofence: if coordinates provided, must be within 200m.
  -- Venue: Jamatul Islamiyya Primary School, 52 Baale St, Lekki
  if p_lat is not null and p_lng is not null then
    v_distance := 6371000 * 2 * asin(sqrt(
      power(sin(radians(p_lat - 6.4360344) / 2), 2) +
      cos(radians(6.4360344)) * cos(radians(p_lat)) *
      power(sin(radians(p_lng - 3.523451) / 2), 2)
    ));
    if v_distance > 200 then
      raise exception 'outside_geofence' using errcode = 'P0004';
    end if;
  end if;

  -- Count ALL rows (including voided) to avoid duplicate queue_number.
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

-- ─── 5. Verify admin PIN (for dashboard login) ─────────────
create or replace function public.verify_admin_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (select 1 from admin_secrets where id = 1 and pin = p_pin);
end;
$$;

-- ─── 6. Change admin PIN ────────────────────────────────────
create or replace function public.admin_change_pin(
  p_current_pin text,
  p_new_pin     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from admin_secrets where id = 1 and pin = p_current_pin) then
    raise exception 'invalid_admin_pin' using errcode = 'P0005';
  end if;
  if length(p_new_pin) < 4 then
    raise exception 'pin_too_short' using errcode = 'P0006';
  end if;
  update admin_secrets set pin = p_new_pin where id = 1;
end;
$$;

-- ─── 7. Admin: toggle served ────────────────────────────────
create or replace function public.admin_toggle_served(
  p_pin             text,
  p_registration_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.registrations;
begin
  if not exists (select 1 from admin_secrets where id = 1 and pin = p_pin) then
    raise exception 'invalid_admin_pin' using errcode = 'P0005';
  end if;

  select * into v_row from registrations where id = p_registration_id;
  if not found then
    raise exception 'registration_not_found';
  end if;

  if v_row.served_at is not null then
    update registrations set served_at = null where id = p_registration_id;
  else
    update registrations set served_at = now() where id = p_registration_id;
  end if;
end;
$$;

-- ─── 8. Admin: toggle void ──────────────────────────────────
create or replace function public.admin_toggle_void(
  p_pin             text,
  p_registration_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.registrations;
begin
  if not exists (select 1 from admin_secrets where id = 1 and pin = p_pin) then
    raise exception 'invalid_admin_pin' using errcode = 'P0005';
  end if;

  select * into v_row from registrations where id = p_registration_id;
  if not found then
    raise exception 'registration_not_found';
  end if;

  update registrations set voided = not v_row.voided where id = p_registration_id;
end;
$$;

-- ─── 9. Admin: call next wave ───────────────────────────────
create or replace function public.admin_call_next_batch(p_pin text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  if not exists (select 1 from admin_secrets where id = 1 and pin = p_pin) then
    raise exception 'invalid_admin_pin' using errcode = 'P0005';
  end if;

  update session_settings
    set current_batch = current_batch + 1
    where id = 1
    returning current_batch into v_next;

  return v_next;
end;
$$;

-- ─── 10. Admin: go back one wave ────────────────────────────
create or replace function public.admin_go_back_batch(p_pin text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev integer;
begin
  if not exists (select 1 from admin_secrets where id = 1 and pin = p_pin) then
    raise exception 'invalid_admin_pin' using errcode = 'P0005';
  end if;

  update session_settings
    set current_batch = greatest(current_batch - 1, 0)
    where id = 1
    returning current_batch into v_prev;

  return v_prev;
end;
$$;

-- ─── 11. Admin: toggle registration open/closed ─────────────
create or replace function public.admin_toggle_registration(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new boolean;
begin
  if not exists (select 1 from admin_secrets where id = 1 and pin = p_pin) then
    raise exception 'invalid_admin_pin' using errcode = 'P0005';
  end if;

  update session_settings
    set registration_open = not registration_open
    where id = 1
    returning registration_open into v_new;

  return v_new;
end;
$$;

-- ─── 12. Admin: reset day (replaces old reset_day) ──────────
create or replace function public.admin_reset_day(
  p_pin        text,
  p_batch_size integer default 30
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from admin_secrets where id = 1 and pin = p_pin) then
    raise exception 'invalid_admin_pin' using errcode = 'P0005';
  end if;

  insert into public.registrations_archive
    (id, state_code, full_name, queue_number, batch_number, registered_at, served_at, voided, device_id, session_date, archived_at)
    select r.id, r.state_code, r.full_name, r.queue_number, r.batch_number, r.registered_at, r.served_at, r.voided, r.device_id, current_date, now()
    from public.registrations r;

  delete from public.registrations where id is not null;

  update public.session_settings
     set batch_size = p_batch_size,
         current_batch = 0,
         registration_open = true,
         session_started_at = now()
   where id = 1;
end;
$$;
