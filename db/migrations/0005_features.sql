-- Feature parity with the mobile app: spending, custom tags, note checklists and reminders,
-- settings (theme, mode, student tools, monthly budget) and default-routine seeding for resets.

alter table user_settings add column if not exists monthly_budget_minor integer
  check (monthly_budget_minor is null or monthly_budget_minor > 0);
alter table user_settings add column if not exists theme text not null default 'system'
  check (theme in ('system', 'light', 'dark'));
alter table user_settings add column if not exists mode text not null default 'personal'
  check (mode in ('student', 'personal', 'work'));
alter table user_settings add column if not exists student_enabled boolean not null default true;
alter table user_settings add column if not exists student_level text not null default 'college'
  check (student_level in ('school', 'college'));

create table custom_tags (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  scope text not null check (scope in ('task', 'note', 'spend')),
  name text not null check (length(name) between 1 and 20),
  created_at timestamptz not null default now(),
  unique (user_id, scope, name)
);
alter table custom_tags enable row level security;
create policy custom_tags_self on custom_tags for all
  using (user_id = app_current_user()) with check (user_id = app_current_user());

create table expenses (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  spent_on date not null,
  amount_minor integer not null check (amount_minor > 0 and amount_minor <= 99999999),
  category text not null default 'other' check (length(category) between 1 and 20),
  note text not null default '' check (length(note) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_expenses_user_day on expenses(user_id, spent_on);
alter table expenses enable row level security;
create policy expenses_read on expenses for select
  using (user_id = app_current_user() and is_workspace_member(workspace_id));
create policy expenses_insert on expenses for insert
  with check (user_id = app_current_user() and is_workspace_member(workspace_id));
create policy expenses_update on expenses for update
  using (user_id = app_current_user()) with check (user_id = app_current_user());

create table note_items (
  id uuid primary key,
  note_id uuid not null references notes(id) on delete cascade,
  text text not null check (length(text) between 1 and 200),
  done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table note_items enable row level security;
create policy note_items_access on note_items for all
  using (exists (select 1 from notes n where n.id = note_id and is_workspace_member(n.workspace_id)))
  with check (exists (select 1 from notes n where n.id = note_id and can_write_workspace(n.workspace_id)));

-- Seeds the three default routines and their activities into a workspace (same as sign-up).
create or replace function seed_default_routines(ws uuid, p_user text) returns void
language plpgsql security definer set search_path = public as $$
declare
  r_weekday uuid := gen_random_uuid();
  r_meetings uuid := gen_random_uuid();
  r_weekend uuid := gen_random_uuid();
begin
  insert into routines (id, workspace_id, name, color, sort_order, created_by) values
    (r_weekday, ws, 'Weekday', '#4B5BE8', 0, p_user),
    (r_meetings, ws, 'Meeting days', '#8B5CF6', 1, p_user),
    (r_weekend, ws, 'Weekend', '#2FA67B', 2, p_user);
  insert into routine_days (workspace_id, weekday, routine_id) values
    (ws, 1, r_weekday), (ws, 3, r_weekday), (ws, 4, r_weekday),
    (ws, 2, r_meetings), (ws, 5, r_meetings),
    (ws, 0, r_weekend), (ws, 6, r_weekend);
  insert into events (id, workspace_id, routine_id, title, emoji, start_min, end_min, category, remind_min, created_by) values
    (gen_random_uuid(), ws, r_weekday, 'Morning walk', '🚶', 390, 420, 'health', 10, p_user),
    (gen_random_uuid(), ws, r_weekday, 'Freshen up', '🚿', 420, 450, 'personal', 0, p_user),
    (gen_random_uuid(), ws, r_weekday, 'Breakfast', '🍳', 450, 480, 'meal', 5, p_user),
    (gen_random_uuid(), ws, r_weekday, 'Morning reading', '📖', 480, 510, 'personal', 5, p_user),
    (gen_random_uuid(), ws, r_weekday, 'Deep work', '💼', 540, 720, 'work', 5, p_user),
    (gen_random_uuid(), ws, r_weekday, 'Lunch', '🥗', 720, 780, 'meal', 5, p_user),
    (gen_random_uuid(), ws, r_weekday, 'Work block', '💻', 780, 1020, 'work', 5, p_user),
    (gen_random_uuid(), ws, r_weekday, 'Workout', '🏃', 1080, 1140, 'health', 10, p_user),
    (gen_random_uuid(), ws, r_weekday, 'Wind down', '🌙', 1290, 1320, 'personal', 0, p_user),
    (gen_random_uuid(), ws, r_meetings, 'Morning walk', '🚶', 390, 420, 'health', 10, p_user),
    (gen_random_uuid(), ws, r_meetings, 'Breakfast', '🍳', 450, 480, 'meal', 5, p_user),
    (gen_random_uuid(), ws, r_meetings, 'Prep for meetings', '🧠', 510, 570, 'work', 10, p_user),
    (gen_random_uuid(), ws, r_meetings, 'Team standup', '👥', 570, 600, 'work', 10, p_user),
    (gen_random_uuid(), ws, r_meetings, 'Client calls', '📞', 600, 720, 'work', 10, p_user),
    (gen_random_uuid(), ws, r_meetings, 'Lunch', '🥗', 720, 780, 'meal', 5, p_user),
    (gen_random_uuid(), ws, r_meetings, 'Follow-ups', '📝', 840, 960, 'work', 5, p_user),
    (gen_random_uuid(), ws, r_meetings, 'Wind down', '🌙', 1290, 1320, 'personal', 0, p_user),
    (gen_random_uuid(), ws, r_weekend, 'Morning walk', '🚶', 390, 420, 'health', 10, p_user),
    (gen_random_uuid(), ws, r_weekend, 'Breakfast', '🍳', 450, 480, 'meal', 5, p_user),
    (gen_random_uuid(), ws, r_weekend, 'Morning reading', '📖', 480, 510, 'personal', 5, p_user),
    (gen_random_uuid(), ws, r_weekend, 'Stretching', '🧘', 510, 540, 'health', 5, p_user),
    (gen_random_uuid(), ws, r_weekend, 'Free time', '🌿', 540, 630, 'personal', 0, p_user),
    (gen_random_uuid(), ws, r_weekend, 'Lunch', '🥗', 780, 840, 'meal', 5, p_user);
end;
$$;

grant select, insert, update, delete on all tables in schema public to mybuddy_app;
grant execute on all functions in schema public to mybuddy_app;
