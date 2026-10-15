-- Admin controls (suspend, reactivate, delete, grant trial) and the 15-day free trial.

alter table user_settings add column if not exists suspended_at timestamptz;
alter table user_settings add column if not exists suspended_reason text not null default '' check (length(suspended_reason) <= 300);
alter table user_settings add column if not exists trial_started_at timestamptz;
alter table user_settings add column if not exists trial_used boolean not null default false;

-- Used at sign-in and on every request, so a suspended person is refused straight away.
create or replace function is_user_suspended(p_user text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_settings where user_id = p_user and suspended_at is not null);
$$;

-- Self-serve trial: 15 days of premium, once per account, only for people on the free plan.
create or replace function start_free_trial(p_user text) returns boolean
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into user_settings (user_id, plan, plan_until, trial_started_at, trial_used)
    values (p_user, 'premium', now() + interval '15 days', now(), true)
  on conflict (user_id) do update
    set plan = 'premium', plan_until = now() + interval '15 days', trial_started_at = now(), trial_used = true, updated_at = now()
    where user_settings.trial_used = false and user_settings.plan = 'free';
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

create or replace function admin_grant_trial(p_target text, p_days integer, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare me text := require_platform_admin();
begin
  if p_days is null or p_days < 1 or p_days > 90 then raise exception 'Trial length must be 1 to 90 days.'; end if;
  insert into user_settings (user_id, plan, plan_until, trial_started_at, trial_used)
    values (p_target, 'premium', now() + make_interval(days => p_days), now(), true)
  on conflict (user_id) do update
    set plan = 'premium', plan_until = now() + make_interval(days => p_days), trial_started_at = now(), trial_used = true, updated_at = now();
  insert into admin_audit (admin_id, target_user_id, action, details)
    values (me, p_target, 'grant_trial', format('%s days; note: %s', p_days, coalesce(p_note, '')));
end;
$$;

create or replace function admin_set_suspended(p_target text, p_suspend boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare me text := require_platform_admin();
begin
  if p_target = me then raise exception 'You cannot suspend your own account.'; end if;
  if is_platform_admin(p_target) then raise exception 'Remove admin rights before suspending this account.'; end if;
  insert into user_settings (user_id, suspended_at, suspended_reason)
    values (p_target, case when p_suspend then now() end, coalesce(p_reason, ''))
  on conflict (user_id) do update
    set suspended_at = case when p_suspend then now() else null end, suspended_reason = coalesce(p_reason, ''), updated_at = now();
  if p_suspend then
    delete from session where "userId" = p_target; -- sign out everywhere now
  end if;
  insert into admin_audit (admin_id, target_user_id, action, details)
    values (me, p_target, case when p_suspend then 'suspend' else 'reactivate' end, coalesce(p_reason, ''));
end;
$$;

-- Deletes the account and everything in it. Audit entries stay, with the email kept in the text.
create or replace function admin_delete_user(p_target text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me text := require_platform_admin();
  target_email text;
begin
  if p_target = me then raise exception 'You cannot delete your own account.'; end if;
  if is_platform_admin(p_target) then raise exception 'Remove admin rights before deleting this account.'; end if;
  if exists (select 1 from organisations where created_by = p_target) then
    raise exception 'This person created a team. Hand the team over or delete it before deleting the account.';
  end if;
  select email into target_email from "user" where id = p_target;
  if target_email is null then raise exception 'Account not found.'; end if;
  insert into admin_audit (admin_id, target_user_id, action, details)
    values (me, null, 'delete_account', format('deleted %s; reason: %s', target_email, coalesce(p_reason, '')));
  delete from "user" where id = p_target;
end;
$$;

-- Account list now shows suspension and trial status.
drop function if exists admin_list_users(text, text, int, int);
create function admin_list_users(p_search text, p_plan text, p_limit int, p_offset int)
returns table (
  user_id text, user_name text, user_email text, joined_at timestamptz, plan text, plan_until timestamptz,
  mode text, last_active timestamptz, routines int, tasks int, notes int, expenses int, time_entries int, organisations int,
  suspended boolean, trial boolean
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform require_platform_admin();
  return query
  select u.id, u.name, u.email, u."createdAt",
         coalesce(s.plan, 'free'), s.plan_until, coalesce(s.mode, 'personal'),
         greatest(
           (select max(t.updated_at) from tasks t join workspaces w on w.id = t.workspace_id where w.owner_id = u.id),
           (select max(n.updated_at) from notes n join workspaces w on w.id = n.workspace_id where w.owner_id = u.id),
           (select max(e.created_at) from expenses e where e.user_id = u.id)),
         (select count(*)::int from routines r join workspaces w on w.id = r.workspace_id where w.owner_id = u.id and r.deleted_at is null),
         (select count(*)::int from tasks t join workspaces w on w.id = t.workspace_id where w.owner_id = u.id and t.deleted_at is null),
         (select count(*)::int from notes n join workspaces w on w.id = n.workspace_id where w.owner_id = u.id and n.deleted_at is null),
         (select count(*)::int from expenses e where e.user_id = u.id and e.deleted_at is null),
         (select count(*)::int from time_entries te where te.user_id = u.id and te.deleted_at is null),
         (select count(*)::int from organisation_members om where om.user_id = u.id),
         (s.suspended_at is not null),
         (s.trial_started_at is not null and s.plan = 'premium' and s.plan_until > now())
    from "user" u
    left join user_settings s on s.user_id = u.id
   where (p_search is null or p_search = '' or u.email ilike '%' || p_search || '%' or u.name ilike '%' || p_search || '%')
     and (p_plan is null or p_plan = '' or coalesce(s.plan, 'free') = p_plan)
   order by u."createdAt" desc
   limit p_limit offset p_offset;
end;
$$;

-- Detail page: adds suspension and trial fields.
create or replace function admin_user_detail(p_target text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_platform_admin();
  return jsonb_build_object(
    'user', (select jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email, 'emailVerified', u."emailVerified", 'joinedAt', u."createdAt")
               from "user" u where u.id = p_target),
    'settings', (select jsonb_build_object('plan', s.plan, 'planUntil', s.plan_until, 'mode', s.mode,
                   'timezone', s.timezone, 'currency', s.currency, 'studentEnabled', s.student_enabled,
                   'suspendedAt', s.suspended_at, 'suspendedReason', s.suspended_reason,
                   'trialStartedAt', s.trial_started_at, 'trialUsed', s.trial_used)
                   from user_settings s where s.user_id = p_target),
    'signInMethods', (select coalesce(jsonb_agg(a."providerId"), '[]'::jsonb) from account a where a."userId" = p_target),
    'organisations', (select coalesce(jsonb_agg(jsonb_build_object('name', o.name, 'role', m.role)), '[]'::jsonb)
                        from organisation_members m join organisations o on o.id = m.organisation_id where m.user_id = p_target),
    'createsTeam', (select exists (select 1 from organisations where created_by = p_target)),
    'isAdmin', (select is_platform_admin(p_target)),
    'audit', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
                select a.created_at, a.action, a.details, adm.email as by_email from admin_audit a
                  left join "user" adm on adm.id = a.admin_id
                 where a.target_user_id = p_target order by a.created_at desc limit 50) x)
  );
end;
$$;

grant execute on all functions in schema public to mybuddy_app;
grant select, insert, update, delete on all tables in schema public to mybuddy_app;
