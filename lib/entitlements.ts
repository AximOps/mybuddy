import type { PoolClient } from 'pg';
import { PREMIUM_ENABLED } from './plans';
import { getSettings } from './settings';

/**
 * Premium access. Paid premium and an active free trial both count (the plan is already
 * "premium" while a trial runs, and expired plans read as free in getSettings).
 */
export function isPremium(settings: { plan: string }): boolean {
  return !PREMIUM_ENABLED || settings.plan === 'premium';
}

export async function userHasPremium(c: PoolClient, userId: string): Promise<boolean> {
  return isPremium(await getSettings(c, userId));
}

/** Premium features Free users cannot use. Kept in one place for the sidebar and the server checks. */
export const PREMIUM_AREAS = ['Focus', 'Spending', 'Student', 'Work', 'Team'] as const;
