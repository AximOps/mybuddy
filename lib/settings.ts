import type { PoolClient } from 'pg';
import { APP_TZ } from './time';

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const;
export type Theme = 'system' | 'light' | 'dark';
export type Mode = 'student' | 'personal' | 'work';

export interface UserSettings {
  timezone: string; currency: string; monthlyBudgetMinor: number | null;
  theme: Theme; mode: Mode; studentEnabled: boolean; studentLevel: 'school' | 'college'; plan: 'free' | 'premium';
  planUntil: string | null; trialUsed: boolean; trialActive: boolean;
  /** False until the welcome step (mobile number and mode) is done. */
  onboarded: boolean; phone: string | null;
}

const DEFAULTS: UserSettings = {
  timezone: APP_TZ, currency: 'INR', monthlyBudgetMinor: null,
  theme: 'system', mode: 'personal', studentEnabled: true, studentLevel: 'college', plan: 'free',
  planUntil: null, trialUsed: false, trialActive: false, onboarded: true, phone: null,
};

/** A person's settings, with defaults for anything not chosen yet (or not migrated yet). */
export async function getSettings(c: PoolClient, userId: string): Promise<UserSettings> {
  try {
    const { rows } = await c.query<{
      timezone: string; currency: string; monthly_budget_minor: number | null; theme: Theme; mode: Mode;
      student_enabled: boolean; student_level: 'school' | 'college'; plan: 'free' | 'premium';
      plan_until: Date | null; trial_used: boolean; trial_active: boolean; onboarded: boolean; phone: string | null;
    }>(
      `select timezone, currency, monthly_budget_minor, theme, mode, student_enabled, student_level,
              case when plan = 'premium' and (plan_until is null or plan_until > now()) then 'premium' else 'free' end as plan,
              plan_until, trial_used,
              (trial_started_at is not null and plan = 'premium' and plan_until > now()) as trial_active,
              onboarded_at is not null as onboarded, phone
         from user_settings where user_id = $1`, [userId]);
    const r = rows[0];
    if (!r) return { ...DEFAULTS, onboarded: false };
    return {
      timezone: r.timezone, currency: r.currency, monthlyBudgetMinor: r.monthly_budget_minor,
      theme: r.theme, mode: r.mode, studentEnabled: r.student_enabled, studentLevel: r.student_level, plan: r.plan,
      planUntil: r.plan_until ? r.plan_until.toISOString() : null, trialUsed: r.trial_used, trialActive: r.trial_active,
      onboarded: r.onboarded, phone: r.phone,
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
