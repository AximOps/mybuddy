-- Summary numbers for the admin home page. Counts only, no personal content.

create or replace function admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_platform_admin();
  return jsonb_build_object(
    'users', (select count(*)::int from "user"),
    'premium', (select count(*)::int from user_settings where plan = 'premium' and (plan_until is null or plan_until > now())),
    'joinedLast7Days', (select count(*)::int from "user" where "createdAt" > now() - interval '7 days'),
    'onboarded', (select count(*)::int from user_settings),
    'teams', (select count(*)::int from organisations),
    'activeLast7Days', (select count(distinct w.owner_id)::int from tasks t join workspaces w on w.id = t.workspace_id
                         where t.updated_at > now() - interval '7 days' and w.owner_id is not null)
  );
end;
$$;

grant execute on all functions in schema public to mybuddy_app;
