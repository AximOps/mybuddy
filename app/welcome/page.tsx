import { redirect } from 'next/navigation';
import { Briefcase, GraduationCap, Sparkles, UserRound } from 'lucide-react';
import { completeOnboarding } from '@/app/actions';
import { BrandLockup } from '@/components/BuddyLogo';
import { withUser } from '@/lib/db';
import { COUNTRY_CODES } from '@/lib/phone';
import { getCurrentUser } from '@/lib/session';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  phone: 'Enter a valid mobile number. Indian numbers have 10 digits and start with 6, 7, 8 or 9.',
  mode: 'Choose how you will use Amiroon.',
  taken: 'This mobile number is already used by another account. Sign in to that account, or use a different number.',
  failed: 'Something went wrong while saving. Please try again.',
};

const MODES = [
  { id: 'personal', icon: UserRound, title: 'Personal', text: 'Daily routines, to-dos, notes, habits and spending.' },
  { id: 'work', icon: Briefcase, title: 'Work', text: 'Adds time tracking, projects, meetings, invoices and teams.' },
  { id: 'student', icon: GraduationCap, title: 'Student', text: 'Adds timetable, assignments, exams, subjects and GPA.' },
] as const;

/** First sign-in: mobile number and mode. The 15-day Premium trial starts here. */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ error?: string; phone?: string; mode?: string; country?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const settings = await withUser(user.id, async c => getSettings(c, user.id));
  if (settings.onboarded && settings.phone) redirect('/today');
  const sp = await searchParams;
  const first = (user.name || '').split(' ')[0];
  const chosen = MODES.some(m => m.id === sp.mode) ? sp.mode : 'personal';

  return (
    <div className="welcome">
      <div className="welcome-card card">
        <BrandLockup size={44} />
        <div>
          <h1>Welcome{first ? `, ${first}` : ''}! 👋</h1>
          <p className="muted" style={{ marginTop: 6 }}>Two quick questions and your planner is ready.</p>
        </div>
        <div className="welcome-trial"><Sparkles size={18} aria-hidden="true" /><span><strong>15 days of Premium, free.</strong> Every feature is unlocked during your trial. After that you can stay on Free or upgrade.</span></div>
        {sp.error && ERRORS[sp.error] ? <div className="notice danger" role="alert">{ERRORS[sp.error]}</div> : null}

        <form action={completeOnboarding} className="stack" style={{ gap: 22 }}>
          <fieldset className="welcome-step">
            <legend><span className="step-no">1</span> Your mobile number</legend>
            <div className="phone-row">
              <select className="select" name="country" defaultValue={COUNTRY_CODES.some(c => c.code === sp.country) ? sp.country : '91'} aria-label="Country code">
                {COUNTRY_CODES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
              <input className="input" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" required defaultValue={sp.phone ?? ''} placeholder="98765 43210" aria-label="Mobile number" />
            </div>
            <p className="small muted">Used to keep one free trial per person. We don&apos;t send marketing messages.</p>
          </fieldset>

          <fieldset className="welcome-step">
            <legend><span className="step-no">2</span> How will you use Amiroon?</legend>
            <div className="mode-cards">
              {MODES.map(m => {
                const Icon = m.icon;
                return (
                  <label key={m.id} className="mode-card">
                    <input type="radio" name="mode" value={m.id} defaultChecked={chosen === m.id} required />
                    <span className="mode-icon"><Icon size={20} aria-hidden="true" /></span>
                    <strong>{m.title}</strong>
                    <span className="small muted">{m.text}</span>
                  </label>
                );
              })}
            </div>
            <label className="field student-level">Level
              <select className="select" name="level" defaultValue="college">
                <option value="college">College / University (credits and GPA)</option>
                <option value="school">School (marks and percentages)</option>
              </select>
            </label>
            <p className="small muted">You can change this any time in Settings.</p>
          </fieldset>

          <button className="btn primary block" type="submit" style={{ height: 48 }}>Start planning</button>
        </form>
      </div>
    </div>
  );
}
