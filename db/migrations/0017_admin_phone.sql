
-- Admin user detail also shows the mobile number, for support.
create or replace function admin_user_detail(p_target text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_platform_admin();
  return jsonb_build_object(
    'user', (select jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email, 'emailVerified', u."emailVerified", 'joinedAt', u."createdAt")
               from "user" u where u.id = p_target),
    'settings', (select jsonb_build_object('plan', s.plan, 'planUntil', s.plan_until, 'mode', s.mode,
                   'timezone', s.timezone, 'currency', s.currency, 'studentEnabled', s.student_enabled,
                   'suspendedAt', s.suspended_at, 'suspendedReason', s.suspended_reason,
                   'trialStartedAt', s.trial_started_at, 'trialUsed', s.trial_used, 'phone', s.phone)
                   from user_settings s where s.user_id = p_target),
    'signInMethods', (select coalesce(jsonb_agg(a."providerId"), '[]'::jsonb) from account a where a."userId" = p_target),
    'organisations', (select coalesce(jsonb_agg(jsonb_build_object('name', o.name, 'role', m.role)), '[]'::jsonb)
                        from organisation_members m join organisations o on o.id = m.organisation_id where m.user_id = p_target),
    'createsTeam', (select exists (select 1 from organisations where created_by = p_target)),
    'isAdmin', (select is_platform_admin(p_target)),
    'audit', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
                select a.created_at, a.action, a.details, adm.email as by_email from admin_audit a
                  left join "user" adm on adm.id = a.admin_id
                 where a.target_user_id = p_target order by a.created_at desc limit 50) x)
  );
end;
$$;

grant execute on all functions in schema public to mybuddy_app;
