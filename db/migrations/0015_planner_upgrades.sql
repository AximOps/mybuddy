-- Planner upgrades: repeating to-dos, focus linked to a task, private calendar feed,
-- recurring bills, category budgets and imported expenses.

-- 2. Repeating to-dos. When a repeating task is ticked off, the next one is created.
alter table tasks add column if not exists repeat text not null default 'none'
  check (repeat in ('none', 'daily', 'weekdays', 'weekly', 'monthly'));

-- 5. A focus session can be started from a task.
alter table focus_sessions add column if not exists task_id uuid references tasks(id) on delete set null;

-- 3. Private calendar feed. The token is a secret in the subscription URL.
alter table user_settings add column if not exists calendar_token text unique;

-- The feed has no browser session, so this looks up the owner of a token without row-level security.
create or replace function calendar_owner(p_token text) returns text
language sql stable security definer set search_path = public as $$
  select user_id from user_settings where calendar_token = p_token and length(p_token) >= 32 limit 1;
$$;

-- 8. Recurring bills, posted as expenses once a month on their day.
create table if not exists recurring_expenses (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  name text not null,
  amount_minor integer not null check (amount_minor > 0),
  category text not null default 'bills',
  day_of_month smallint not null check (day_of_month between 1 and 28),
  last_posted_month text,              -- 'YYYY-MM' of the last expense created from this bill
  active boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists recurring_expenses_user on recurring_expenses (user_id) where deleted_at is null;
alter table recurring_expenses enable row level security;
drop policy if exists recurring_expenses_self on recurring_expenses;
create policy recurring_expenses_self on recurring_expenses for all
  using (user_id = app_current_user()) with check (user_id = app_current_user());

-- 8. Monthly budget per spending category.
create table if not exists category_budgets (
  user_id text not null references "user"(id) on delete cascade,
  category text not null,
  amount_minor integer not null check (amount_minor > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);
alter table category_budgets enable row level security;
drop policy if exists category_budgets_self on category_budgets;
create policy category_budgets_self on category_budgets for all
  using (user_id = app_current_user()) with check (user_id = app_current_user());

-- 8. Expenses created from a bill or a bank CSV are marked, so imports can skip duplicates.
alter table expenses add column if not exists source text not null default 'manual';
alter table expenses add column if not exists source_ref text;
create index if not exists expenses_source_ref on expenses (user_id, source_ref) where source_ref is not null;

grant select, insert, update, delete on recurring_expenses, category_budgets to mybuddy_app;
grant execute on all functions in schema public to mybuddy_app;
