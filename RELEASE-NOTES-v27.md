# My Buddy web v27: Google Meet and meeting invites

## Before you deploy
- **Run the database migration:** `npm run db:migrate` (owner connection). It adds
  `db/migrations/0020_meeting_links.sql`. If v26 is not deployed yet, this also applies `0019_teams.sql`.
- Invites are sent through Resend, like the other emails. `RESEND_API_KEY` and `MAIL_FROM` must be set in Vercel.
  Without them, the page says email is not set up.

## What changed
### Google Meet link on meetings
- New and existing meetings have a **Google Meet link** field (Work → Meetings).
- **Create a Google Meet** opens `meet.google.com/new` in a new tab, where Google makes a meeting room for the
  person's Google account. They copy the link and paste it in.
- A full link, a link without `https://`, or a bare code such as `abc-defg-hij` is accepted and cleaned up.
  Zoom and Microsoft Teams links work too and are labelled as such.
- A meeting with a link shows a **Join Google Meet** button, and a camera icon in the meetings list.
- A link that is not usable is not saved, the previous link stays, and the page says why.

### Send invite
- A new **Send invite** box emails a calendar invite to the addresses given. It is pre-filled from the emails in
  Attendees and teammates named there.
- The email has the title, date and time (with time zone), the **join link** and the agenda, plus an attached
  `invite.ics` calendar invite. Gmail, Google Calendar, Outlook and Apple Mail show it as an invitation.
  Google Calendar shows its **Join with Google Meet** button.
- Replies go to the person who sent the invite (`reply_to`). They can tick **Send me a copy**.
- **Send updated invite** after changing the time or link. Each send raises the invite's sequence number, so
  calendars update the existing event instead of adding a second one.
- The page shows when the invite was last sent, and after saving a change it reminds you to send it again.

### Also
- **Email the notes** includes the call link.
- The private calendar feed puts the call link in the meeting's location and description.
- Fixed: semicolons in calendar-feed text were not escaped.

## Files
- New: `db/migrations/0020_meeting_links.sql`, `lib/meeting-link.ts`, `lib/meeting-invite.ts`.
- Changed: `app/actions.ts` (`addMeeting`, `updateMeeting`, new `sendMeetingInvite`, `emailMeetingNotes`),
  `app/(app)/work/page.tsx`, `lib/mail.ts` (optional reply-to and attachments), `lib/ical.ts`,
  `app/api/calendar/[token]/route.ts`, `app/globals.css`.

## Not included: automatic Meet links
Creating the Meet link automatically, with no copy and paste, needs the Google Calendar API. Each person would
connect their Google account with calendar access, and Google requires app verification for that permission.
The current flow works with no Google setup. Automatic links can be added later.

## How to check
1. Work → Meetings → New meeting. Press Create a Google Meet, paste the link, add attendee emails and create.
2. Press Join Google Meet. The call opens.
3. Press Send invite to your own second address. Check that the email has the link and that the invite adds to
   your calendar with a Join button.
4. Change the time, save and press Send updated invite. The calendar event moves instead of being duplicated.

## Fix (v27.1): icon picker scrolling
- The icon picker under **Add an activity** (Today and Routines) closed as soon as you tried to scroll the icons,
  with a mouse wheel and on phones. It closed on any scroll event, and that included scrolling inside the picker.
- Now scrolling inside the picker scrolls the icons. Scrolling the page moves the picker with its button, and it
  closes only when the button leaves the screen.
- On phones, opening the keyboard for **Or type your own** no longer closes the picker.
- The picker fits the space above or below its button, stops above the phone's bottom nav bar, and scrolling it
  does not scroll the page behind it.
- Changed: `components/IconPicker.tsx`, `app/globals.css`. No migration.
