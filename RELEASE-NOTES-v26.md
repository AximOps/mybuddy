# My Buddy web v26: Teams

## Before you deploy
- **Run the database migration first:** `npm run db:migrate` with `MIGRATION_DATABASE_URL` set to the owner
  connection. It adds `db/migrations/0019_teams.sql`. Then redeploy on Vercel.
- The migration also fixes access left over from earlier member removals (see Security fix below).

## What changed
- **Team is now Teams**, at `/teams`. The sidebar says Teams, because a person can be in several teams.
  Old `/organisation` links and bookmarks redirect to `/teams`, query strings included.
- **New team.** The page has a **New team** button even when you already belong to a team.
- **Switch between teams.** Your teams show as a row of cards with your role and the member count. Pick one to
  manage it. `/teams?team=<id>` opens a team directly.
- **Rename** a team (owners and admins). The team's workspace name in Work changes with it.
- **Open in Work** switches the Work page to that team's workspace.
- **Leave team.** The last member to leave deletes the team. A sole owner must make someone else an owner first.
- **Delete team** (owners only, after typing the team name). Deletes the team's projects, clients, time,
  meetings, invoices and timesheets for everyone.
- **Role names follow the mode:** Employee in Work mode, Member in Student mode.
- A team can't be left without an owner: the last owner can't be demoted.
- Accepting an invitation opens the team you joined. The invitation page says "Join the team".

## Security fix
- Removing someone from a team took them off the member list but kept their access to the team's shared
  workspace (projects, time entries, meetings, invoices). Role changes also never reached the workspace.
  The cause: the app cannot update or delete `workspace_members` rows under row-level security. Membership
  changes now go through database functions (`set_org_member_role`, `remove_org_member`,
  `leave_organisation`, `rename_organisation`, `delete_organisation`) that check permissions and update both
  tables together.
- The migration removes workspace access for anyone who is no longer in the team, and brings workspace roles
  in line with team roles.

## Files
- New: `app/(app)/teams/page.tsx`, `db/migrations/0019_teams.sql`.
- Removed: `app/(app)/organisation/page.tsx`. The redirect is in `next.config.ts`.
- Changed: `app/actions.ts` (team actions; new `renameTeam`, `leaveTeam`, `deleteTeam`, `workInTeam`),
  `components/Sidebar.tsx`, `app/invite/[token]/page.tsx`, `next.config.ts`, `app/globals.css`.

## How to check
1. Work or Student mode → Teams → New team. Create a second team and switch between them.
2. Invite someone, accept as them, then remove them. They should no longer see the team in Work.
3. As the only owner, Leave team is disabled until you make someone else an owner.
4. Delete a test team by typing its name.

## Tagline (v26.1)
- The tagline under the logo changed from "Daily Planner" to **"Life Organized!"**: in the sidebar, the phone
  header, and the login, signup and welcome screens (`components/BuddyLogo.tsx`).
- The installed app's full name is now "My Buddy · Life Organized!" (`app/manifest.ts`). Devices that already
  installed the app pick up the new name when the browser next refreshes the manifest. The home-screen label
  stays "My Buddy".
