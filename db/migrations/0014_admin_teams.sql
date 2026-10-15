-- Admin view of teams: name, owner, member count and creation date. No team content.

create or replace function admin_list_teams() returns table (
  team_id uuid, team_name text, created_at timestamptz, members int, owner_email text
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform require_platform_admin();
  return query
  select o.id, o.name, o.created_at,
         (select count(*)::int from organisation_members m where m.organisation_id = o.id),
         (select u.email from "user" u where u.id = o.created_by)
    from organisations o
   order by o.created_at desc;
end;
$$;

grant execute on all functions in schema public to mybuddy_app;
