'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { withUser } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { isUuid } from '@/lib/time';

async function requireAdminUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/** Changes a plan. The database refuses anyone who is not a platform admin, and writes the audit entry. */
export async function adminSetPlan(formData: FormData) {
  const me = await requireAdminUser();
  const target = String(formData.get('target') ?? '');
  const plan = String(formData.get('plan') ?? '');
  const until = String(formData.get('until') ?? '');
  const note = String(formData.get('note') ?? '').trim().slice(0, 300);
  if (!isUuid(target) && !/^[A-Za-z0-9_-]{8,64}$/.test(target)) return;
  if (!note || !['free', 'premium'].includes(plan)) return;
  const untilIso = plan === 'premium' && /^\d{4}-\d{2}-\d{2}$/.test(until) ? `${until}T23:59:59Z` : null;
  await withUser(me.id, async c => {
    await c.query(`select admin_set_plan($1, $2, $3, $4)`, [target, plan, untilIso, note]);
  });
  revalidatePath(`/admin/users/${target}`);
  revalidatePath('/admin/users');
  redirect(`/admin/users/${target}`);
}

export async function adminAddNote(formData: FormData) {
  const me = await requireAdminUser();
  const target = String(formData.get('target') ?? '');
  const note = String(formData.get('note') ?? '').trim().slice(0, 1000);
  if (!note || !/^[A-Za-z0-9_-]{8,64}$/.test(target)) return;
  await withUser(me.id, async c => {
    await c.query(`select admin_add_note($1, $2)`, [target, note]);
  });
  revalidatePath(`/admin/users/${target}`);
  redirect(`/admin/users/${target}`);
}

const ID = /^[A-Za-z0-9_-]{8,64}$/;

export async function adminGrantTrial(formData: FormData) {
  const me = await requireAdminUser();
  const target = String(formData.get('target') ?? '');
  const days = Number(formData.get('days') ?? 15);
  const note = String(formData.get('note') ?? '').trim().slice(0, 300);
  if (!ID.test(target) || !Number.isInteger(days) || !note) return;
  await withUser(me.id, async c => { await c.query(`select admin_grant_trial($1, $2, $3)`, [target, days, note]); });
  revalidatePath(`/admin/users/${target}`);
  redirect(`/admin/users/${target}`);
}

export async function adminSetSuspended(formData: FormData) {
  const me = await requireAdminUser();
  const target = String(formData.get('target') ?? '');
  const suspend = formData.get('suspend') === 'true';
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 300);
  if (!ID.test(target) || !reason) return;
  await withUser(me.id, async c => { await c.query(`select admin_set_suspended($1, $2, $3)`, [target, suspend, reason]); });
  revalidatePath(`/admin/users/${target}`);
  revalidatePath('/admin/users');
  redirect(`/admin/users/${target}`);
}

/** Deletes an account. The admin must type the account's email to confirm. */
export async function adminDeleteUser(formData: FormData) {
  const me = await requireAdminUser();
  const target = String(formData.get('target') ?? '');
  const confirmEmail = String(formData.get('confirmEmail') ?? '').trim().toLowerCase();
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 300);
  if (!ID.test(target) || !reason) redirect(`/admin/users/${target}?error=${encodeURIComponent('Give a reason to delete the account.')}`);
  const email = await withUser(me.id, async c => (await c.query<{ email: string }>(`select email from "user" where id = $1`, [target])).rows[0]?.email ?? '');
  if (confirmEmail !== email.toLowerCase()) redirect(`/admin/users/${target}?error=${encodeURIComponent('The email did not match. Nothing was deleted.')}`);
  try {
    await withUser(me.id, async c => { await c.query(`select admin_delete_user($1, $2)`, [target, reason]); });
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/^error: /i, '') : 'The account could not be deleted.';
    redirect(`/admin/users/${target}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/admin/users');
  redirect('/admin/users?deleted=1');
}
