# Amiroon preview (based on v27.1)

A copy of v27.1 with the app renamed from **My Buddy** to **Amiroon**, tagline **Life Organized!**.
Everything else is the same. No database migration beyond v27.1.

## What changed
- **Wordmark:** "Ami**roon**" in the same two-colour style (blue in the app, yellow on the login screen).
  It has the same logo icon and the tagline "Life Organized!".
- **Browser tab, installed app name and home-screen label:** "Amiroon". The full app name is
  "Amiroon · Life Organized!".
- **Login and signup headline:** "Life, organized." replaces "Plan your day, buddy.", which only worked with the old name.
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
