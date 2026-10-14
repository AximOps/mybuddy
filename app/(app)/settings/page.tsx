import { deleteCustomTag, resetAllData, resetTodayProgress, updateAppearance, updateMode, updateProfile, updateSettings, updateStudentTools } from '@/app/actions';
import { withUser } from '@/lib/db';
import { CURRENCIES, getSettings } from '@/lib/settings';
import { customTags } from '@/lib/tags';
import { getCurrentUser } from '@/lib/session';
import { dateKeyIn } from '@/lib/time';

export const dynamic = 'force-dynamic';

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'UTC'];

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const data = await withUser(user!.id, async c => {
    const settings = await getSettings(c, user!.id);
    return { settings, tags: await customTags(c, user!.id, 'task'), notes: await customTags(c, user!.id, 'note'), spend: await customTags(c, user!.id, 'spend'), today: dateKeyIn(settings.timezone) };
  });
  const { settings } = data;
  const zones = TIMEZONES.includes(settings.timezone) ? TIMEZONES : [settings.timezone, ...TIMEZONES];

  const section = (title: string, children: React.ReactNode) => (
    <section className="card flush">
      <div className="card-head"><h2>{title}</h2></div>
      {children}
    </section>
  );

  const tagRows = (rows: { id: string; name: string }[]) => (
    rows.length === 0 ? <p className="small muted">No custom tags yet.</p> : (
      <div className="actions">
        {rows.map(r => (
          <form key={r.id} action={deleteCustomTag} className="actions" style={{ gap: 4 }}>
            <input type="hidden" name="id" value={r.id} />
            <span className="badge">{r.name}</span>
            <button type="submit" className="btn ghost sm danger" aria-label={`Remove ${r.name}`}>×</button>
          </form>
        ))}
      </div>
    )
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Your profile, preferences and data.</p>
        </div>
      </div>

      <div className="stack" style={{ maxWidth: 760 }}>
        {section('Profile', (
          <form action={updateProfile} className="form-grid card-body">
            <label className="field span-8">Name<input className="input" name="name" defaultValue={user!.name} required maxLength={80} /></label>
            <label className="field span-4">Email<input className="input" value={user!.email} disabled readOnly /></label>
            <div className="span-12" style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Save profile</button></div>
          </form>
        ))}

        {section('Appearance', (
          <form action={updateAppearance} className="card-body actions">
            {(['system', 'light', 'dark'] as const).map(t => (
              <button key={t} type="submit" name="theme" value={t} className={`btn ${settings.theme === t ? 'primary' : ''}`} aria-pressed={settings.theme === t}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </form>
        ))}

        {section('Time and money', (
          <form action={updateSettings} className="form-grid card-body">
            <label className="field span-6">Time zone (decides what &quot;today&quot; means)
              <select className="select" name="timezone" defaultValue={settings.timezone}>{zones.map(z => <option key={z} value={z}>{z}</option>)}</select>
            </label>
            <label className="field span-6">Currency
              <select className="select" name="currency" defaultValue={settings.currency}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select>
            </label>
            <div className="span-12" style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Save</button></div>
          </form>
        ))}

        {section('Mode', (
          <form action={updateMode} className="card-body actions">
            <button type="submit" name="mode" value="personal" className={`btn ${settings.mode === 'personal' ? 'primary' : ''}`}>Personal</button>
            <button type="submit" name="mode" value="student" className={`btn ${settings.mode === 'student' ? 'primary' : ''}`}>Student</button>
            <button type="submit" name="mode" value="work" className={`btn ${settings.mode === 'work' ? 'primary' : ''}`}>Work</button>
          </form>
        ))}

        {section('Student tools', (
          <form action={updateStudentTools} className="form-grid card-body">
            <label className="check-row span-12"><input type="checkbox" name="enabled" defaultChecked={settings.studentEnabled} /> Show student tools</label>
            <label className="field span-6">Level
              <select className="select" name="level" defaultValue={settings.studentLevel}>
                <option value="school">School (percentages)</option>
                <option value="college">College / University (credits and GPA)</option>
              </select>
            </label>
            <div className="span-12 small muted">The student timetable, deadlines and subjects are being added in the next phase. This setting is saved now.</div>
            <div className="span-12" style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Save</button></div>
          </form>
        ))}

        {section('Custom tags', (
          <div className="card-body stack" style={{ gap: 14 }}>
            <div><div className="small muted" style={{ marginBottom: 6 }}>To-do tags</div>{tagRows(data.tags)}</div>
            <div><div className="small muted" style={{ marginBottom: 6 }}>Note tags</div>{tagRows(data.notes)}</div>
            <div><div className="small muted" style={{ marginBottom: 6 }}>Spending categories</div>{tagRows(data.spend)}</div>
            <p className="small muted">You can also add a new tag directly on a task, note or expense.</p>
          </div>
        ))}

        {section('Your data', (
          <div className="card-body stack" style={{ gap: 14 }}>
            <div className="actions" style={{ justifyContent: 'space-between' }}>
              <div><div style={{ fontWeight: 550 }}>Download a copy</div><div className="small muted">JSON file with routines, activities, tasks, notes, spending and focus sessions.</div></div>
              <a className="btn" href="/api/export">Download JSON</a>
            </div>
            <form action={resetTodayProgress} className="actions" style={{ justifyContent: 'space-between' }}>
              <div><div style={{ fontWeight: 550 }}>Reset today&apos;s progress</div><div className="small muted">Unchecks everything done today.</div></div>
              <input type="hidden" name="day" value={data.today} />
              <button type="submit" className="btn">Reset today</button>
            </form>
            <form action={resetAllData} className="actions" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 14 }}>
              <div><div style={{ fontWeight: 550, color: 'var(--danger)' }}>Reset all data</div><div className="small muted">Deletes your tasks, notes, spending and focus history, and restores the default routines. Type RESET to confirm.</div></div>
              <div className="actions">
                <input className="input" name="confirm" placeholder="RESET" aria-label="Type RESET to confirm" style={{ width: 120 }} />
                <button type="submit" className="btn danger">Reset all data</button>
              </div>
            </form>
          </div>
        ))}
      </div>
    </>
  );
}
