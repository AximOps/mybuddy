-- Organisations: creating one, inviting people by email, roles, and membership changes.
-- Creation and invitation acceptance run as security definer functions, so the rules stay in one place.

create table invitations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  email text not null check (length(email) between 3 and 254),
  role org_role not null default 'member',
  token_hash text not null unique,
  invited_by text not null references "user"(id) on delete cascade,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function is_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organisation_members m
    where m.organisation_id = p_org and m.user_id = app_current_user() and m.role in ('owner', 'admin')
  );
$$;

create or replace function create_organisation(p_user text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  org uuid := gen_random_uuid();
  ws uuid := gen_random_uuid();
begin
  insert into organisations (id, name, created_by) values (org, p_name, p_user);
  insert into organisation_members (organisation_id, user_id, role) values (org, p_user, 'owner');
  insert into workspaces (id, name, kind, organisation_id) values (ws, p_name, 'organisation', org);
  insert into workspace_members (workspace_id, user_id, role) values (ws, p_user, 'owner');
  return org;
end;
$$;

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
    on conflict (organisation_id, user_id) do update set role = excluded.role;

  select id into ws from workspaces where organisation_id = inv.organisation_id and kind = 'organisation';
  insert into workspace_members (workspace_id, user_id, role)
    values (ws, p_user, case when inv.role = 'owner' then 'owner'::workspace_role else 'editor'::workspace_role end)
    on conflict (workspace_id, user_id) do nothing;

  update invitations set accepted_at = now() where id = inv.id;
  return inv.organisation_id;
end;
$$;

alter table invitations enable row level security;
create policy invitations_admin on invitations for all
  using (is_org_admin(organisation_id)) with check (is_org_admin(organisation_id));

create policy organisation_members_admin_update on organisation_members for update
  using (is_org_admin(organisation_id)) with check (is_org_admin(organisation_id));
create policy organisation_members_admin_delete on organisation_members for delete
  using (is_org_admin(organisation_id));

grant select, insert, update, delete on all tables in schema public to mybuddy_app;
grant execute on all functions in schema public to mybuddy_app;
