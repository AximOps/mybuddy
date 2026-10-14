import type { PoolClient } from 'pg';
import { APP_TZ } from './time';

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const;
export type Theme = 'system' | 'light' | 'dark';
export type Mode = 'student' | 'personal' | 'work';

export interface UserSettings {
  timezone: string; currency: string; monthlyBudgetMinor: number | null;
  theme: Theme; mode: Mode; studentEnabled: boolean; studentLevel: 'school' | 'college'; plan: 'free' | 'premium';
}

const DEFAULTS: UserSettings = {
  timezone: APP_TZ, currency: 'INR', monthlyBudgetMinor: null,
  theme: 'system', mode: 'personal', studentEnabled: true, studentLevel: 'college', plan: 'free',
};

/** A person's settings, with defaults for anything not chosen yet (or not migrated yet). */
export async function getSettings(c: PoolClient, userId: string): Promise<UserSettings> {
  try {
    const { rows } = await c.query<{
      timezone: string; currency: string; monthly_budget_minor: number | null; theme: Theme; mode: Mode;
      student_enabled: boolean; student_level: 'school' | 'college'; plan: 'free' | 'premium';
    }>(
      `select timezone, currency, monthly_budget_minor, theme, mode, student_enabled, student_level, plan
         from user_settings where user_id = $1`, [userId]);
    const r = rows[0];
    if (!r) return DEFAULTS;
    return {
      timezone: r.timezone, currency: r.currency, monthlyBudgetMinor: r.monthly_budget_minor,
      theme: r.theme, mode: r.mode, studentEnabled: r.student_enabled, studentLevel: r.student_level, plan: r.plan,
    };
  } catch {
    return DEFAULTS;
  }
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz.length <= 60;
  } catch {
    return false;
  }
}

/** Formats minor units (paise, cents) for display, e.g. 123456 INR -> ₹1,234.56. */
export function money(minor: number, currency: string): string {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency }).format(minor / 100);
}
