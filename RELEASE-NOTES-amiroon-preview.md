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
