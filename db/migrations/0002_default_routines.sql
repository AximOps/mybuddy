-- New accounts start with the three default routines, as in the phone app.
-- Replaces create_personal_workspace() so it also seeds routines and events.

create or replace function create_personal_workspace(p_user text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  ws uuid := gen_random_uuid();
  r_weekday uuid := gen_random_uuid();
  r_meetings uuid := gen_random_uuid();
  r_weekend uuid := gen_random_uuid();
begin
  insert into workspaces (id, name, kind, owner_id) values (ws, p_name, 'personal', p_user);
  insert into workspace_members (workspace_id, user_id, role) values (ws, p_user, 'owner');

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

  return ws;
end;
$$;
