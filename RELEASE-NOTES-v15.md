# My Buddy web v15

## Before you deploy

1. **Run the database migration** (adds `db/migrations/0015_planner_upgrades.sql`):
   ```
   MIGRATION_DATABASE_URL=<owner connection string> npm run db:migrate
   ```
   It only adds columns and tables; existing data is untouched.
2. **Check `BETTER_AUTH_URL`** is the live site address (for example `https://mybuddy.app`). Calendar links and links in emails use it.
3. **Optional, for emailing meeting notes:** set `RESEND_API_KEY` and `MAIL_FROM` (the same settings team invitations use). Without them the app says email is not set up.

## What's new

| # | Feature | Where |
|---|---------|-------|
| 1 | Reminders before meetings, timed to-dos, classes and note reminders (optional for routine activities) | Settings → Reminders |
| 2 | Repeating to-dos: daily, weekdays, weekly, monthly | To-Do → New task |
| 3 | Private calendar feed for Google / Apple / Outlook, with or without routines | Settings → Calendar sync |
| 4 | Week view with drag-and-drop for to-dos and meetings | Sidebar → Week |
| 5 | "Focus on this" from a to-do; ticks it off when the session ends | ⏱ button on To-Do and Today |
| 6 | Daily review from 6 PM and on past days; move unfinished tasks forward | Today |
| 7 | Habit streaks per routine activity | Today timeline (🔥) and Stats |
| 8 | Recurring bills, per-category budgets, bank CSV import | Spending |
| 9 | Action items to a teammate's to-do list; email meeting notes | Work → Meetings |
| 10 | Installable app with offline viewing | Browser "Install" / "Add to Home Screen" |

## Limits to know

- **Reminders** come from the browser while My Buddy is open (a tab, or the installed app). Closed apps get no reminders; that needs web push with a server, which is a later step. On iPhone, reminders need the app added to the Home Screen first (iOS 16.4+).
- **Offline** shows pages opened before going offline. Saving changes needs a connection.
- **Calendar apps** refresh subscribed calendars on their own schedule (Google can take several hours).
- **Bank CSV import** reads day-first dates (DD/MM/YYYY) as Indian and UK banks write them, and skips deposits and rows already imported.
- **Recurring bills** are posted when the person opens Today or Spending on or after the bill's day; a bill added after its day this month starts next month.
