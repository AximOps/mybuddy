-- Connected apps: lets Autopilot by Opseros (autopilot.opseros.com) read a person's work day, with their approval.
-- Flow: My Buddy shows an "Allow" page -> a one-time code goes back to Autopilot -> Autopilot swaps it
-- (server to server, with its client secret) for a long-lived access token.
-- Only SHA-256 hashes of codes and tokens are stored. Token requests arrive without a browser session,
-- so they go through the security-definer functions below (same approach as calendar_owner()).

create table if not exists app_grant_codes (
  code_hash text primary key,
  user_id text not null references "user"(id) on delete cascade,
  client text not null check (length(client) between 1 and 40),
  redirect_uri text not null check (length(redirect_uri) <= 500),
  expires_at timestamptz not null,
  used_at timestamptz
);

create table if not exists app_grants (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  client text not null check (length(client) between 1 and 40),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists idx_app_grants_user on app_grants(user_id, client);

alter table app_grant_codes enable row level security;
alter table app_grants enable row level security;

-- People see and disconnect their own connections; codes are created for the signed-in person only.
drop policy if exists app_grants_read on app_grants;
create policy app_grants_read on app_grants for select using (user_id = app_current_user());
drop policy if exists app_grants_revoke on app_grants;
create policy app_grants_revoke on app_grants for update using (user_id = app_current_user()) with check (user_id = app_current_user());
drop policy if exists app_grant_codes_create on app_grant_codes;
create policy app_grant_codes_create on app_grant_codes for insert with check (user_id = app_current_user());

-- Swaps a one-time code (5 minutes, single use, same app and return address) for a new access token.
-- A new connection replaces the person's previous one for that app. Returns the user id, or null.
create or replace function app_redeem_code(p_code_hash text, p_client text, p_redirect text, p_token_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare v_user text;
begin
  update app_grant_codes set used_at = now()
   where code_hash = p_code_hash and client = p_client and redirect_uri = p_redirect
     and used_at is null and expires_at > now()
   returning user_id into v_user;
  if v_user is null or is_user_suspended(v_user) then return null; end if;
  update app_grants set revoked_at = now() where user_id = v_user and client = p_client and revoked_at is null;
  insert into app_grants (user_id, client, token_hash) values (v_user, p_client, p_token_hash);
  delete from app_grant_codes where expires_at < now() - interval '1 day';
  return v_user;
end $$;

-- Owner of an access token (null when unknown, disconnected or the account is suspended). Records the last use.
create or replace function app_token_owner(p_token_hash text, p_client text) returns text
language plpgsql security definer set search_path = public as $$
declare v_user text;
begin
  update app_grants set last_used_at = now()
   where token_hash = p_token_hash and client = p_client and revoked_at is null
   returning user_id into v_user;
  if v_user is not null and is_user_suspended(v_user) then return null; end if;
  return v_user;
end $$;

-- Disconnect from the other app's side (it holds the token).
create or replace function app_revoke_token(p_token_hash text, p_client text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update app_grants set revoked_at = now() where token_hash = p_token_hash and client = p_client and revoked_at is null;
  return found;
end $$;

grant select, insert, update, delete on app_grants, app_grant_codes to mybuddy_app;
grant execute on function app_redeem_code(text, text, text, text), app_token_owner(text, text), app_revoke_token(text, text) to mybuddy_app;
