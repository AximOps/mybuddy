-- Teams: several teams per person, plus safe membership changes.
--
-- workspace_members has row-level security with only a read policy, so the app could not update or
-- delete rows there. Removing someone from a team took them off the member list but kept their access
-- to the team's shared workspace (projects, time, meetings, invoices), and role changes never reached
-- the workspace. These functions make every membership change in one place, with the checks inside.

create or replace function org_role_for(p_org uuid, p_user text) returns org_role
language sql stable security definer set search_path = public as $$
  select role from organisation_members where organisation_id = p_org and user_id = p_user;
$$;

create or replace function set_org_member_role(p_actor text, p_org uuid, p_user text, p_role org_role) returns void
language plpgsql security definer set search_path = public as $$
declare
  mine org_role := org_role_for(p_org, p_actor);
  theirs org_role := org_role_for(p_org, p_user);
begin
  if mine is null or mine = 'member' or theirs is null then raise exception 'You cannot change roles in this team.'; end if;
  if (theirs = 'owner' or p_role = 'owner') and mine <> 'owner' then raise exception 'Only an owner can make or change owners.'; end if;
  if theirs = 'owner' and p_role <> 'owner'
     and (select count(*) from organisation_members where organisation_id = p_org and role = 'owner') <= 1 then
    raise exception 'A team needs at least one owner.';
  end if;
  update organisation_members set role = p_role where organisation_id = p_org and user_id = p_user;
  update workspace_members set role = case when p_role = 'owner' then 'owner'::workspace_role else 'editor'::workspace_role end
   where user_id = p_user and workspace_id in (select id from workspaces where organisation_id = p_org);
end;
$$;

create or replace function remove_org_member(p_actor text, p_org uuid, p_user text) returns void
language plpgsql security definer set search_path = public as $$
declare
  mine org_role := org_role_for(p_org, p_actor);
  theirs org_role := org_role_for(p_org, p_user);
begin
  if p_actor = p_user then raise exception 'Use Leave team to leave.'; end if;
  if mine is null or mine = 'member' or theirs is null then raise exception 'You cannot remove people from this team.'; end if;
  if theirs = 'owner' and mine <> 'owner' then raise exception 'Only an owner can remove an owner.'; end if;
  delete from organisation_members where organisation_id = p_org and user_id = p_user;
  delete from workspace_members where user_id = p_user and workspace_id in (select id from workspaces where organisation_id = p_org);
end;
$$;

-- Returns 'left', or 'deleted' when the last member leaves (the team and its shared data go).
create or replace function leave_organisation(p_user text, p_org uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  mine org_role := org_role_for(p_org, p_user);
  others int;
begin
  if mine is null then raise exception 'You are not in this team.'; end if;
  select count(*) into others from organisation_members where organisation_id = p_org and user_id <> p_user;
  if others = 0 then
    delete from organisations where id = p_org;
    return 'deleted';
  end if;
  if mine = 'owner' and not exists (select 1 from organisation_members where organisation_id = p_org and role = 'owner' and user_id <> p_user) then
    raise exception 'Make someone else an owner before you leave.';
  end if;
  delete from organisation_members where organisation_id = p_org and user_id = p_user;
  delete from workspace_members where user_id = p_user and workspace_id in (select id from workspaces where organisation_id = p_org);
  return 'left';
end;
$$;

create or replace function rename_organisation(p_actor text, p_org uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  mine org_role := org_role_for(p_org, p_actor);
  clean text := btrim(p_name);
begin
  if mine is null or mine = 'member' then raise exception 'Only owners and admins can rename the team.'; end if;
  if length(clean) not between 1 and 120 then raise exception 'Team names are 1 to 120 characters.'; end if;
  update organisations set name = clean where id = p_org;
  update workspaces set name = clean where organisation_id = p_org;
end;
$$;

-- Deletes the team and everything in its shared workspace. Owners only.
create or replace function delete_organisation(p_actor text, p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if org_role_for(p_org, p_actor) is distinct from 'owner' then raise exception 'Only an owner can delete the team.'; end if;
  delete from organisations where id = p_org;
end;
$$;

-- Clean up: people removed before this fix still had access to the team workspace.
delete from workspace_members wm
 using workspaces w
 where w.id = wm.workspace_id and w.kind = 'organisation'
   and not exists (select 1 from organisation_members m where m.organisation_id = w.organisation_id and m.user_id = wm.user_id);

-- Bring workspace roles in line with team roles changed before this fix.
update workspace_members wm
   set role = case when m.role = 'owner' then 'owner'::workspace_role else 'editor'::workspace_role end
  from workspaces w, organisation_members m
 where w.id = wm.workspace_id and w.kind = 'organisation'
   and m.organisation_id = w.organisation_id and m.user_id = wm.user_id
   and wm.role is distinct from case when m.role = 'owner' then 'owner'::workspace_role else 'editor'::workspace_role end;

grant execute on all functions in schema public to mybuddy_app;
