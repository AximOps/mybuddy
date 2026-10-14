-- Work: clients, projects with hourly rates, time entries, meetings with action items,
-- invoices (with a snapshot of their lines), and the running timer kept per person.

alter table user_settings add column if not exists work_timer jsonb;

create table clients (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table projects (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  name text not null check (length(name) between 1 and 80),
  hourly_rate_minor integer not null default 0 check (hourly_rate_minor >= 0 and hourly_rate_minor <= 99999999),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table time_entries (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  spent_on date not null,
  start_min smallint not null check (start_min between 0 and 1439),
  end_min smallint not null check (end_min between 1 and 1440),
  billable boolean not null default true,
  note text not null default '' check (length(note) <= 160),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_min > start_min)
);
create index idx_time_entries_day on time_entries(workspace_id, spent_on);

create table meetings (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  meeting_on date not null,
  start_min smallint check (start_min is null or start_min between 0 and 1439),
  end_min smallint check (end_min is null or end_min between 1 and 1440),
  attendees text not null default '' check (length(attendees) <= 300),
  agenda text not null default '' check (length(agenda) <= 5000),
  notes text not null default '' check (length(notes) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table meeting_actions (
  id uuid primary key,
  meeting_id uuid not null references meetings(id) on delete cascade,
  text text not null check (length(text) between 1 and 200),
  done boolean not null default false,
  sort_order integer not null default 0
);

create table invoices (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  number text not null check (length(number) between 1 and 30),
  client_id uuid references clients(id) on delete set null,
  client_name text not null,
  period_start date not null,
  period_end date not null,
  currency text not null,
  total_minor integer not null,
  lines jsonb not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, number)
);

alter table clients enable row level security;
alter table projects enable row level security;
alter table time_entries enable row level security;
alter table meetings enable row level security;
alter table meeting_actions enable row level security;
alter table invoices enable row level security;

create policy clients_access on clients for all using (is_workspace_member(workspace_id)) with check (can_write_workspace(workspace_id));
create policy projects_access on projects for all using (is_workspace_member(workspace_id)) with check (can_write_workspace(workspace_id));
create policy time_entries_access on time_entries for all using (is_workspace_member(workspace_id) and user_id = app_current_user())
  with check (can_write_workspace(workspace_id) and user_id = app_current_user());
create policy meetings_access on meetings for all using (is_workspace_member(workspace_id)) with check (can_write_workspace(workspace_id));
create policy meeting_actions_access on meeting_actions for all
  using (exists (select 1 from meetings m where m.id = meeting_id and is_workspace_member(m.workspace_id)))
  with check (exists (select 1 from meetings m where m.id = meeting_id and can_write_workspace(m.workspace_id)));
create policy invoices_access on invoices for all using (is_workspace_member(workspace_id)) with check (can_write_workspace(workspace_id));

grant select, insert, update, delete on all tables in schema public to mybuddy_app;
