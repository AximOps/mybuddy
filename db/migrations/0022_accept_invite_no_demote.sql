-- Accepting an invitation never lowers someone's role. Before, an owner who opened an old "member"
-- invitation was turned into a member, which could leave a team with no owner.
create or replace function accept_invitation(p_user text, p_token_hash text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv invitations%rowtype;
  me_email text;
  ws uuid;
begin
  select * into inv from invitations where token_hash = p_token_hash;
  if not found then raise exception 'This invitation link is not valid.'; end if;
  if inv.accepted_at is not null then raise exception 'This invitation has already been used.'; end if;
  if inv.expires_at < now() then raise exception 'This invitation has expired. Ask for a new one.'; end if;
  select email into me_email from "user" where id = p_user;
  if lower(me_email) <> lower(inv.email) then
    raise exception 'Log in with % to accept this invitation.', inv.email;
  end if;

  insert into organisation_members (organisation_id, user_id, role) values (inv.organisation_id, p_user, inv.role)
    on conflict (organisation_id, user_id) do update
      set role = case
        when organisation_members.role = 'owner' or excluded.role = 'owner' then 'owner'::org_role
        when organisation_members.role = 'admin' or excluded.role = 'admin' then 'admin'::org_role
        else 'member'::org_role end;

  select id into ws from workspaces where organisation_id = inv.organisation_id and kind = 'organisation';
  insert into workspace_members (workspace_id, user_id, role)
    values (ws, p_user, case when inv.role = 'owner' then 'owner'::workspace_role else 'editor'::workspace_role end)
    on conflict (workspace_id, user_id) do update
      set role = case when excluded.role = 'owner' then 'owner'::workspace_role else workspace_members.role end;

  update invitations set accepted_at = now() where id = inv.id;
  return inv.organisation_id;
end;
$$;
