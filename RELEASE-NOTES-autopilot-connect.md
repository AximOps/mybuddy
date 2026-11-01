# Connected apps: Autopilot by Opseros

People can connect My Buddy to **Autopilot by Opseros** (autopilot.opseros.com), which fills their Teamwork timesheet.
Autopilot reads a day's time entries, meetings, focus sessions and finished to-dos — read-only, after the person approves it.

## What's new
- **/connect/autopilot** — "Allow Autopilot" page (log in first if needed; `/login?next=` now returns there).
- **Settings → Connected apps** — see connected apps, last use, and Disconnect.
- API for Autopilot (bearer token, `no-store`):
  - `POST /api/integrations/autopilot/token` — swap the one-time code for a token (needs the client secret)
  - `GET  /api/integrations/autopilot/me` — who the token belongs to
  - `GET  /api/integrations/autopilot/day?date=YYYY-MM-DD` — that day's time entries, meetings, focus sessions, finished to-dos
  - `POST /api/integrations/autopilot/revoke` — disconnect from Autopilot's side
- Migration **0023_connected_apps.sql**: `app_grant_codes`, `app_grants` (only SHA-256 hashes stored; RLS on) and
  security-definer functions `app_redeem_code`, `app_token_owner`, `app_revoke_token` (same approach as `calendar_owner`).

## Security
- Codes: single use, 5 minutes, bound to the exact return address. Tokens: 256-bit random, stored hashed, revocable.
- The return address must equal `AUTOPILOT_REDIRECT_URI`, so codes can only go back to Autopilot.
- The token swap requires `AUTOPILOT_CLIENT_SECRET` (compared in constant time).
- Suspended accounts can't connect or use a token. A new connection replaces the person's previous one.
- Day data runs through `withUser()`, so row-level security limits it to what that person can already see.
  Organisation meetings are flagged `shared` (Autopilot leaves them unticked).

## Release steps
1. Vercel → Settings → Environment Variables (Production, and Preview for testing):
   - `AUTOPILOT_REDIRECT_URI` = `https://autopilot.opseros.com/mybuddy.php`
   - `AUTOPILOT_CLIENT_SECRET` = the value from Autopilot → Admin → Organisation → MyBuddy → Generate (32+ characters)
2. `npm run db:migrate` (uses `MIGRATION_DATABASE_URL`). Best first on a Neon branch with a Vercel preview.
3. Deploy. Without both variables the feature stays off (the connect page says it isn't set up).

## Tested
- `tsc --noEmit` clean.
- All migrations 0001–0023 applied on PGlite (Postgres 16 in WASM) as the restricted `mybuddy_app` role with RLS:
  code single-use / expiry / wrong return address refused, reconnect replaces the old token, revoke works,
  people can't see or revoke others' connections or time entries; day queries return the expected rows.
- Autopilot end to end against a stand-in that follows these endpoints exactly (connect → import → disconnect).

## Timesheet link (migration 0024)
- Work → Projects: each project can point to a Teamwork project (only shown to people connected to Autopilot).
- Time entries, the timer and planned blocks carry a Teamwork task, picked from the list Autopilot sends.
  Picking a task on an unlinked project links that project automatically.
- Autopilot marks entries it has logged ("In timesheet"); they are not offered again.
- Today: time entries, the running timer and planned work blocks are on the timeline. Ticking a planned block
  off saves it as a time entry. A Timesheet card shows Teamwork hours vs target and what is not sent yet.
- New Autopilot endpoints: POST /api/integrations/autopilot/catalog, /status, /logged. The day endpoint now
  returns `teamwork`, `loggedAt`, `logId` on time entries, and `plans`.
- Deploy: `npm run db:migrate` (adds 0024), then redeploy. No new environment variables.

## Timesheet clean-up (migration 0025)
- Disconnecting Autopilot (MyBuddy Settings or Autopilot) deletes the Teamwork task list and hours it sent.
  Time entries keep their Teamwork task and "In timesheet" mark.
- DELETE /api/integrations/autopilot/catalog ("Remove from MyBuddy" in Autopilot).
- Entries/plans whose Teamwork task is no longer in the list show "Task removed in Teamwork"; the day
  endpoint returns `teamwork.removed: true` for them.
- Deploy: `npm run db:migrate` (adds 0025), then redeploy.
