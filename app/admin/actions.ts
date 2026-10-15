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
