import type { PoolClient } from 'pg';
import { APP_TZ } from './time';

export interface UserSettings { timezone: string; currency: string }

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const;

/** A person's settings, with defaults when they have not chosen anything yet. */
export async function getSettings(c: PoolClient, userId: string): Promise<UserSettings> {
  const { rows } = await c.query<{ timezone: string; currency: string }>(
    `select timezone, currency from user_settings where user_id = $1`, [userId]);
  return rows[0] ?? { timezone: APP_TZ, currency: 'INR' };
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz.length <= 60;
  } catch {
    return false;
  }
}
