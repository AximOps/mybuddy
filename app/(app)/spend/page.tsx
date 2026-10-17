import { PremiumGate } from '@/components/PremiumGate';
import { AddDialog } from '@/components/AddDialog';
import Link from 'next/link';
import { addBill, addExpense, deleteBill, deleteExpense, importBankCsv, setCategoryBudget, setMonthlyBudget } from '@/app/actions';
import { postDueBills } from '@/lib/spending';
import { withUser } from '@/lib/db';
import { personalWorkspaceId } from '@/lib/planner';
import { getCurrentUser } from '@/lib/session';
import { getSettings, money } from '@/lib/settings';
import { customTags, SPEND_CATEGORIES } from '@/lib/tags';
import { dateKeyIn, isDateKey, longDate, shiftDateKey } from '@/lib/time';

export const dynamic = 'force-dynamic';

async function SpendPageContent({ searchParams }: { searchParams: Promise<{ day?: string; import?: string; added?: string; dupes?: string; skipped?: string; msg?: string }> }) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const { day: requested } = sp;

  const data = await withUser(user!.id, async c => {
    const ws = await personalWorkspaceId(c, user!.id);
    const settings = await getSettings(c, user!.id);
    const today = dateKeyIn(settings.timezone);
    const day = isDateKey(requested) ? requested : today;
    await postDueBills(c, user!.id, ws, today);
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
    const bills = (await c.query<{ id: string; name: string; amount_minor: number; category: string; day_of_month: number; last_posted_month: string | null }>(
      `select id, name, amount_minor, category, day_of_month, last_posted_month from recurring_expenses where user_id = $1 and deleted_at is null order by day_of_month`, [user!.id])).rows;
    const budgets = (await c.query<{ category: string; amount_minor: number }>(`select category, amount_minor from category_budgets where user_id = $1`, [user!.id])).rows;
    return { day, today, settings, dayRows: dayRows.rows, monthRows: monthRows.rows, custom, ws, bills, budgets };
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
  const budgetOf = new Map(data.budgets.map(b => [b.category, b.amount_minor]));
  const catRows = [...data.monthRows.map(r => ({ category: r.category, total: r.total, budget: budgetOf.get(r.category) ?? null })),
    ...data.budgets.filter(b => !data.monthRows.some(r => r.category === b.category)).map(b => ({ category: b.category, total: 0, budget: b.amount_minor }))]
    .sort((a, b) => b.total - a.total);
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

      {sp.import === 'done' ? <div className="notice success" role="status">Imported {sp.added ?? 0} expenses{Number(sp.dupes) ? `, skipped ${sp.dupes} already imported` : ''}{Number(sp.skipped) ? ` and ${sp.skipped} rows that were deposits or could not be read` : ''}.</div> : null}
      {sp.import === 'error' || sp.import === 'empty' || sp.import === 'big' ? <div className="notice danger" role="alert">{sp.import === 'empty' ? 'Choose a CSV file first.' : sp.import === 'big' ? 'That file is over 2 MB. Export a shorter date range.' : sp.msg}</div> : null}
      <div className="layout-2">
        <div className="stack">
        <section className="card flush">
          <div className="card-head"><h2>Expenses</h2><span className="muted small">{data.dayRows.length} entries</span></div>
          {data.dayRows.length === 0 ? (
            <AddDialog title="Add an expense" label="Add an expense" text="Nothing recorded for this day. Tap + to add an expense.">
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
            </AddDialog>
          ) : (
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

        <section className="card flush">
          <div className="card-head"><h2>By category this month</h2><span className="small muted">Set a limit per category</span></div>
          {catRows.length === 0 ? <div className="empty">No spending this month yet.</div> : (
            <ul className="mini-list">
              {catRows.map(r => {
                const pct = r.budget ? Math.round((r.total / r.budget) * 100) : null;
                return (
                  <li key={r.category} className="cat-row">
                    <div className="cat-top">
                      <span className="title">{categoryLabel(r.category)}</span>
                      <span className="num">{money(r.total, cur)}{r.budget ? <span className="muted"> / {money(r.budget, cur)}</span> : null}</span>
                    </div>
                    {r.budget ? <div className="progress" style={{ marginTop: 6 }}><span style={{ width: `${Math.min(100, pct!)}%`, background: pct! > 100 ? 'var(--danger)' : pct! > 85 ? 'var(--warn)' : undefined }} /></div> : null}
                    <details className="cat-edit">
                      <summary className="small">{r.budget ? (pct! > 100 ? `Over by ${money(r.total - r.budget, cur)} · change limit` : `${pct}% used · change limit`) : 'Set a limit'}</summary>
                      <form action={setCategoryBudget} className="actions">
                        <input type="hidden" name="category" value={r.category} />
                        <input className="input" name="amount" inputMode="decimal" defaultValue={r.budget ? String(r.budget / 100) : ''} placeholder="Empty removes the limit" style={{ maxWidth: 200 }} />
                        <button className="btn sm" type="submit">Save</button>
                      </form>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        </div>

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

          <section className="card flush">
            <div className="card-head"><h2>Recurring bills</h2><span className="small muted">Added on their day each month</span></div>
            {data.bills.length ? (
              <ul className="mini-list">
                {data.bills.map(b => (
                  <li key={b.id} className="mini-row">
                    <span className="day-pill num" title="Day of the month">{b.day_of_month}</span>
                    <span className="mini-main"><span className="title">{b.name}</span><span className="small muted">{categoryLabel(b.category)} · {b.last_posted_month === data.today.slice(0, 7) ? 'Added this month' : 'Due this month'}</span></span>
                    <span className="num">{money(b.amount_minor, cur)}</span>
                    <form action={deleteBill}><input type="hidden" name="id" value={b.id} /><button className="btn ghost sm danger" type="submit" aria-label={`Remove ${b.name}`}>×</button></form>
                  </li>
                ))}
              </ul>
            ) : null}
            <details className="panel" open={data.bills.length === 0}>
              <summary className="card-body" style={{ paddingBottom: 0 }}>+ Add a bill</summary>
              <form action={addBill} className="form-grid card-body">
                <label className="field span-12">Name<input className="input" name="name" required maxLength={80} placeholder="e.g. Rent, Netflix, Phone" /></label>
                <label className="field span-6">Amount ({cur})<input className="input" name="amount" inputMode="decimal" required placeholder="e.g. 15000" /></label>
                <label className="field span-6">Day of month<input className="input" name="dayOfMonth" type="number" min={1} max={28} required defaultValue={1} /></label>
                <label className="field span-12">Category
                  <select className="select" name="category" defaultValue="bills">{options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
                </label>
                <button className="btn block span-12" type="submit">Add bill</button>
              </form>
            </details>
          </section>

          <section className="card card-body">
            <h2 style={{ marginBottom: 6 }}>Import from your bank</h2>
            <p className="small muted" style={{ marginBottom: 12 }}>Download a statement as CSV from net banking and upload it. Money going out becomes expenses with a guessed category; rows you already imported are skipped.</p>
            <form action={importBankCsv} className="stack" style={{ gap: 10 }}>
              <input className="input file-input" type="file" name="file" accept=".csv,text/csv" required />
              <button className="btn block" type="submit">Import CSV</button>
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
