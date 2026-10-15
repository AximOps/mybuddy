import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminAddNote, adminDeleteUser, adminGrantTrial, adminSetPlan, adminSetSuspended } from '@/app/admin/actions';
import { withUser } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { isUuid } from '@/lib/time';

export const dynamic = 'force-dynamic';

type Detail = {
  user: { id: string; name: string; email: string; emailVerified: boolean; joinedAt: string } | null;
  settings: { plan?: string; planUntil?: string | null; mode?: string; timezone?: string; currency?: string; studentEnabled?: boolean; suspendedAt?: string | null; suspendedReason?: string; trialStartedAt?: string | null; trialUsed?: boolean };
  isAdmin: boolean;
  createsTeam: boolean;
  signInMethods: string[];
  organisations: { name: string; role: string }[];
  audit: { created_at: string; action: string; details: string; by_email: string | null }[];
};

export default async function AdminUserPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const me = await getCurrentUser();
  const { id } = await params;
  const { error } = await searchParams;
  if (!isUuid(id) && !/^[A-Za-z0-9_-]{8,64}$/.test(id)) notFound();
  const d = await withUser(me!.id, async c => (await c.query<{ d: Detail }>(`select admin_user_detail($1) as d`, [id])).rows[0].d);
  if (!d.user) notFound();
  const settings = d.settings ?? {};
  const plan = settings.plan ?? 'free';
  const suspended = !!settings.suspendedAt;
  const trialActive = !!settings.trialStartedAt && plan === 'premium' && !!settings.planUntil;
  const until = settings.planUntil ? settings.planUntil.slice(0, 10) : '';

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/admin/users" className="small muted">‹ All users</Link>
          <h1 style={{ marginTop: 6 }}>{d.user.name || 'No name'}</h1>
          <p>{d.user.email}</p>
        </div>
        <div className="actions">
          {suspended ? <span className="badge danger">Suspended</span> : trialActive ? <span className="badge accent">Trial</span> : null}
          <span className={`badge ${plan === 'premium' ? 'accent' : ''}`}>{plan === 'premium' ? 'Premium' : 'Free'}</span>
        </div>
      </div>

      {error ? <section className="card card-body" style={{ marginBottom: 16, borderColor: 'var(--danger)' }}><strong>{error}</strong></section> : null}
      {suspended ? (
        <section className="card card-body" style={{ marginBottom: 16, borderColor: 'var(--danger)' }}>
          <strong>Suspended on {settings.suspendedAt!.slice(0, 10)}.</strong> <span className="small muted">Reason: {settings.suspendedReason || '—'}. They are signed out and cannot sign in.</span>
        </section>
      ) : null}

      <div className="layout-2">
        <div className="stack">
          <section className="card card-body">
            <h2 style={{ marginBottom: 10 }}>Account</h2>
            <dl className="admin-dl">
              <dt>Joined</dt><dd>{d.user.joinedAt.slice(0, 10)}</dd>
              <dt>Email verified</dt><dd>{d.user.emailVerified ? 'Yes' : 'No'}</dd>
              <dt>Sign-in methods</dt><dd>{d.signInMethods.map(m => m === 'credential' ? 'Email and password' : m).join(', ') || '—'}</dd>
              <dt>Mode</dt><dd>{settings.mode ?? 'personal'}</dd>
              <dt>Time zone</dt><dd>{settings.timezone ?? 'default'}</dd>
              <dt>Currency</dt><dd>{settings.currency ?? 'INR'}</dd>
              <dt>Teams</dt><dd>{d.organisations.map(o => `${o.name} (${o.role})`).join(', ') || 'None'}</dd>
              <dt>Free trial</dt><dd>{settings.trialUsed ? (trialActive ? `Active until ${settings.planUntil!.slice(0, 10)}` : 'Used') : 'Not used yet'}</dd>
              <dt>Admin</dt><dd>{d.isAdmin ? 'Yes' : 'No'}</dd>
            </dl>
            <p className="small muted" style={{ marginTop: 12 }}>Personal content (tasks, notes, spending, time entries) is not shown to admins.</p>
          </section>

          <section className="card flush">
            <div className="card-head"><h2>Audit log</h2><span className="muted small">Latest 50</span></div>
            {d.audit.length === 0 ? <div className="empty">No admin actions yet.</div> : (
              <table className="table">
                <thead><tr><th>When</th><th>Action</th><th>Details</th><th>By</th></tr></thead>
                <tbody>
                  {d.audit.map((a, i) => (
                    <tr key={i}>
                      <td className="small">{a.created_at.slice(0, 16).replace('T', ' ')}</td>
                      <td><span className="badge">{a.action}</span></td>
                      <td className="small">{a.details}</td>
                      <td className="small">{a.by_email ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="card card-body">
            <h2 style={{ marginBottom: 12 }}>Plan</h2>
            <form action={adminSetPlan} className="stack" style={{ gap: 12 }}>
              <input type="hidden" name="target" value={d.user.id} />
              <label className="field">Plan
                <select className="select" name="plan" defaultValue={plan}><option value="free">Free</option><option value="premium">Premium</option></select>
              </label>
              <label className="field">Premium until (leave empty for no end date)
                <input className="input" type="date" name="until" defaultValue={until} />
              </label>
              <label className="field">Reason (saved in the audit log)
                <input className="input" name="note" maxLength={300} required placeholder="e.g. Refund approved, ticket 123" />
              </label>
              <button className="btn primary block" type="submit">Save plan</button>
            </form>
          </section>

          <section className="card card-body">
            <h2 style={{ marginBottom: 12 }}>Free trial</h2>
            <form action={adminGrantTrial} className="stack" style={{ gap: 12 }}>
              <input type="hidden" name="target" value={d.user.id} />
              <label className="field">Days<input className="input" type="number" name="days" min={1} max={90} defaultValue={15} required /></label>
              <label className="field">Reason<input className="input" name="note" required maxLength={300} placeholder="e.g. Apology for a failed payment" /></label>
              <button className="btn block" type="submit">Grant trial</button>
            </form>
          </section>

          <section className="card card-body">
            <h2 style={{ marginBottom: 12 }}>{suspended ? 'Reactivate account' : 'Suspend account'}</h2>
            <p className="small muted" style={{ marginBottom: 12 }}>{suspended ? 'The person can sign in again.' : 'Signs the person out everywhere and blocks new sign-ins. Their data is kept.'}</p>
            <form action={adminSetSuspended} className="stack" style={{ gap: 12 }}>
              <input type="hidden" name="target" value={d.user.id} />
              <input type="hidden" name="suspend" value={suspended ? 'false' : 'true'} />
              <label className="field">Reason<input className="input" name="reason" required maxLength={300} /></label>
              <button className={`btn block ${suspended ? '' : 'danger'}`} type="submit">{suspended ? 'Reactivate' : 'Suspend'}</button>
            </form>
          </section>

          <section className="card card-body" style={{ borderColor: 'var(--danger)' }}>
            <h2 style={{ marginBottom: 8, color: 'var(--danger)' }}>Delete account</h2>
            <p className="small muted" style={{ marginBottom: 12 }}>Permanently deletes the account and all of its tasks, notes, spending, time and focus history. This cannot be undone. The audit log keeps a record of the deletion.</p>
            {d.createsTeam ? <p className="small" style={{ color: 'var(--danger)', marginBottom: 12 }}>This person created a team. Hand it over or delete it first.</p> : null}
            <form action={adminDeleteUser} className="stack" style={{ gap: 12 }}>
              <input type="hidden" name="target" value={d.user.id} />
              <label className="field">Type the account email to confirm<input className="input" name="confirmEmail" required autoComplete="off" placeholder={d.user.email} /></label>
              <label className="field">Reason<input className="input" name="reason" required maxLength={300} /></label>
              <button className="btn danger block" type="submit" disabled={d.createsTeam || d.isAdmin}>Delete account permanently</button>
            </form>
          </section>

          <section className="card card-body">
            <h2 style={{ marginBottom: 12 }}>Add a support note</h2>
            <form action={adminAddNote} className="stack" style={{ gap: 12 }}>
              <input type="hidden" name="target" value={d.user.id} />
              <label className="field">Note<textarea name="note" rows={3} required maxLength={1000} /></label>
              <button className="btn block" type="submit">Save note</button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
