-- Timesheet link clean-up.
-- Disconnecting Autopilot (from either app) also removes what Autopilot sent: the Teamwork task list
-- and the Teamwork hours per day. Time entries keep their Teamwork task and "In timesheet" mark.

create or replace function app_clear_timesheet(p_user text) returns void
language sql security definer set search_path = public as $$
  delete from timesheet_catalog where user_id = p_user;
  delete from timesheet_days where user_id = p_user;
$$;

-- Same as 0023, plus the clean-up when Autopilot disconnects with its token.
create or replace function app_revoke_token(p_token_hash text, p_client text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_user text;
begin
  update app_grants set revoked_at = now() where token_hash = p_token_hash and client = p_client and revoked_at is null
   returning user_id into v_user;
  if v_user is null then return false; end if;
  if p_client = 'autopilot' and not exists (select 1 from app_grants where user_id = v_user and client = p_client and revoked_at is null) then
    perform app_clear_timesheet(v_user);
  end if;
  return true;
end $$;

revoke all on function app_clear_timesheet(text) from public;
grant execute on function app_revoke_token(text, text) to mybuddy_app;
