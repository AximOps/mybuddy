/**
 * Plans and what they include. While PREMIUM_ENABLED is false every feature is free, the same
 * switch the phone app uses. Turn it on when payments are connected.
 */
export const PREMIUM_ENABLED = true;
export const PRICE = '$10';
export const PERIOD = 'per year';

export interface Feature { icon: string; title: string; detail: string }

export const FREE_FEATURES: Feature[] = [
  { icon: '📅', title: 'Daily routines', detail: 'Plan each weekday with activities, check them off, and see your progress.' },
  { icon: '✅', title: 'To-Do and notes', detail: 'Tasks with due dates and tags. Notes with checklists, pinning and search.' },
  { icon: '📊', title: 'Stats', detail: 'Your streak and weekly routine completion at a glance.' },
];

export const PREMIUM_FEATURES: Feature[] = [
  { icon: '⏱️', title: 'Focus timer', detail: 'Timed focus sessions that keep running after a refresh, tracked in Stats.' },
  { icon: '💸', title: 'Spending and budgets', detail: 'Log expenses, set a monthly budget and see your daily allowance.' },
  { icon: '🎓', title: 'Student planner', detail: 'Timetable, assignments and exams, subjects, marks and GPA.' },
  { icon: '💼', title: 'Work and timesheets', detail: 'Timer, projects with rates, meetings, hour reports and invoices (PDF and CSV).' },
  { icon: '👥', title: 'Teams', detail: 'Invite your team, submit weekly timesheets and approve them.' },
];
