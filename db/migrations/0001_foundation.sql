-- My Buddy: foundation schema for Neon (Singapore) with Better Auth.
--
-- Logins are handled by Better Auth inside the Next.js app. Its tables (user, session,
-- account, verification) are created here in the standard shape; regenerate them with the
-- Better Auth CLI if the library version changes and compare.
--
-- Access control has two layers:
--   1. The server sets the signed-in user for every database transaction with
--      set_config('app.user_id', <user id>, true). The server is the main check.
--   2. Row-level security reads that setting, so a query that forgets the check still
--      cannot see another person's rows. The app connects as role mybuddy_app, which
--      does not bypass row-level security (table owners do).

-- ---------- Better Auth tables ----------
create table "user" (
  id text primary key,
  name text not null,
  email text not null unique,
  "emailVerified" boolean not null default false,
  image text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table session (
  id text primary key,
  "expiresAt" timestamptz not null,
  token text not null unique,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references "user"(id) on delete cascade
);
create index idx_session_user on session("userId");

create table account (
  id text primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user"(id) on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index idx_account_user on account("userId");

create table verification (
  id text primary key,
  identifier text not null,
  value text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- ---------- Organisations and workspaces ----------
create table organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  created_by text not null references "user"(id) on delete restrict,
  created_at timestamptz not null default now()
);

create type org_role as enum ('owner', 'admin', 'member');

create table organisation_members (
  organisation_id uuid not null references organisations(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  role org_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organisation_id, user_id)
);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  kind text not null check (kind in ('personal', 'organisation')),
  organisation_id uuid references organisations(id) on delete cascade,
  owner_id text references "user"(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint workspace_kind_shape check (
    (kind = 'personal' and owner_id is not null and organisation_id is null) or
    (kind = 'organisation' and organisation_id is not null and owner_id is null)
  )
);

create type workspace_role as enum ('owner', 'editor', 'viewer');

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  role workspace_role not null default 'editor',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index idx_workspace_members_user on workspace_members(user_id);

-- ---------- Current user and access helpers ----------
-- The server sets app.user_id at the start of each transaction (see the plan, section 10).
create or replace function app_current_user() returns text
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '');
$$;

create or replace function is_workspace_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workspace_members m
    where m.workspace_id = ws and m.user_id = app_current_user()
  );
$$;

create or replace function can_write_workspace(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workspace_members m
    where m.workspace_id = ws and m.user_id = app_current_user() and m.role in ('owner', 'editor')
  );
$$;

-- ---------- Sync columns ----------
-- updated_at drives sync: a device pulls rows changed after its last sync point.
-- deleted_at is a soft delete, so other devices learn about deletions.
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- Daily core ----------
create table routines (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  color text not null,
  sort_order integer not null default 0,
  created_by text references "user"(id) on delete set null,
  device_id text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- One routine per weekday per workspace (0 = Sunday ... 6 = Saturday).
create table routine_days (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  routine_id uuid not null references routines(id) on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (workspace_id, weekday)
);

create table events (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  routine_id uuid not null references routines(id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  emoji text not null default '📌',
  start_min smallint not null check (start_min between 0 and 1439),
  end_min smallint not null check (end_min between 1 and 1440),
  category text not null default 'personal',
  remind_min smallint not null default 0,
  created_by text references "user"(id) on delete set null,
  device_id text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_min > start_min)
);

-- Check-offs are per person, even inside a shared workspace.
create table completions (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  event_id uuid not null,
  day date not null,
  completed_at timestamptz not null default now(),
  device_id text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, event_id, day)
);

create table tasks (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  due_date date,
  due_time smallint check (due_time between 0 and 1439),
  tag text not null default 'Personal' check (length(tag) between 1 and 20),
  done boolean not null default false,
  completed_at timestamptz,
  assignee_id text references "user"(id) on delete set null,
  created_by text references "user"(id) on delete set null,
  device_id text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table notes (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null default '' check (length(title) <= 200),
  body text not null default '',
  tag text not null default 'Personal' check (length(tag) between 1 and 20),
  pinned boolean not null default false,
  reminder_at timestamptz,
  created_by text references "user"(id) on delete set null,
  device_id text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

do $$
declare t text;
begin
  foreach t in array array['routines', 'routine_days', 'events', 'completions', 'tasks', 'notes'] loop
    execute format('create trigger %I before update on %I for each row execute function touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

create index idx_routines_sync on routines(workspace_id, updated_at);
create index idx_events_sync on events(workspace_id, updated_at);
create index idx_completions_sync on completions(workspace_id, updated_at);
create index idx_tasks_sync on tasks(workspace_id, updated_at);
create index idx_notes_sync on notes(workspace_id, updated_at);

-- ---------- Row-level security ----------
alter table organisations enable row level security;
alter table organisation_members enable row level security;
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table routines enable row level security;
alter table routine_days enable row level security;
alter table events enable row level security;
alter table completions enable row level security;
alter table tasks enable row level security;
alter table notes enable row level security;

create policy workspaces_read on workspaces for select using (is_workspace_member(id));
create policy workspace_members_read on workspace_members for select using (is_workspace_member(workspace_id));

create policy organisations_read on organisations for select using (
  exists (select 1 from organisation_members m where m.organisation_id = id and m.user_id = app_current_user())
);
create policy organisation_members_read on organisation_members for select using (
  user_id = app_current_user() or exists (
    select 1 from organisation_members m where m.organisation_id = organisation_id and m.user_id = app_current_user()
  )
);

do $$
declare t text;
begin
  foreach t in array array['routines', 'routine_days', 'events', 'tasks', 'notes'] loop
    execute format('create policy %I on %I for select using (is_workspace_member(workspace_id))', t || '_read', t);
    execute format('create policy %I on %I for insert with check (can_write_workspace(workspace_id))', t || '_insert', t);
    execute format('create policy %I on %I for update using (can_write_workspace(workspace_id)) with check (can_write_workspace(workspace_id))', t || '_update', t);
  end loop;
end $$;

create policy completions_read on completions for select using (user_id = app_current_user() and is_workspace_member(workspace_id));
create policy completions_insert on completions for insert with check (user_id = app_current_user() and is_workspace_member(workspace_id));
create policy completions_update on completions for update using (user_id = app_current_user()) with check (user_id = app_current_user());

-- Called by the server right after Better Auth creates a user. Creates that person's
-- personal workspace and makes them its owner. The app role cannot insert workspaces directly.
create or replace function create_personal_workspace(p_user text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  ws uuid := gen_random_uuid();
begin
  insert into workspaces (id, name, kind, owner_id) values (ws, p_name, 'personal', p_user);
  insert into workspace_members (workspace_id, user_id, role) values (ws, p_user, 'owner');
  return ws;
end;
$$;

-- ---------- App role (does not bypass row-level security) ----------
-- Set the password in the Neon console or with ALTER ROLE; never commit it.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'mybuddy_app') then
    create role mybuddy_app login;
  end if;
end $$;

grant usage on schema public to mybuddy_app;
grant select, insert, update, delete on all tables in schema public to mybuddy_app;
grant execute on all functions in schema public to mybuddy_app;
