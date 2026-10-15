import { withUser } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminOverview() {
  const user = await getCurrentUser();
  const o = await withUser(user!.id, async c => (await c.query<{ o: Record<string, number> }>(`select admin_overview() as o`)).rows[0].o);
  const cards: [string, number, string][] = [
    ['Accounts', o.users, 'Everyone who has signed up'],
    ['Set up', o.onboarded, 'Have saved their settings (onboarded)'],
    ['Premium', o.premium, 'Active premium plans'],
    ['New this week', o.joinedLast7Days, 'Signed up in the last 7 days'],
    ['Active this week', o.activeLast7Days, 'Changed tasks or notes in the last 7 days'],
    ['Teams', o.teams, 'Organisations created'],
  ];
  return (
    <>
      <div className="page-head"><div><h1>Overview</h1><p>Summary for support. Personal content is never shown here.</p></div></div>
      <div className="stats">
        {cards.map(([label, value, note]) => (
          <div key={label} className="card stat"><div className="label">{label}</div><div className="value num">{value}</div><div className="small muted">{note}</div></div>
        ))}
      </div>
    </>
  );
}
