# My Buddy web v16

## Before you deploy

Run the migrations (adds `0016_onboarding_trial_daychecks.sql` and `0017_admin_phone.sql`):
```
MIGRATION_DATABASE_URL=<owner connection string> npm run db:migrate
```
Existing accounts are marked as onboarded, so nobody already signed up is sent to the welcome step.
They can add a mobile number from Settings → Profile.

## What's new

- **Floating focus timer.** While a focus or Pomodoro session runs, a small round timer with time left
  follows you on every page (tap to open, button to pause). Finished sessions save from any page.
- **Pomodoro.** Rounds of focus with breaks. Focus 5/15/30/45/60/90/120 min or custom (1–480),
  breaks 5/10/15/30 or custom, 2/3/4/6 rounds or custom. Plain focus has the same presets plus custom.
  Each finished round is saved as a focus session. Sound and notification at each change.
- **Done ticks on Today for everything.** To-dos, routine, deadlines (as before) plus meetings, classes,
  note reminders and pinned notes. These new ticks are per day (stored in `day_checks`).
- **Trial on sign-up.** New accounts get 15 days of Premium after the welcome step, then move to Free
  automatically. A reminder banner shows from day 10 (5 days left), daily until it ends, and for a week after.
  The sidebar shows days left and a Subscribe button.
- **Welcome step after first sign-in.** Mobile number (required) and mode: Personal, Work or Student.
  Student tools are switched on only for Student. Google/Apple sign-ins get the same step.
- **One trial per mobile number.** A number can belong to one account, and a number that already had a
  trial never gets another, even if the first account is deleted (`trial_claims`).

## Know before launch

- Mobile numbers are **not verified by SMS** yet. Someone could type a made-up number to get a second
  trial. To close that, add OTP verification (for example MSG91 or Twilio Verify) in the welcome step.
- Admins can see the mobile number on the user page in the admin console.
