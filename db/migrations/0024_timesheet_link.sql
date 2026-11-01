-- Timesheet link with Autopilot by Opseros (Teamwork timesheets).
-- * A My Buddy project can point to a Teamwork project, and each time entry (and the running timer)
--   to a Teamwork task. Autopilot then fills the timesheet without asking which task each entry is.
-- * Autopilot marks entries it has logged to Teamwork (tw_logged_at), so nothing is sent twice.
-- * timesheet_catalog: the Teamwork projects and tasks a person can pick from, sent by Autopilot.
-- * timesheet_days: hours logged in Teamwork per day, sent by Autopilot, for the Today card.
-- * work_plans: planned work blocks on Today. Ticking one off turns it into a time entry.

alter table projects add column if not exists tw_project_id bigint check (tw_project_id is null or tw_project_id > 0);
alter table projects add column if not exists tw_project text check (tw_project is null or length(tw_project) <= 200);

alter table time_entries add column if not exists tw_task_id bigint check (tw_task_id is null or tw_task_id > 0);
alter table time_entries add column if not exists tw_task text check (tw_task is null or length(tw_task) <= 200);
alter table time_entries add column if not exists tw_tasklist text check (tw_tasklist is null or length(tw_tasklist) <= 200);
alter table time_entries add column if not exists tw_project text check (tw_project is null or length(tw_project) <= 200);
alter table time_entries add column if not exists tw_logged_at timestamptz;
alter table time_entries add column if not exists tw_log_id bigint;

create table if not exists timesheet_catalog (
  user_id text primary key references "user"(id) on delete cascade,
  projects jsonb not null default '[]'::jsonb,
  target_minutes integer check (target_minutes is null or target_minutes between 0 and 1440),
  site text check (site is null or length(site) <= 200),
  updated_at timestamptz not null default now()
);

create table if not exists timesheet_days (
  user_id text not null references "user"(id) on delete cascade,
  day date not null,
  logged_minutes integer not null default 0 check (logged_minutes between 0 and 2880),
  entries integer not null default 0 check (entries between 0 and 500),
  target_minutes integer check (target_minutes is null or target_minutes between 0 and 1440),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists work_plans (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  day date not null,
  start_min smallint not null check (start_min between 0 and 1439),
  end_min smallint not null check (end_min between 1 and 1440),
  project_id uuid not null references projects(id) on delete cascade,
  tw_task_id bigint check (tw_task_id is null or tw_task_id > 0),
  tw_task text check (tw_task is null or length(tw_task) <= 200),
  tw_tasklist text check (tw_tasklist is null or length(tw_tasklist) <= 200),
  tw_project text check (tw_project is null or length(tw_project) <= 200),
  note text not null default '' check (length(note) <= 160),
  entry_id uuid references time_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_min > start_min)
);
create index if not exists idx_work_plans_day on work_plans(user_id, day);

alter table timesheet_catalog enable row level security;
alter table timesheet_days enable row level security;
alter table work_plans enable row level security;

drop policy if exists timesheet_catalog_own on timesheet_catalog;
create policy timesheet_catalog_own on timesheet_catalog for all using (user_id = app_current_user()) with check (user_id = app_current_user());
drop policy if exists timesheet_days_own on timesheet_days;
create policy timesheet_days_own on timesheet_days for all using (user_id = app_current_user()) with check (user_id = app_current_user());
drop policy if exists work_plans_own on work_plans;
create policy work_plans_own on work_plans for all using (user_id = app_current_user() and is_workspace_member(workspace_id))
  with check (user_id = app_current_user() and can_write_workspace(workspace_id));

grant select, insert, update, delete on timesheet_catalog, timesheet_days, work_plans to mybuddy_app;
