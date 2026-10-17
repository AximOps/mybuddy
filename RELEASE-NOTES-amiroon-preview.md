# Amiroon preview (based on v27.1)

A copy of v27.1 with the app renamed from **My Buddy** to **Amiroon**, tagline **Life Organized!**.
Everything else is the same. No database migration beyond v27.1.

## What changed
- **Wordmark:** "Ami**roon**" in the same two-colour style (blue in the app, yellow on the login screen).
  It has the same logo icon and the tagline "Life Organized!".
- **Browser tab, installed app name and home-screen label:** "Amiroon". The full app name is
  "Amiroon · Life Organized!".
- **Login and signup brand panel** (option C from the prototype):
  - The headline is "Your **Day**, organized by Ami**roon**..." The yellow word changes every 2 seconds:
    Day → Life → Money → Work → Study, then starts again. Screen readers hear the whole sentence once.
    With reduced motion turned on, the words change without sliding.
  - Under it: "Free to start. Works on your phone and computer, always in sync."
  - Four tiles: Plan, Focus, Money, and Study and work, each with one line on what it covers.
  - The Free and Premium cards each have one line instead of a feature list. The Today sample card is removed.
  - On phones the order is: logo, headline, tiles, login form, plans.
- If a user has no name, the greeting says "Good morning, there" instead of "buddy".
- Every "My Buddy" in the app text and emails now says "Amiroon": invitations, password reset, meeting notes,
  install banner, Settings, Focus and admin. Also renamed: the data export file name, the calendar feed name
  and the PDF invoice footer.

## Kept on purpose
- Browser storage keys (`mybuddy.*`), so people keep their timers, alarms, preferences and reminder settings.
- The package name, the database role `mybuddy_app` and the cookies. People never see them, and changing them would
  break existing setups.

## Still to change outside this code
- `MAIL_FROM` in Vercel (for example "Amiroon <hello@yourdomain.com>").
- The domain, app store listings, the mobile app's name and splash screen, and the Google and Apple sign-in
  consent screen names.

## The "+" in empty lists now adds things
Before this change, the "+" shown in an empty list was only a picture. Now it is a button that opens a pop-up with the add form.
The pop-up puts the cursor in the first field and closes once saved. Escape, the X or a click outside also close it.
On phones it opens as a sheet from the bottom of the screen.
- **Today → Your day:** add an activity (title, icon, start and end).
- **To-Do:** add a to-do (date, time, tag, repeat).
- **Notes:** a quick note (title, text, tag, reminder, pin). Both empty spots on the page have it.
- **Spending:** add an expense for the day shown.
- **Routines:** add an activity to a routine that has none.
- **Student:** add a class, an assignment or exam, or a subject.
- **Work:** add a project or a meeting.
The add forms already on these pages stay where they are. New file: `components/AddDialog.tsx`. No migration.

## Sign-in for the Amiroon phone app
- The phone app now signs up and logs in with the same accounts as the website.
- `lib/auth.ts` adds Better Auth's `bearer` plugin. The app keeps the session token from the sign-in reply and
  sends it as `Authorization: Bearer <token>`. It also adds the app's link schemes (`amiroon://`, `mybuddy://`) as
  trusted origins.
- New `GET /api/mobile/me` returns the signed-in person's name and email, plus their mode, plan, trial and time zone.
- Existing pages that read the session, such as `/api/upcoming`, also accept the bearer token.
- No migration. Website cookies and sign-in work as before.
- For Google sign-in in the app, the server's Google settings must accept the app's Google client IDs.

## Preview 6: sync with the phone app (Stage 2)
The phone app and the website now share one set of data. A change made on either side shows up on the other.

**What syncs:** routines and their days, activities and ticks, to-dos, notes with checklists and reminders,
spending, subjects, classes, deadlines, assessments, clients, projects, time entries, and meetings with their action
items and Meet links. Only the personal space syncs. Teams stay on the website until Stage 3.

**How it works**
- New endpoint `POST /api/mobile/sync` (bearer token). In one call the phone sends its changes and gets back
  what changed on the server, in pages of up to 2,000 rows (`more: true` means call again).
- **Newest change wins.** Each phone change carries the time it was made. The server keeps it only if it is
  newer than the server's copy, and otherwise sends its own copy back. A phone that was offline for a day
  does not overwrite newer edits made elsewhere. The server also corrects for a phone clock that is wrong.
- **Deletions sync.** Rows are deleted softly (`deleted_at`), and the phone receives the deletion.
- A change the server refuses (for example a time entry without a project, or text longer than the website
  allows) is skipped, and the phone tells the person how many were not saved.
- Linked items (routine, subject, project and so on) and checklist or action item ids must belong to the
  person's own personal space. Foreign keys skip row-level security, so the server checks these itself.
- **Reset all data** on the website now also clears the data on the person's phones the next time they sync.

**Migration `0021_sync.sql`** (run `npm run db:migrate` before deploying):
- `updated_at` and touch triggers for classes, assessments, clients, projects and time entries, plus sync indexes.
- `changed_at` (the time of the change) on every synced table, set by a trigger.
- Changes to checklist items and meeting actions mark their note or meeting as changed.
- `user_settings.data_reset_at`.

New files: `lib/sync.ts`, `app/api/mobile/sync/route.ts`. Changed: `app/actions.ts` (reset sets `data_reset_at`).

## Preview 7: fixes for the phone app
- `POST /api/mobile/sync` returns a clear 503 error when the database has not had migration `0021_sync.sql`,
  instead of a general 500. **Run `npm run db:migrate` on the production database before the phone app
  can sync.**
- New optional `MOBILE_WEB_ORIGINS` setting, with `proxy.ts`: lets the app's browser build call the sign-in and
  sync API from its own address (for testing on a computer or phone browser). Native phone apps do not need it.
  The same addresses are added to Better Auth's trusted origins.

## Preview 8
- New `GET /api/mobile/health` returns `{ app: "amiroon", api: 1, sync: true|false }`. The phone app uses it
  to check a website address before it saves it. `sync` is false until migration `0021_sync.sql` has run. No
  personal data.

## Preview 9: My Buddy by Amiroon, and Teams for the phone app
- **New name (option C):**
  - The logo is "My **Buddy**" with a yellow **BY AMIROON** badge, and the tagline stays "Life Organized!"
    (`components/BuddyLogo.tsx`, `.brand-badge` in `globals.css`). In the narrow sidebar the badge sits under
    the name.
  - The login heading is "Your **Day**, organized by My **Buddy**...". "My Buddy..." never breaks across two
    lines.
  - Each rotating word now has room for the tail of y, so nothing shows above the next word.
  - The browser tab and the installed app's full name are "My Buddy by Amiroon". The home-screen label is
    "My Buddy".
  - Every "Amiroon" in the app text and emails now says "My Buddy": invitations, password reset, meeting
    notes, install banner, reminders, Focus, admin, the invoice footer and the calendar feed name. The export
    file is now `my-buddy-export-….json`.
  - Kept on purpose: browser storage keys, cookies, the database role and the app link schemes.
- **New `GET/POST /api/mobile/teams`** (bearer token):
  - Gives the phone app the website's Teams features: list, create, invite (returns the link when email is
    off), cancel invitations, roles, remove, rename, leave, delete and accept an invitation link.
  - Also returns the team's projects and upcoming meetings.
  - Same rules as the website: creating and inviting need Premium and Work or Student mode. Accepting,
    renaming, roles, removing and cancelling invitations need Premium only. Leaving and deleting are always
    allowed.
- **Migration `0022_accept_invite_no_demote.sql`** (run `npm run db:migrate`): accepting an invitation never
  lowers a role. Before, an owner who opened an old "member" invitation became a member, which could leave a
  team without an owner. This affected the website too.
