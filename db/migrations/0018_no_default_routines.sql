-- New accounts start empty: no sample routines or activities. People add their own.
-- Existing accounts keep whatever routines they have.

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

grant execute on all functions in schema public to mybuddy_app;
