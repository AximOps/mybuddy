import Link from 'next/link';
import { approveAutopilot, denyAutopilot } from '@/app/connect/actions';
import { STATE_RE, autopilotConfig } from '@/lib/connected-apps';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Approval page for Autopilot by Opseros. Autopilot sends people here with ?state=…&redirect_uri=…;
 * the return address must match AUTOPILOT_REDIRECT_URI exactly, so codes only ever go back to Autopilot.
 */
export default async function ConnectAutopilotPage({ searchParams }: { searchParams: Promise<{ state?: string; redirect_uri?: string }> }) {
  const { state = '', redirect_uri = '' } = await searchParams;
  const cfg = autopilotConfig();
  const user = await getCurrentUser();
  const valid = !!cfg && STATE_RE.test(state) && redirect_uri === cfg.redirect;
  const here = `/connect/autopilot?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirect_uri)}`;

  return (
    <div className="auth">
      <div className="auth-form">
        <div className="auth-card">
          <h1>Connect Autopilot</h1>
          {!valid ? (
            <p className="error" role="alert">
              {cfg ? 'This connection link is not valid. Start again from Autopilot → Settings.' : 'Connecting apps is not set up on this My Buddy site yet.'}
            </p>
          ) : !user ? (
            <>
              <p className="muted">Log in to My Buddy to connect it to Autopilot by Opseros.</p>
              <Link className="btn primary block" href={`/login?next=${encodeURIComponent(here)}`} style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Log in</Link>
            </>
          ) : (
            <>
              <p><b>Autopilot by Opseros</b> would like to read your work day in My Buddy, to fill your Teamwork timesheet:</p>
              <ul className="small" style={{ margin: '0 0 4px 18px', padding: 0, lineHeight: 1.7 }}>
                <li>your time entries (project, client, start and end, note)</li>
                <li>your meetings, focus sessions and finished to-dos</li>
              </ul>
              <p className="small muted">It cannot change anything in My Buddy. You can disconnect any time in Settings → Connected apps.</p>
              <p className="small muted">Signed in as {user.email}.</p>
              <div className="actions" style={{ gap: 8 }}>
                <form action={approveAutopilot}><input type="hidden" name="state" value={state} /><button className="btn primary" type="submit">Allow</button></form>
                <form action={denyAutopilot}><input type="hidden" name="state" value={state} /><button className="btn ghost" type="submit">Cancel</button></form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
