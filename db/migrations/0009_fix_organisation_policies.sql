-- The organisation read policies looked up organisation_members inside their own policy, which
-- Postgres rejects as infinite recursion. A security definer helper avoids the loop.

create or replace function is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organisation_members m
    where m.organisation_id = p_org and m.user_id = app_current_user()
  );
$$;

drop policy if exists organisations_read on organisations;
create policy organisations_read on organisations for select using (is_org_member(id));

drop policy if exists organisation_members_read on organisation_members;
create policy organisation_members_read on organisation_members for select using (is_org_member(organisation_id));

grant execute on all functions in schema public to mybuddy_app;
