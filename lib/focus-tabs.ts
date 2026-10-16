/** Focus page tabs. Kept outside the client components so the server page can read the list. */
export const FOCUS_TAB_IDS = ['timer', 'breaks', 'alarm', 'stopwatch', 'reminders'] as const;
export type FocusTab = (typeof FOCUS_TAB_IDS)[number];
export const isFocusTab = (v: unknown): v is FocusTab => typeof v === 'string' && (FOCUS_TAB_IDS as readonly string[]).includes(v);
