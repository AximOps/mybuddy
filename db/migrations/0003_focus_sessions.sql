-- Completed focus sessions, used by the Focus timer history and Stats.

create table focus_sessions (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  title text not null default '' check (length(title) <= 60),
  minutes smallint not null check (minutes between 1 and 480),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index idx_focus_sessions_user on focus_sessions(user_id, completed_at);

alter table focus_sessions enable row level security;

-- People see and record only their own focus sessions, inside workspaces they belong to.
create policy focus_sessions_read on focus_sessions for select
  using (user_id = app_current_user() and is_workspace_member(workspace_id));
create policy focus_sessions_insert on focus_sessions for insert
  with check (user_id = app_current_user() and is_workspace_member(workspace_id));

-- Tables created after 0001 need the app role's grants too.
grant select, insert, update, delete on all tables in schema public to mybuddy_app;
