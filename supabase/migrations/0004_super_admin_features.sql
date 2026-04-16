-- =============================================================
-- Super Admin Features migration
-- Run in Supabase SQL editor AFTER 0003_super_admin.sql
-- =============================================================

-- ─── 1. Activity Log table ──────────────────────────────────
create table if not exists public.activity_log (
  id         uuid primary key default gen_random_uuid(),
  action     text not null,
  details    text,
  role       text not null default 'executive',  -- 'executive' or 'super_admin'
  created_at timestamptz not null default now()
);
alter table public.activity_log enable row level security;
-- Only readable via RPCs (security definer), not directly
create policy "anon read activity_log" on public.activity_log for select using (true);

-- ─── 2. Announcements column on session_settings ────────────
alter table public.session_settings
  add column if not exists announcement text default '',
  add column if not exists exec_frozen boolean not null default false;

-- ─── 3. Notes column on registrations ───────────────────────
alter table public.registrations
  add column if not exists admin_note text default '';

-- ─── 4. Executive sessions tracking table ───────────────────
create table if not exists public.exec_sessions (
  id          uuid primary key default gen_random_uuid(),
  device_id   text not null,
  page        text not null default 'manager',  -- 'manager' or 'dashboard'
  last_seen   timestamptz not null default now()
);
alter table public.exec_sessions enable row level security;
create policy "anon all exec_sessions" on public.exec_sessions for all using (true);

-- ─── 5. Log an activity (internal helper) ───────────────────
create or replace function public.log_activity(
  p_action  text,
  p_details text default null,
  p_role    text default 'executive'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into activity_log (action, details, role) values (p_action, p_details, p_role);
  -- Keep only last 500 entries to avoid bloat
  delete from activity_log where id in (
    select id from activity_log order by created_at desc offset 500
  );
end;
$$;

-- ─── 6. Get activity log (super admin only) ─────────────────
create or replace function public.super_admin_get_activity_log(
  p_super_pin text,
  p_limit     integer default 100
)
returns setof public.activity_log
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from admin_secrets where id = 1 and super_pin = p_super_pin) then
    raise exception 'invalid_super_admin_pin' using errcode = 'P0010';
  end if;
  return query select * from activity_log order by created_at desc limit p_limit;
end;
$$;

-- ─── 7. Set announcement (super admin only) ─────────────────
create or replace function public.super_admin_set_announcement(
  p_super_pin    text,
  p_announcement text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from admin_secrets where id = 1 and super_pin = p_super_pin) then
    raise exception 'invalid_super_admin_pin' using errcode = 'P0010';
  end if;
  update session_settings set announcement = coalesce(p_announcement, '') where id = 1;
  perform log_activity('announcement_set', p_announcement, 'super_admin');
end;
$$;

-- ─── 8. Toggle executive freeze (super admin only) ──────────
create or replace function public.super_admin_toggle_freeze(p_super_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_new boolean;
begin
  if not exists (select 1 from admin_secrets where id = 1 and super_pin = p_super_pin) then
    raise exception 'invalid_super_admin_pin' using errcode = 'P0010';
  end if;
  update session_settings set exec_frozen = not exec_frozen where id = 1 returning exec_frozen into v_new;
  perform log_activity('exec_freeze_toggle', case when v_new then 'frozen' else 'unfrozen' end, 'super_admin');
  return v_new;
end;
$$;

-- ─── 9. Override wave assignment (super admin only) ─────────
create or replace function public.super_admin_move_to_wave(
  p_super_pin       text,
  p_registration_id uuid,
  p_target_wave     integer
)
returns public.registrations
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.registrations;
begin
  if not exists (select 1 from admin_secrets where id = 1 and super_pin = p_super_pin) then
    raise exception 'invalid_super_admin_pin' using errcode = 'P0010';
  end if;
  update registrations set batch_number = p_target_wave where id = p_registration_id returning * into v_row;
  if not found then raise exception 'registration_not_found'; end if;
  perform log_activity('move_to_wave', v_row.full_name || ' moved to wave ' || p_target_wave, 'super_admin');
  return v_row;
end;
$$;

-- ─── 10. Set admin note on an entry (super admin only) ──────
create or replace function public.super_admin_set_note(
  p_super_pin       text,
  p_registration_id uuid,
  p_note            text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from admin_secrets where id = 1 and super_pin = p_super_pin) then
    raise exception 'invalid_super_admin_pin' using errcode = 'P0010';
  end if;
  update registrations set admin_note = coalesce(p_note, '') where id = p_registration_id;
end;
$$;

-- ─── 11. Swap queue positions (super admin only) ────────────
create or replace function public.super_admin_swap_positions(
  p_super_pin text,
  p_id_a      uuid,
  p_id_b      uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_q_a integer;
  v_q_b integer;
  v_b_a integer;
  v_b_b integer;
begin
  if not exists (select 1 from admin_secrets where id = 1 and super_pin = p_super_pin) then
    raise exception 'invalid_super_admin_pin' using errcode = 'P0010';
  end if;
  select queue_number, batch_number into v_q_a, v_b_a from registrations where id = p_id_a;
  select queue_number, batch_number into v_q_b, v_b_b from registrations where id = p_id_b;
  if v_q_a is null or v_q_b is null then raise exception 'registration_not_found'; end if;
  update registrations set queue_number = v_q_b, batch_number = v_b_b where id = p_id_a;
  update registrations set queue_number = v_q_a, batch_number = v_b_a where id = p_id_b;
  perform log_activity('swap_positions', 'Swapped Q#' || v_q_a || ' and Q#' || v_q_b, 'super_admin');
end;
$$;

-- ─── 12. Get archive data for past days (super admin only) ──
create or replace function public.super_admin_get_archives(
  p_super_pin text,
  p_date      date default null
)
returns setof public.registrations_archive
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from admin_secrets where id = 1 and super_pin = p_super_pin) then
    raise exception 'invalid_super_admin_pin' using errcode = 'P0010';
  end if;
  if p_date is not null then
    return query select * from registrations_archive where session_date = p_date order by queue_number;
  else
    return query select * from registrations_archive order by session_date desc, queue_number limit 2000;
  end if;
end;
$$;

-- ─── 13. Get distinct archive dates ─────────────────────────
create or replace function public.super_admin_get_archive_dates(p_super_pin text)
returns table(session_date date, entry_count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from admin_secrets where id = 1 and super_pin = p_super_pin) then
    raise exception 'invalid_super_admin_pin' using errcode = 'P0010';
  end if;
  return query
    select ra.session_date, count(*) as entry_count
    from registrations_archive ra
    where ra.session_date is not null
    group by ra.session_date
    order by ra.session_date desc;
end;
$$;

-- ─── 14. Find duplicates ────────────────────────────────────
create or replace function public.super_admin_find_duplicates(p_super_pin text)
returns table(full_name text, state_code text, match_count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from admin_secrets where id = 1 and super_pin = p_super_pin) then
    raise exception 'invalid_super_admin_pin' using errcode = 'P0010';
  end if;
  -- Find names that appear more than once (even across voided/active)
  return query
    select r.full_name, r.state_code, count(*) as match_count
    from registrations r
    group by r.full_name, r.state_code
    having count(*) > 1
    order by count(*) desc;
end;
$$;

-- ─── 15. Add logging to existing admin actions ──────────────
-- We recreate the key functions to add logging

create or replace function public.admin_call_next_batch(p_pin text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_next integer; v_role text;
begin
  if not exists (select 1 from admin_secrets where id = 1 and (pin = p_pin or super_pin = p_pin)) then
    raise exception 'invalid_admin_pin' using errcode = 'P0005';
  end if;
  -- Check if frozen and user is executive (not super admin)
  if exists (select 1 from session_settings where id = 1 and exec_frozen = true)
     and not exists (select 1 from admin_secrets where id = 1 and super_pin = p_pin) then
    raise exception 'dashboard_frozen' using errcode = 'P0012';
  end if;
  select case when super_pin = p_pin then 'super_admin' else 'executive' end into v_role from admin_secrets where id = 1;
  update session_settings set current_batch = current_batch + 1 where id = 1 returning current_batch into v_next;
  perform log_activity('call_wave', 'Called wave ' || v_next, v_role);
  return v_next;
end;
$$;

create or replace function public.admin_toggle_served(
  p_pin             text,
  p_registration_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.registrations; v_role text;
begin
  if not exists (select 1 from admin_secrets where id = 1 and (pin = p_pin or super_pin = p_pin)) then
    raise exception 'invalid_admin_pin' using errcode = 'P0005';
  end if;
  if exists (select 1 from session_settings where id = 1 and exec_frozen = true)
     and not exists (select 1 from admin_secrets where id = 1 and super_pin = p_pin) then
    raise exception 'dashboard_frozen' using errcode = 'P0012';
  end if;
  select case when super_pin = p_pin then 'super_admin' else 'executive' end into v_role from admin_secrets where id = 1;
  select * into v_row from registrations where id = p_registration_id;
  if not found then raise exception 'registration_not_found'; end if;
  if v_row.served_at is not null then
    update registrations set served_at = null where id = p_registration_id;
    perform log_activity('unmark_served', v_row.full_name, v_role);
  else
    update registrations set served_at = now() where id = p_registration_id;
    perform log_activity('mark_served', v_row.full_name, v_role);
  end if;
end;
$$;

create or replace function public.admin_toggle_void(
  p_pin             text,
  p_registration_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.registrations; v_role text;
begin
  if not exists (select 1 from admin_secrets where id = 1 and (pin = p_pin or super_pin = p_pin)) then
    raise exception 'invalid_admin_pin' using errcode = 'P0005';
  end if;
  if exists (select 1 from session_settings where id = 1 and exec_frozen = true)
     and not exists (select 1 from admin_secrets where id = 1 and super_pin = p_pin) then
    raise exception 'dashboard_frozen' using errcode = 'P0012';
  end if;
  select case when super_pin = p_pin then 'super_admin' else 'executive' end into v_role from admin_secrets where id = 1;
  select * into v_row from registrations where id = p_registration_id;
  if not found then raise exception 'registration_not_found'; end if;
  update registrations set voided = not v_row.voided where id = p_registration_id;
  perform log_activity(case when v_row.voided then 'restore' else 'void' end, v_row.full_name, v_role);
end;
$$;

create or replace function public.admin_toggle_registration(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_new boolean; v_role text;
begin
  if not exists (select 1 from admin_secrets where id = 1 and (pin = p_pin or super_pin = p_pin)) then
    raise exception 'invalid_admin_pin' using errcode = 'P0005';
  end if;
  select case when super_pin = p_pin then 'super_admin' else 'executive' end into v_role from admin_secrets where id = 1;
  update session_settings set registration_open = not registration_open where id = 1 returning registration_open into v_new;
  perform log_activity(case when v_new then 'registration_opened' else 'registration_closed' end, null, v_role);
  return v_new;
end;
$$;

create or replace function public.admin_reset_day(
  p_pin        text,
  p_batch_size integer default 30
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer; v_role text;
begin
  if not exists (select 1 from admin_secrets where id = 1 and (pin = p_pin or super_pin = p_pin)) then
    raise exception 'invalid_admin_pin' using errcode = 'P0005';
  end if;
  select case when super_pin = p_pin then 'super_admin' else 'executive' end into v_role from admin_secrets where id = 1;
  select count(*) into v_count from registrations;

  insert into public.registrations_archive
    (id, state_code, full_name, queue_number, batch_number, registered_at, served_at, voided, device_id, session_date, archived_at)
    select r.id, r.state_code, r.full_name, r.queue_number, r.batch_number, r.registered_at, r.served_at, r.voided, r.device_id, current_date, now()
    from public.registrations r;

  delete from public.registrations where id is not null;

  update public.session_settings
     set batch_size = p_batch_size,
         current_batch = 0,
         registration_open = true,
         session_started_at = now(),
         announcement = '',
         exec_frozen = false
   where id = 1;

  perform log_activity('reset_day', v_count || ' entries archived', v_role);
end;
$$;

-- ─── 16. Heartbeat for executive session tracking ───────────
create or replace function public.exec_heartbeat(p_device_id text, p_page text default 'manager')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into exec_sessions (device_id, page, last_seen)
  values (p_device_id, p_page, now())
  on conflict (id) do nothing;
  -- Upsert by device_id
  delete from exec_sessions where device_id = p_device_id and id != (
    select id from exec_sessions where device_id = p_device_id order by last_seen desc limit 1
  );
  update exec_sessions set last_seen = now(), page = p_page where device_id = p_device_id;
  -- Clean up stale sessions (older than 5 minutes)
  delete from exec_sessions where last_seen < now() - interval '5 minutes';
end;
$$;

-- ─── 17. Get active exec sessions (super admin) ────────────
create or replace function public.super_admin_get_active_sessions(p_super_pin text)
returns table(page text, device_count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from admin_secrets where id = 1 and super_pin = p_super_pin) then
    raise exception 'invalid_super_admin_pin' using errcode = 'P0010';
  end if;
  -- Clean stale
  delete from exec_sessions where last_seen < now() - interval '5 minutes';
  return query select es.page, count(distinct es.device_id) as device_count from exec_sessions es group by es.page;
end;
$$;
