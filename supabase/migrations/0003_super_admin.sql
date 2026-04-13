-- =============================================================
-- Super Admin migration
-- Run this in the Supabase SQL editor AFTER 0002_security_fixes.sql.
-- =============================================================

-- ─── 1. Add super admin columns to admin_secrets ────────────
alter table public.admin_secrets
  add column if not exists super_pin   text not null default 'SUPERADMIN2025',
  add column if not exists pin_locked  boolean not null default false;

-- ─── 2. Verify login — returns role: 'super_admin', 'executive', or null ──
create or replace function public.verify_login(p_pin text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secrets admin_secrets;
begin
  select * into v_secrets from admin_secrets where id = 1;
  if not found then return null; end if;

  if v_secrets.super_pin = p_pin then
    return 'super_admin';
  elsif v_secrets.pin = p_pin then
    return 'executive';
  else
    return null;
  end if;
end;
$$;

-- ─── 3. Super admin: force-set executive PIN ────────────────
create or replace function public.super_admin_set_exec_pin(
  p_super_pin text,
  p_new_pin   text
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
  if length(p_new_pin) < 4 then
    raise exception 'pin_too_short' using errcode = 'P0006';
  end if;
  update admin_secrets set pin = p_new_pin where id = 1;
end;
$$;

-- ─── 4. Super admin: change own super PIN ───────────────────
create or replace function public.super_admin_change_pin(
  p_current_super_pin text,
  p_new_super_pin     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from admin_secrets where id = 1 and super_pin = p_current_super_pin) then
    raise exception 'invalid_super_admin_pin' using errcode = 'P0010';
  end if;
  if length(p_new_super_pin) < 6 then
    raise exception 'pin_too_short' using errcode = 'P0006';
  end if;
  update admin_secrets set super_pin = p_new_super_pin where id = 1;
end;
$$;

-- ─── 5. Super admin: lock/unlock executive PIN changes ──────
create or replace function public.super_admin_toggle_pin_lock(p_super_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new boolean;
begin
  if not exists (select 1 from admin_secrets where id = 1 and super_pin = p_super_pin) then
    raise exception 'invalid_super_admin_pin' using errcode = 'P0010';
  end if;
  update admin_secrets set pin_locked = not pin_locked where id = 1 returning pin_locked into v_new;
  return v_new;
end;
$$;

-- ─── 6. Update admin_change_pin to respect pin_locked ───────
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
  if exists (select 1 from admin_secrets where id = 1 and pin_locked = true) then
    raise exception 'pin_is_locked' using errcode = 'P0011';
  end if;
  if length(p_new_pin) < 4 then
    raise exception 'pin_too_short' using errcode = 'P0006';
  end if;
  update admin_secrets set pin = p_new_pin where id = 1;
end;
$$;

-- ─── 7. Super admin: add registration from dashboard ────────
create or replace function public.super_admin_add_registration(
  p_super_pin  text,
  p_state_code text,
  p_full_name  text
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
begin
  if not exists (select 1 from admin_secrets where id = 1 and super_pin = p_super_pin) then
    raise exception 'invalid_super_admin_pin' using errcode = 'P0010';
  end if;

  select * into v_settings from public.session_settings where id = 1 for update;

  -- Reject duplicate state codes for active entries
  if exists (
    select 1 from public.registrations
    where state_code = p_state_code and voided = false
  ) then
    raise exception 'duplicate_state_code' using errcode = 'P0002';
  end if;

  select coalesce(max(queue_number), 0) + 1 into v_next_q from public.registrations;
  v_batch := ceil(v_next_q::numeric / v_settings.batch_size)::int;

  insert into public.registrations (state_code, full_name, queue_number, batch_number, device_id)
  values (p_state_code, p_full_name, v_next_q, v_batch, null)
  returning * into v_row;

  return v_row;
end;
$$;

-- ─── 8. Super admin: edit a registration ────────────────────
create or replace function public.super_admin_edit_registration(
  p_super_pin       text,
  p_registration_id uuid,
  p_full_name       text default null,
  p_state_code      text default null
)
returns public.registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.registrations;
begin
  if not exists (select 1 from admin_secrets where id = 1 and super_pin = p_super_pin) then
    raise exception 'invalid_super_admin_pin' using errcode = 'P0010';
  end if;

  select * into v_row from registrations where id = p_registration_id;
  if not found then
    raise exception 'registration_not_found';
  end if;

  -- Check for duplicate state code if changing it
  if p_state_code is not null and p_state_code <> v_row.state_code then
    if exists (
      select 1 from registrations
      where state_code = p_state_code and voided = false and id <> p_registration_id
    ) then
      raise exception 'duplicate_state_code' using errcode = 'P0002';
    end if;
  end if;

  update registrations set
    full_name  = coalesce(p_full_name, full_name),
    state_code = coalesce(p_state_code, state_code)
  where id = p_registration_id
  returning * into v_row;

  return v_row;
end;
$$;

-- ─── 9. Super admin: permanently delete a registration ──────
create or replace function public.super_admin_delete_registration(
  p_super_pin       text,
  p_registration_id uuid
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

  delete from registrations where id = p_registration_id;
end;
$$;

-- ─── 10. Super admin: check pin_locked status ───────────────
-- Needed so the dashboard can check if PIN is locked without exposing the table.
create or replace function public.get_pin_lock_status(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only allow if caller is a valid admin (exec or super)
  if not exists (
    select 1 from admin_secrets where id = 1 and (pin = p_pin or super_pin = p_pin)
  ) then
    raise exception 'invalid_admin_pin' using errcode = 'P0005';
  end if;

  return (select pin_locked from admin_secrets where id = 1);
end;
$$;

-- ─── 11. Update verify_admin_pin to also accept super_pin ───
-- So super admin can use all existing admin_* RPCs too.
create or replace function public.verify_admin_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (select 1 from admin_secrets where id = 1 and (pin = p_pin or super_pin = p_pin));
end;
$$;

-- ─── 12. Update ALL admin_* RPCs to accept super_pin too ────
-- This way super admin can call waves, mark served, void, toggle, reset etc.

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
  if not exists (select 1 from admin_secrets where id = 1 and (pin = p_pin or super_pin = p_pin)) then
    raise exception 'invalid_admin_pin' using errcode = 'P0005';
  end if;
  select * into v_row from registrations where id = p_registration_id;
  if not found then raise exception 'registration_not_found'; end if;
  if v_row.served_at is not null then
    update registrations set served_at = null where id = p_registration_id;
  else
    update registrations set served_at = now() where id = p_registration_id;
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
declare
  v_row public.registrations;
begin
  if not exists (select 1 from admin_secrets where id = 1 and (pin = p_pin or super_pin = p_pin)) then
    raise exception 'invalid_admin_pin' using errcode = 'P0005';
  end if;
  select * into v_row from registrations where id = p_registration_id;
  if not found then raise exception 'registration_not_found'; end if;
  update registrations set voided = not v_row.voided where id = p_registration_id;
end;
$$;

create or replace function public.admin_call_next_batch(p_pin text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_next integer;
begin
  if not exists (select 1 from admin_secrets where id = 1 and (pin = p_pin or super_pin = p_pin)) then
    raise exception 'invalid_admin_pin' using errcode = 'P0005';
  end if;
  update session_settings set current_batch = current_batch + 1 where id = 1 returning current_batch into v_next;
  return v_next;
end;
$$;

create or replace function public.admin_go_back_batch(p_pin text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_prev integer;
begin
  if not exists (select 1 from admin_secrets where id = 1 and (pin = p_pin or super_pin = p_pin)) then
    raise exception 'invalid_admin_pin' using errcode = 'P0005';
  end if;
  update session_settings set current_batch = greatest(current_batch - 1, 0) where id = 1 returning current_batch into v_prev;
  return v_prev;
end;
$$;

create or replace function public.admin_toggle_registration(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_new boolean;
begin
  if not exists (select 1 from admin_secrets where id = 1 and (pin = p_pin or super_pin = p_pin)) then
    raise exception 'invalid_admin_pin' using errcode = 'P0005';
  end if;
  update session_settings set registration_open = not registration_open where id = 1 returning registration_open into v_new;
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
begin
  if not exists (select 1 from admin_secrets where id = 1 and (pin = p_pin or super_pin = p_pin)) then
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
  -- Allow both exec pin and super pin to change exec pin
  if not exists (select 1 from admin_secrets where id = 1 and (pin = p_current_pin or super_pin = p_current_pin)) then
    raise exception 'invalid_admin_pin' using errcode = 'P0005';
  end if;
  -- If an executive (not super admin) tries to change while locked, block it
  if exists (select 1 from admin_secrets where id = 1 and pin = p_current_pin and pin_locked = true) then
    -- Check if they're using exec pin (not super pin) and it's locked
    if not exists (select 1 from admin_secrets where id = 1 and super_pin = p_current_pin) then
      raise exception 'pin_is_locked' using errcode = 'P0011';
    end if;
  end if;
  if length(p_new_pin) < 4 then
    raise exception 'pin_too_short' using errcode = 'P0006';
  end if;
  update admin_secrets set pin = p_new_pin where id = 1;
end;
$$;
