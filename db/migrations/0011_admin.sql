-- Platform admin: support staff can see account details and plans, change plans, and add notes.
-- Admins do NOT get access to anyone's tasks, notes, spending or other content. The functions below
-- return account details and counts only. Every admin action is written to admin_audit.

create table platform_admins (
  user_id text primary key references "user"(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table admin_audit (
  id uuid primary key default gen_random_uuid(),
  admin_id text references "user"(id) on delete set null,
  target_user_id text references "user"(id) on delete set null,
  action text not null check (length(action) <= 60),
  details text not null default '' check (length(details) <= 1000),
  created_at timestamptz not null default now()
);
create index idx_admin_audit_target on admin_audit(target_user_id, created_at);

alter table platform_admins enable row level security;
alter table admin_audit enable row level security;

create or replace function is_platform_admin(p_user text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = p_user);
$$;

create or replace function require_platform_admin() returns text
language plpgsql stable security definer set search_path = public as $$
declare me text := app_current_user();
begin
  if me is null or not is_platform_admin(me) then
    raise exception 'Not authorised.';
  end if;
  return me;
end;
$$;

create or replace function admin_list_users(p_search text, p_plan text, p_limit int, p_offset int)
returns table (
  user_id text, user_name text, user_email text, joined_at timestamptz, plan text, plan_until timestamptz,
  mode text, last_active timestamptz, routines int, tasks int, notes int, expenses int, time_entries int, organisations int
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
         (select count(*)::int from organisation_members om where om.user_id = u.id)
    from "user" u
    left join user_settings s on s.user_id = u.id
   where (p_search is null or p_search = '' or u.email ilike '%' || p_search || '%' or u.name ilike '%' || p_search || '%')
     and (p_plan is null or p_plan = '' or coalesce(s.plan, 'free') = p_plan)
   order by u."createdAt" desc
   limit p_limit offset p_offset;
end;
$$;

create or replace function admin_user_detail(p_target text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_platform_admin();
  return jsonb_build_object(
    'user', (select jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email, 'emailVerified', u."emailVerified", 'joinedAt', u."createdAt")
               from "user" u where u.id = p_target),
    'settings', (select coalesce(jsonb_build_object('plan', s.plan, 'planUntil', s.plan_until, 'mode', s.mode,
                   'timezone', s.timezone, 'currency', s.currency, 'studentEnabled', s.student_enabled), '{}'::jsonb)
                   from user_settings s where s.user_id = p_target),
    'signInMethods', (select coalesce(jsonb_agg(a."providerId"), '[]'::jsonb) from account a where a."userId" = p_target),
    'organisations', (select coalesce(jsonb_agg(jsonb_build_object('name', o.name, 'role', m.role)), '[]'::jsonb)
                        from organisation_members m join organisations o on o.id = m.organisation_id where m.user_id = p_target),
    'audit', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
                select a.created_at, a.action, a.details, adm.email as by_email from admin_audit a
                  left join "user" adm on adm.id = a.admin_id
                 where a.target_user_id = p_target order by a.created_at desc limit 50) x)
  );
end;
$$;

create or replace function admin_set_plan(p_target text, p_plan text, p_until timestamptz, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare me text := require_platform_admin();
begin
  if p_plan not in ('free', 'premium') then raise exception 'Unknown plan.'; end if;
  insert into user_settings (user_id, plan, plan_until) values (p_target, p_plan, p_until)
    on conflict (user_id) do update set plan = excluded.plan, plan_until = excluded.plan_until, updated_at = now();
  insert into admin_audit (admin_id, target_user_id, action, details)
    values (me, p_target, 'set_plan', format('plan=%s until=%s note=%s', p_plan, coalesce(p_until::text, 'none'), coalesce(p_note, '')));
end;
$$;

create or replace function admin_add_note(p_target text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare me text := require_platform_admin();
begin
  insert into admin_audit (admin_id, target_user_id, action, details) values (me, p_target, 'support_note', left(p_note, 1000));
end;
$$;

grant select, insert, update, delete on all tables in schema public to mybuddy_app;
grant execute on all functions in schema public to mybuddy_app;
