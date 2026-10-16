# My Buddy web v25: focus tools

## Before you deploy
- **No database migration** is needed. Quick reminders are saved as notes with a reminder time.
- Redeploy on Vercel as usual.

## What changed
The Focus page now has five tabs: **Timer**, **Breaks**, **Alarm**, **Stopwatch** and **Reminders**.
A link can open a tab directly, for example `/focus?tab=alarm`. A green dot on a tab means that tool is on.

### Focus timer animation
- The timer dial now matches the mobile app: a white face, a soft lavender track, a blue arc for the time
  done so far (from 12 o'clock, clockwise), and a ripple that spreads out from the edge and fades about
  every 2.4 seconds while the timer runs.
- The same dial is used on the Focus page and in the floating timer on other pages. It turns green on a
  break and grey when paused. The ripple stops for people who turn on reduced motion.

### Breaks (regular break reminders)
- Turn on reminders to step away every 20, 30, 45, 60 or 90 minutes, or a **custom** interval (5–240 min).
- Break length: 2, 5, 10, 15 minutes or custom. **Take a break now** starts one straight away.
- When a break is due, a pop-up offers **Start break**, **In 5 minutes** or **Skip this one**. A
  "Break over" pop-up follows when the break ends.
- Options: hold reminders while a focus timer or Pomodoro runs (on by default), only between set hours,
  and the sound.

### Alarm
- Set alarms with a time, a label, repeat days (once, weekdays, every day or any days), a sound and a
  snooze length. Each alarm has an on/off switch, edit and delete.
- An alarm rings for up to a minute with **Stop alarm** and **Snooze**. A one-time alarm turns itself off
  after it rings. If it was missed because My Buddy was closed, it turns off and does not ring the next day.
- A one-time alarm set for a time already past today rings tomorrow, as on a phone.

### Stopwatch
- Start, pause, lap and reset, with lap times and the fastest and slowest lap marked (up to 99 laps).
- Keeps running across pages and refreshes.
- **Log N min as a focus session** saves the time to Stats once the stopwatch is paused.

### Reminders
- Add a quick reminder: "in 5 min / 15 min / 30 min / 1 hour / 2 hours", or pick a date and time.
- Reminders are notes with a reminder time. They show on Today, in Notes, in the calendar feed and in the
  mobile app.
- **Ring in the app at the reminder time** (on by default) shows a pop-up and plays a sound for every timed
  reminder, on any page. It also tells the Settings reminders not to send the same notification again.
- Removing a quick reminder deletes it. Removing a reminder from a note you wrote in Notes only clears its
  time, and the note stays.

## How it works
- Breaks, alarms and the stopwatch are saved in this browser, so each device keeps its own. Open tabs stay
  in step, and only one tab rings for each event.
- Like the existing Settings reminders, they ring while My Buddy is open in a tab or as the installed app.
  When the tab is in the background and notifications are allowed, a system notification is sent too.
- Browsers play sound only after the person has tapped or typed on the page once. The app unlocks sound
  on the first tap.

## Files
- New: `components/focus/FocusDial.tsx`, `FocusTools.tsx`, `ToolsProvider.tsx`, `ToolAlert.tsx`, `sound.ts`.
- Changed: `app/(app)/focus/page.tsx`, `app/(app)/layout.tsx` (mounts the tools engine and pop-up),
  `components/FocusTimer.tsx`, `components/focus/FocusBall.tsx`, `components/focus/FocusProvider.tsx`,
  `app/actions.ts` (`addQuickReminder`, `removeReminder`; `recordFocusSession` now returns true or false),
  `app/globals.css`.

## How to check
1. Focus → Timer: start a 5-minute focus. Watch the ripple, then switch to Today and check the floating timer.
2. Focus → Breaks: turn on, choose Custom 5 min, wait for the pop-up, then press Start break.
3. Focus → Alarm: set a one-time alarm two minutes ahead and check that it rings, snoozes and stops.
4. Focus → Stopwatch: run it for a minute, add laps, pause, then log it and check Stats.
5. Focus → Reminders: add "in 5 min" and check that it appears on Today and rings at the time.
