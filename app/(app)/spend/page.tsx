import { PremiumGate } from '@/components/PremiumGate';
import Link from 'next/link';
import { addExpense, deleteExpense, setMonthlyBudget } from '@/app/actions';
import { withUser } from '@/lib/db';
import { personalWorkspaceId } from '@/lib/planner';
import { getCurrentUser } from '@/lib/session';
import { getSettings, money } from '@/lib/settings';
import { customTags, SPEND_CATEGORIES } from '@/lib/tags';
import { dateKeyIn, isDateKey, longDate, shiftDateKey } from '@/lib/time';

export const dynamic = 'force-dynamic';

async function SpendPageContent({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const user = await getCurrentUser();
  const { day: requested } = await searchParams;

  const data = await withUser(user!.id, async c => {
    const ws = await personalWorkspaceId(c, user!.id);
    const settings = await getSettings(c, user!.id);
    const today = dateKeyIn(settings.timezone);
    const day = isDateKey(requested) ? requested : today;
    const monthStart = `${day.slice(0, 8)}01`;
    const monthEnd = shiftDateKey(`${day.slice(0, 8)}01`, 31).slice(0, 8) + '01';

    const dayRows = await c.query<{ id: string; category: string; note: string; amount_minor: number }>(
      `select id, category, note, amount_minor from expenses
        where user_id = $1 and spent_on = $2 and deleted_at is null order by created_at`, [user!.id, day]);
    const monthRows = await c.query<{ category: string; total: number }>(
      `select category, sum(amount_minor)::int as total from expenses
        where user_id = $1 and spent_on >= $2 and spent_on < $3 and deleted_at is null group by category`,
      [user!.id, monthStart, monthEnd]);
    const custom = await customTags(c, user!.id, 'spend');
    return { day, today, settings, dayRows: dayRows.rows, monthRows: monthRows.rows, custom, ws };
  });

  const { day, today, settings } = data;
  const cur = settings.currency;
  const dayTotal = data.dayRows.reduce((s, r) => s + r.amount_minor, 0);
  const monthTotal = data.monthRows.reduce((s, r) => s + r.total, 0);
  const daysInMonth = new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0).getDate();
  const dayOfMonth = Number(day.slice(8, 10));
  const daysLeft = Math.max(1, daysInMonth - dayOfMonth + 1);
  const budget = settings.monthlyBudgetMinor;
  const left = budget === null ? null : budget - monthTotal;
  const categoryLabel = (id: string) => SPEND_CATEGORIES.find(c => c.id === id)?.label ?? id;
  const options = [...SPEND_CATEGORIES.map(c => ({ id: c.id, label: c.label })), ...data.custom.map(t => ({ id: t.name, label: `🏷️ ${t.name}` }))];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Spending</h1>
          <p>{day === today ? 'Today' : longDate(day)} · {new Date(`${day}T12:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</p>
        </div>
        <div className="actions">
          <Link className="btn" href={`/spend?day=${shiftDateKey(day, -1)}`}>‹ Previous</Link>
          <Link className="btn" href="/spend">Today</Link>
          <Link className="btn" href={`/spend?day=${shiftDateKey(day, 1)}`}>Next ›</Link>
        </div>
      </div>

      <div className="stats">
        <div className="card stat"><div className="label">Spent this day</div><div className="value num">{money(dayTotal, cur)}</div></div>
        <div className="card stat"><div className="label">Spent this month</div><div className="value num">{money(monthTotal, cur)}</div></div>
        <div className="card stat">
          <div className="label">Budget left</div>
          <div className="value num" style={{ color: left !== null && left < 0 ? 'var(--danger)' : undefined }}>
            {left === null ? '—' : money(left, cur)}
          </div>
          <div className="small muted">{left === null ? 'Set a monthly budget below' : left < 0 ? 'Over budget' : `About ${money(Math.floor(left / daysLeft), cur)} a day for ${daysLeft} days`}</div>
        </div>
        <div className="card stat"><div className="label">Expenses today</div><div className="value num">{data.dayRows.length}</div></div>
      </div>

      <div className="layout-2">
        <section className="card flush">
          <div className="card-head"><h2>Expenses</h2><span className="muted small">{data.dayRows.length} entries</span></div>
          {data.dayRows.length === 0 ? <div className="empty">Nothing recorded for this day.</div> : (
            <table className="table">
              <thead><tr><th>Category</th><th>Note</th><th style={{ textAlign: 'right' }}>Amount</th><th className="action-col" aria-label="Actions" /></tr></thead>
              <tbody>
                {data.dayRows.map(r => (
                  <tr key={r.id}>
                    <td><span className="badge">{categoryLabel(r.category)}</span></td>
                    <td>{r.note || <span className="muted">—</span>}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{money(r.amount_minor, cur)}</td>
                    <td className="action-col">
                      <form action={deleteExpense}>
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="btn ghost sm danger" aria-label="Delete expense">Delete</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <div className="stack">
          <section className="card card-body">
            <h2 style={{ marginBottom: 12 }}>Add an expense</h2>
            <form action={addExpense} className="stack" style={{ gap: 12 }}>
              <input type="hidden" name="day" value={day} />
              <label className="field">Amount ({cur})<input className="input" name="amount" inputMode="decimal" required placeholder="e.g. 250" /></label>
              <label className="field">Category
                <select className="select" name="category" defaultValue="food">
                  {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </label>
              <label className="field">New category (optional)<input className="input" name="newCategory" maxLength={20} placeholder="e.g. Gifts" /></label>
              <label className="field">Note (optional)<input className="input" name="note" maxLength={120} placeholder="e.g. Lunch with Priya" /></label>
              <button className="btn primary block" type="submit">Add expense</button>
            </form>
          </section>

          <section className="card card-body">
            <h2 style={{ marginBottom: 12 }}>Monthly budget</h2>
            <form action={setMonthlyBudget} className="stack" style={{ gap: 12 }}>
              <label className="field">Budget for the month ({cur})
                <input className="input" name="budget" inputMode="decimal" defaultValue={budget === null ? '' : String(budget / 100)} placeholder="Leave empty to remove" />
              </label>
              <button className="btn block" type="submit">Save budget</button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}

export default async function SpendPage(props: Parameters<typeof SpendPageContent>[0]) {
  return <PremiumGate feature="Spending"><SpendPageContent {...props} /></PremiumGate>;
}
