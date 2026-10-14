-- Student planner: subjects with credits and grade points, marks (assessments), class timetable,
-- and assignment and exam deadlines. Notes can link to a subject, a class or an exam.

create table subjects (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  credits numeric(4, 1) not null default 0 check (credits >= 0 and credits <= 30),
  grade_point numeric(3, 1) check (grade_point is null or (grade_point >= 0 and grade_point <= 10)),
  created_by text references "user"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table assessments (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  title text not null check (length(title) between 1 and 80),
  score numeric(7, 2) not null check (score >= 0),
  max_score numeric(7, 2) not null check (max_score > 0),
  check (score <= max_score),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table classes (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  subject_id uuid references subjects(id) on delete set null,
  title text not null check (length(title) between 1 and 60),
  kind text not null default 'lecture' check (kind in ('lecture', 'lab', 'tutorial')),
  weekday smallint not null check (weekday between 0 and 6),
  start_min smallint not null check (start_min between 0 and 1439),
  end_min smallint not null check (end_min between 1 and 1440),
  room text not null default '' check (length(room) <= 20),
  check (end_min > start_min),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table deadlines (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  subject_id uuid references subjects(id) on delete set null,
  title text not null check (length(title) between 1 and 120),
  kind text not null default 'assignment' check (kind in ('assignment', 'exam')),
  due_date date not null,
  due_time smallint check (due_time is null or due_time between 0 and 1439),
  done boolean not null default false,
  created_by text references "user"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table notes add column if not exists subject_id uuid references subjects(id) on delete set null;
alter table notes add column if not exists class_id uuid references classes(id) on delete set null;
alter table notes add column if not exists deadline_id uuid references deadlines(id) on delete set null;

alter table subjects enable row level security;
alter table assessments enable row level security;
alter table classes enable row level security;
alter table deadlines enable row level security;

create policy subjects_access on subjects for all using (is_workspace_member(workspace_id)) with check (can_write_workspace(workspace_id));
create policy assessments_access on assessments for all using (is_workspace_member(workspace_id)) with check (can_write_workspace(workspace_id));
create policy classes_access on classes for all using (is_workspace_member(workspace_id)) with check (can_write_workspace(workspace_id));
create policy deadlines_access on deadlines for all using (is_workspace_member(workspace_id)) with check (can_write_workspace(workspace_id));

create index idx_classes_ws on classes(workspace_id, weekday);
create index idx_deadlines_ws on deadlines(workspace_id, due_date);
create index idx_assessments_subject on assessments(subject_id);

grant select, insert, update, delete on all tables in schema public to mybuddy_app;
