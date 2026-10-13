import { updateProfile, updateSettings } from '@/app/actions';
import { withUser } from '@/lib/db';
import { CURRENCIES, getSettings } from '@/lib/settings';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'UTC'];

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const settings = await withUser(user!.id, async c => getSettings(c, user!.id));
  const zones = TIMEZONES.includes(settings.timezone) ? TIMEZONES : [settings.timezone, ...TIMEZONES];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Your profile, time zone and data.</p>
        </div>
      </div>

      <div className="stack" style={{ maxWidth: 720 }}>
        <section className="card flush">
          <div className="card-head"><h2>Profile</h2></div>
          <form action={updateProfile} className="form-grid card-body">
            <label className="field span-8">Name<input className="input" name="name" defaultValue={user!.name} required maxLength={80} /></label>
            <label className="field span-4">Email<input className="input" value={user!.email} disabled readOnly /></label>
            <div className="span-12" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn primary" type="submit">Save profile</button>
            </div>
          </form>
        </section>

        <section className="card flush">
          <div className="card-head"><h2>Time and money</h2></div>
          <form action={updateSettings} className="form-grid card-body">
            <label className="field span-8">Time zone (decides what &quot;today&quot; means)
              <select className="select" name="timezone" defaultValue={settings.timezone}>
                {zones.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </label>
            <label className="field span-4">Currency (spending)
              <select className="select" name="currency" defaultValue={settings.currency}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </label>
            <div className="span-12" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn primary" type="submit">Save</button>
            </div>
          </form>
        </section>

        <section className="card flush">
          <div className="card-head"><h2>Your data</h2></div>
          <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <div>
              <div style={{ fontWeight: 550 }}>Download a copy</div>
              <div className="small muted">A JSON file with your routines, activities, tasks, notes, focus sessions and settings.</div>
            </div>
            <a className="btn" href="/api/export">Download JSON</a>
          </div>
        </section>
      </div>
    </>
  );
}
