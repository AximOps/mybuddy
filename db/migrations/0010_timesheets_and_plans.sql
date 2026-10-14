-- Timesheets for organisation workspaces: employees submit a week, admins approve or reject it.
-- Also stores each person's plan (free or premium).

alter table user_settings add column if not exists plan text not null default 'free'
  check (plan in ('free', 'premium'));
alter table user_settings add column if not exists plan_until timestamptz;

create table timesheets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  week_start date not null,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  decided_by text references "user"(id) on delete set null,
  decided_at timestamptz,
  decision_note text not null default '' check (length(decision_note) <= 300),
  unique (workspace_id, user_id, week_start)
);

-- True when the signed-in person is an owner or admin of the organisation that owns this workspace.
create or replace function is_workspace_admin(p_ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workspaces w
      join organisation_members m on m.organisation_id = w.organisation_id
     where w.id = p_ws and m.user_id = app_current_user() and m.role in ('owner', 'admin')
  );
$$;

alter table timesheets enable row level security;

create policy timesheets_read on timesheets for select
  using (user_id = app_current_user() or is_workspace_admin(workspace_id));
create policy timesheets_submit on timesheets for insert
  with check (user_id = app_current_user() and is_workspace_member(workspace_id));
create policy timesheets_resubmit on timesheets for update
  using (user_id = app_current_user() and status <> 'approved')
  with check (user_id = app_current_user() and status <> 'approved');
create policy timesheets_decide on timesheets for update
  using (is_workspace_admin(workspace_id)) with check (is_workspace_admin(workspace_id));

-- Admins can read the time entries of their organisation, for approval and reports.
create policy time_entries_admin_read on time_entries for select
  using (is_workspace_admin(workspace_id));

grant select, insert, update, delete on all tables in schema public to mybuddy_app;
grant execute on all functions in schema public to mybuddy_app;
