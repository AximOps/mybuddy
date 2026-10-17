-- Two-way sync with the Amiroon phone app.
-- Every synced table needs updated_at kept current by the database, so the server can send the phone
-- "everything that changed since X". The original planner tables already have it (touch triggers);
-- this adds it to the rest. Rows are deleted softly (deleted_at), so deletions sync too.

alter table classes      add column if not exists updated_at timestamptz not null default now();
alter table assessments  add column if not exists updated_at timestamptz not null default now();
alter table clients      add column if not exists updated_at timestamptz not null default now();
alter table projects     add column if not exists updated_at timestamptz not null default now();
alter table time_entries add column if not exists updated_at timestamptz not null default now();

do $$
declare t text;
begin
  foreach t in array array['subjects', 'deadlines', 'classes', 'assessments', 'expenses', 'clients', 'projects', 'time_entries', 'meetings'] loop
    execute format('drop trigger if exists %I on %I', t || '_touch', t);
    execute format('create trigger %I before update on %I for each row execute function touch_updated_at()', t || '_touch', t);
    execute format('create index if not exists %I on %I (workspace_id, updated_at)', 'idx_' || t || '_sync', t);
  end loop;
end $$;
create index if not exists idx_routine_days_sync on routine_days (workspace_id, updated_at);

-- Checklist items and meeting action items travel with their note or meeting. Any change to them
-- marks the parent as changed, so the phone picks up the whole set.
create or replace function touch_parent_note() returns trigger language plpgsql as $$
begin
  update notes set updated_at = now() where id = coalesce(new.note_id, old.note_id);
  return null;
end $$;
drop trigger if exists note_items_touch_parent on note_items;
create trigger note_items_touch_parent after insert or update or delete on note_items for each row execute function touch_parent_note();

create or replace function touch_parent_meeting() returns trigger language plpgsql as $$
begin
  update meetings set updated_at = now() where id = coalesce(new.meeting_id, old.meeting_id);
  return null;
end $$;
drop trigger if exists meeting_actions_touch_parent on meeting_actions;
create trigger meeting_actions_touch_parent after insert or update or delete on meeting_actions for each row execute function touch_parent_meeting();

-- "Reset all data" removes rows for good, so there is nothing left to tell the phone they were deleted.
-- The time of the last reset tells the phone to clear its copy and download again.
alter table user_settings add column if not exists data_reset_at timestamptz;

grant execute on all functions in schema public to mybuddy_app;

-- "Newest change wins" needs the time of each change, not the time it reached the server: a phone that
-- was offline sends old changes late. changed_at holds that time. It is now() for changes made on the
-- website; the sync sets app.change_at to the phone's change time while it saves a phone change.
-- (updated_at stays the time the row was saved here, so "what changed since X" still works.)
create or replace function touch_changed_at() returns trigger language plpgsql as $$
begin
  new.changed_at := coalesce(nullif(current_setting('app.change_at', true), '')::timestamptz, now());
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['routines', 'routine_days', 'events', 'completions', 'subjects', 'classes', 'deadlines', 'assessments',
                           'notes', 'tasks', 'expenses', 'clients', 'projects', 'time_entries', 'meetings'] loop
    execute format('alter table %I add column if not exists changed_at timestamptz', t);
    execute format('update %I set changed_at = updated_at where changed_at is null', t);
    execute format('alter table %I alter column changed_at set default now(), alter column changed_at set not null', t);
    execute format('drop trigger if exists %I on %I', t || '_changed', t);
    execute format('create trigger %I before insert or update on %I for each row execute function touch_changed_at()', t || '_changed', t);
  end loop;
end $$;

grant execute on function touch_changed_at() to mybuddy_app;
