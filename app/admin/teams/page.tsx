import { withUser } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { dateKeyIn } from '@/lib/time';

export const dynamic = 'force-dynamic';

export default async function AdminTeams() {
  const user = await getCurrentUser();
  const teams = await withUser(user!.id, async c =>
    (await c.query<{ team_id: string; team_name: string; created_at: Date; members: number; owner_email: string | null }>(
      `select * from admin_list_teams()`)).rows);
  const members = teams.reduce((s, t) => s + Number(t.members), 0);
  return (
    <>
      <div className="page-head">
        <div><h1>Teams</h1><p>Organisations on Amiroon. Team content is never shown here.</p></div>
        {teams.length ? <span className="badge accent">{teams.length} teams · {members} members</span> : null}
      </div>
      <section className="card flush">
        {teams.length === 0 ? <div className="empty">No teams yet. Teams appear here when a Premium user creates one.</div> : (
          <table className="table">
            <thead><tr><th>Team</th><th>Created by</th><th>Created</th><th className="num">Members</th></tr></thead>
            <tbody>
              {teams.map(t => (
                <tr key={t.team_id}>
                  <td><span className="team-cell"><span className="team-mark" aria-hidden="true">{t.team_name.trim()[0]?.toUpperCase() ?? '?'}</span><strong>{t.team_name}</strong></span></td>
                  <td className="small">{t.owner_email ?? '—'}</td>
                  <td className="small num">{dateKeyIn('Asia/Kolkata', new Date(t.created_at))}</td>
                  <td className="num"><span className="badge">{t.members}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
