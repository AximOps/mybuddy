import Link from 'next/link';
import { Activity, Building2, Crown, Search, UserPlus, Users } from 'lucide-react';
import { withUser } from '@/lib/db';
import { initials } from '@/lib/initials';
import { getCurrentUser } from '@/lib/session';
import { dateKeyIn } from '@/lib/time';

export const dynamic = 'force-dynamic';

type Recent = { user_id: string; user_name: string; user_email: string; joined_at: Date; plan: string; suspended: boolean; trial: boolean };

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

export default async function AdminOverview() {
  const user = await getCurrentUser();
  const { o, recent } = await withUser(user!.id, async c => ({
    o: (await c.query<{ o: Record<string, number> }>(`select admin_overview() as o`)).rows[0].o,
    recent: (await c.query<Recent>(`select * from admin_list_users($1, $2, $3, $4)`, ['', '', 6, 0])).rows,
  }));
  const users = o.users ?? 0;
  const free = Math.max(0, users - (o.premium ?? 0));

  const kpis = [
    { label: 'Accounts', value: users, sub: <><strong>{o.joinedLast7Days}</strong> joined this week</>, icon: Users, tone: '', href: '/admin/users' },
    { label: 'Premium', value: o.premium, sub: <><strong>{pct(o.premium, users)}%</strong> of all accounts</>, icon: Crown, tone: 'sun', href: '/admin/users?plan=premium' },
    { label: 'Active this week', value: o.activeLast7Days, sub: <>Changed tasks or notes in 7 days</>, icon: Activity, tone: 'green', href: '/admin/users' },
    { label: 'Teams', value: o.teams, sub: <>Organisations created</>, icon: Building2, tone: 'violet', href: '/admin/teams' },
  ];

  const funnel = [
    { label: 'Signed up', value: users },
    { label: 'Set up their settings', value: o.onboarded },
    { label: 'Active this week', value: o.activeLast7Days },
    { label: 'On Premium', value: o.premium },
  ];

  return (
    <>
      <div className="page-head">
        <div><h1>Overview</h1><p>How My Buddy is doing today. Counts only, personal content is never shown.</p></div>
        <Link className="btn" href="/admin/users"><Search size={16} aria-hidden="true" /> Find a user</Link>
      </div>

      <div className="kpis">
        {kpis.map(k => {
          const Icon = k.icon;
          return (
            <Link key={k.label} href={k.href} className="card kpi stat-link" aria-label={`${k.label}: ${k.value}. Open`}>
              <div className="kpi-top">{k.label}<span className={`kpi-icon ${k.tone}`}><Icon size={17} strokeWidth={2} aria-hidden="true" /></span></div>
              <div className="value num">{k.value ?? 0}</div>
              <div className="sub">{k.sub}</div>
            </Link>
          );
        })}
      </div>

      <div className="admin-grid">
        <section className="card flush">
          <div className="card-head"><h2>Newest accounts</h2><Link href="/admin/users">View all</Link></div>
          {recent.length === 0 ? <div className="empty">No accounts yet.</div> : (
            <table className="table">
              <thead><tr><th>Account</th><th>Joined</th><th>Plan</th><th className="action-col" aria-label="Open" /></tr></thead>
              <tbody>
                {recent.map(r => (
                  <tr key={r.user_id}>
                    <td>
                      <Link href={`/admin/users/${r.user_id}`} className="user-cell">
                        <span className="avatar" aria-hidden="true">{initials(r.user_name, r.user_email)}</span>
                        <span><strong>{r.user_name || 'No name'}</strong><span className="small muted">{r.user_email}</span></span>
                      </Link>
                    </td>
                    <td className="small num">{dateKeyIn('Asia/Kolkata', new Date(r.joined_at))}</td>
                    <td>
                      {r.suspended ? <span className="badge danger">Suspended</span>
                        : r.trial ? <span className="badge warn">Trial</span>
                        : <span className={`badge ${r.plan === 'premium' ? 'sun' : ''}`}>{r.plan === 'premium' ? 'Premium' : 'Free'}</span>}
                    </td>
                    <td className="action-col"><Link className="btn sm" href={`/admin/users/${r.user_id}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <div className="stack">
          <section className="card card-body">
            <h2 style={{ marginBottom: 16 }}>From sign-up to Premium</h2>
            <div className="funnel">
              {funnel.map(f => (
                <div key={f.label} className="funnel-row">
                  <span>{f.label}</span>
                  <span className="track" aria-hidden="true"><span style={{ width: `${Math.max(pct(f.value, users), f.value ? 2 : 0)}%` }} /></span>
                  <span className="pct">{f.value ?? 0}<small>{pct(f.value, users)}%</small></span>
                </div>
              ))}
            </div>
          </section>

          <section className="card card-body">
            <h2>Plan mix</h2>
            <div className="mix" role="img" aria-label={`${o.premium} premium and ${free} free accounts`}>
              <span style={{ width: `${pct(o.premium, users)}%` }} /><span style={{ flex: 1 }} />
            </div>
            <div className="legend">
              <span><i style={{ background: 'var(--sun)' }} />Premium {o.premium}</span>
              <span><i style={{ background: 'var(--accent)', opacity: 0.25 }} />Free {free}</span>
              <span className="muted"><UserPlus size={13} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />{o.joinedLast7Days} new this week</span>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
