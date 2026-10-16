-- Onboarding (mobile number and mode), one free trial per mobile number, and "done" ticks for
-- Today items that have no done state of their own (meetings, classes, note reminders, notes).

alter table user_settings add column if not exists phone text;
alter table user_settings add column if not exists onboarded_at timestamptz;
create unique index if not exists user_settings_phone_unique on user_settings (phone) where phone is not null;

-- People who signed up before this release skip the welcome step.
update user_settings set onboarded_at = coalesce(onboarded_at, now());
insert into user_settings (user_id, onboarded_at)
  select u.id, now() from "user" u where not exists (select 1 from user_settings s where s.user_id = u.id)
on conflict do nothing;

-- Every mobile number that has had a free trial. Kept when an account is deleted, so a new
-- account with the same number does not get a second trial.
create table if not exists trial_claims (
  phone text primary key,
  user_id text,
  claimed_at timestamptz not null default now()
);
alter table trial_claims enable row level security;   -- no policies: only the functions below touch it
revoke all on trial_claims from mybuddy_app;

-- Saves the welcome step and starts the 15-day trial when this number has never had one.
-- Returns 'trial', 'no_trial' (number already used for a trial) or raises PHONE_TAKEN.
create or replace function complete_onboarding(p_user text, p_phone text, p_mode text, p_level text) returns text
language plpgsql security definer set search_path = public as $$
declare got_trial boolean := false;
begin
  if p_user is distinct from app_current_user() then raise exception 'NOT_ALLOWED'; end if;
  if p_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'BAD_PHONE'; end if;
  if p_mode not in ('personal', 'work', 'student') then raise exception 'BAD_MODE'; end if;
  if exists (select 1 from user_settings where phone = p_phone and user_id <> p_user) then raise exception 'PHONE_TAKEN'; end if;

  insert into user_settings (user_id, phone, mode, student_enabled, student_level, onboarded_at)
    values (p_user, p_phone, p_mode, p_mode = 'student', coalesce(nullif(p_level, ''), 'college'), now())
  on conflict (user_id) do update
    set phone = excluded.phone, mode = excluded.mode, student_enabled = excluded.student_enabled,
        student_level = excluded.student_level, onboarded_at = now(), updated_at = now();

  if not exists (select 1 from trial_claims where phone = p_phone)
     and exists (select 1 from user_settings where user_id = p_user and not trial_used and plan = 'free') then
    update user_settings set plan = 'premium', plan_until = now() + interval '15 days', trial_started_at = now(), trial_used = true, updated_at = now()
     where user_id = p_user;
    insert into trial_claims (phone, user_id) values (p_phone, p_user);
    got_trial := true;
  end if;
  return case when got_trial then 'trial' else 'no_trial' end;
end;
$$;

-- The Settings "Start free trial" button follows the same one-trial-per-number rule.
create or replace function start_free_trial(p_user text) returns boolean
language plpgsql security definer set search_path = public as $$
declare n integer; p text;
begin
  select phone into p from user_settings where user_id = p_user;
  if p is null or exists (select 1 from trial_claims where phone = p) then return false; end if;
  update user_settings
     set plan = 'premium', plan_until = now() + interval '15 days', trial_started_at = now(), trial_used = true, updated_at = now()
   where user_id = p_user and trial_used = false and plan = 'free';
  get diagnostics n = row_count;
  if n > 0 then insert into trial_claims (phone, user_id) values (p, p_user) on conflict do nothing; end if;
  return n > 0;
end;
$$;

-- Done ticks per day for Today items: kind is 'meeting', 'class', 'reminder' or 'note'.
create table if not exists day_checks (
  user_id text not null references "user"(id) on delete cascade,
  kind text not null check (kind in ('meeting', 'class', 'reminder', 'note')),
  ref_id uuid not null,
  day date not null,
  checked_at timestamptz not null default now(),
  primary key (user_id, kind, ref_id, day)
);
alter table day_checks enable row level security;
drop policy if exists day_checks_self on day_checks;
create policy day_checks_self on day_checks for all
  using (user_id = app_current_user()) with check (user_id = app_current_user());
grant select, insert, delete on day_checks to mybuddy_app;

grant execute on all functions in schema public to mybuddy_app;
