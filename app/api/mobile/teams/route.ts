import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withUser } from '@/lib/db';
import { userHasPremium } from '@/lib/entitlements';
import { getCurrentUser } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { dateKeyIn, isUuid } from '@/lib/time';

export const dynamic = 'force-dynamic';

/*
 * Teams for the phone app, the same as the website's Teams page: your teams, members and roles,
 * invitations, rename, leave and delete, plus a short view of the team's shared projects and meetings.
 * All checks run here and in the database functions, exactly as for the website.
 */

const NO_STORE = { 'Cache-Control': 'no-store' };
const ROLES = ['owner', 'admin', 'member'] as const;
type OrgRole = (typeof ROLES)[number];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

/** Messages raised by the team database functions are written for people; anything else gets a general one. */
function teamError(error: unknown) {
  const m = error instanceof Error ? error.message.replace(/^error: /i, '') : '';
  return /^[A-Z][^\n]{3,120}\.$/.test(m) ? m : 'That did not work. Please try again.';
}

async function roleOf(c: PoolClient, orgId: string, userId: string): Promise<OrgRole | null> {
  const { rows } = await c.query<{ role: OrgRole }>(`select role from organisation_members where organisation_id = $1 and user_id = $2`, [orgId, userId]);
  return rows[0]?.role ?? null;
}

/** Teams need Premium (or the free trial) and Work or Student mode, as on the website. */
async function access(c: PoolClient, userId: string) {
  const settings = await getSettings(c, userId);
  const premium = await userHasPremium(c, userId);
  const reason = settings.mode === 'personal' ? 'Teams are for Work and Student mode. Change the mode in Settings to use them.'
    : !premium ? 'Teams are part of Premium. Your free trial has ended.' : null;
  return { mode: settings.mode, premium, allowed: !reason, reason, timezone: settings.timezone };
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: 'Not signed in.' }, 401);
  const wanted = new URL(req.url).searchParams.get('team');
  const data = await withUser(user.id, async c => {
    const acc = await access(c, user.id);
    const teams = (await c.query<{ id: string; name: string; role: OrgRole; members: number }>(
      `select o.id, o.name, m.role, (select count(*)::int from organisation_members x where x.organisation_id = o.id) as members
         from organisation_members m join organisations o on o.id = m.organisation_id
        where m.user_id = $1 order by lower(o.name)`, [user.id])).rows;
    const team = teams.find(t => t.id === wanted) ?? teams[0] ?? null;
    if (!team) return { access: acc, teams, team: null };
    const members = (await c.query<{ userId: string; role: OrgRole; name: string; email: string }>(
      `select m.user_id as "userId", m.role, u.name, u.email from organisation_members m join "user" u on u.id = m.user_id
        where m.organisation_id = $1 order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, lower(u.name)`, [team.id])).rows;
    const invites = team.role === 'member' ? [] : (await c.query<{ id: string; email: string; role: OrgRole; expiresAt: Date }>(
      `select id, email, role, expires_at as "expiresAt" from invitations
        where organisation_id = $1 and accepted_at is null and expires_at > now() order by created_at desc`, [team.id])).rows;
    // The team's shared workspace: projects and the next meetings.
    const ws = (await c.query<{ id: string }>(
      `select w.id from workspaces w join workspace_members m on m.workspace_id = w.id and m.user_id = $2 where w.organisation_id = $1 limit 1`,
      [team.id, user.id])).rows[0]?.id ?? null;
    let projects: { id: string; name: string; client: string | null }[] = [];
    let meetings: { id: string; title: string; date: string; startMin: number | null; endMin: number | null; meetUrl: string | null }[] = [];
    if (ws) {
      projects = (await c.query(
        `select p.id, p.name, cl.name as client from projects p left join clients cl on cl.id = p.client_id and cl.deleted_at is null
          where p.workspace_id = $1 and p.deleted_at is null order by lower(p.name) limit 50`, [ws])).rows;
      const today = dateKeyIn(acc.timezone || 'Asia/Kolkata', new Date());
      meetings = (await c.query(
        `select id, title, meeting_on::text as date, start_min as "startMin", end_min as "endMin", meet_url as "meetUrl"
           from meetings where workspace_id = $1 and deleted_at is null and meeting_on >= $2::date
          order by meeting_on, start_min nulls first limit 20`, [ws, today])).rows;
    }
    return { access: acc, teams, team, members, invites: invites.map(i => ({ ...i, expiresAt: i.expiresAt.toISOString() })), projects, meetings };
  });
  return json({ ...data, me: user.id });
}

type Body = { action?: string; orgId?: string; name?: string; email?: string; role?: string; userId?: string; inviteId?: string; confirm?: string; link?: string };

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: 'Not signed in.' }, 401);
  let b: Body;
  try { b = await req.json(); } catch { return json({ error: 'Bad request.' }, 400); }
  const orgId = String(b.orgId ?? '');
  const name = String(b.name ?? '').trim().slice(0, 120);
  const role = String(b.role ?? 'member') as OrgRole;

  // Leaving is always allowed (even without Premium), so nobody is stuck in a team.
  if (b.action === 'leave') {
    if (!isUuid(orgId)) return json({ error: 'Bad request.' }, 400);
    try {
      const r = await withUser(user.id, async c => (await c.query<{ r: string }>(`select leave_organisation($1, $2) as r`, [user.id, orgId])).rows[0].r);
      return json({ ok: true, result: r });
    } catch (e) { return json({ error: teamError(e) }, 400); }
  }

  const acc = await withUser(user.id, async c => access(c, user.id));
  // As on the website: creating and inviting need Premium and Work or Student mode; managing an existing team
  // (accept, rename, roles, remove, cancel invitations) needs Premium only; deleting needs neither.
  if ((b.action === 'create' || b.action === 'invite') && !acc.allowed) return json({ error: acc.reason }, 403);
  if (b.action !== 'delete' && !acc.premium) return json({ error: 'Teams are part of Premium. Your free trial has ended.' }, 403);

  try {
    switch (b.action) {
      case 'create': {
        if (!name) return json({ error: 'Enter a team name.' }, 400);
        const id = await withUser(user.id, async c => (await c.query<{ id: string }>(`select create_organisation($1, $2) as id`, [user.id, name])).rows[0].id);
        return json({ ok: true, teamId: id });
      }
      case 'rename': {
        if (!isUuid(orgId) || !name) return json({ error: 'Enter a team name.' }, 400);
        await withUser(user.id, async c => { await c.query(`select rename_organisation($1, $2, $3)`, [user.id, orgId, name]); });
        return json({ ok: true });
      }
      case 'invite': {
        const email = String(b.email ?? '').trim().toLowerCase().slice(0, 254);
        if (!isUuid(orgId) || !EMAIL.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
        if (!ROLES.includes(role)) return json({ error: 'Bad request.' }, 400);
        const { newInviteToken, INVITE_DAYS, inviteUrl } = await import('@/lib/invite');
        const { token, hash } = newInviteToken();
        const made = await withUser(user.id, async c => {
          const mine = await roleOf(c, orgId, user.id);
          if (!mine || mine === 'member') return { error: 'Only owners and admins can invite people.' };
          if (role === 'owner' && mine !== 'owner') return { error: 'Only an owner can invite another owner.' };
          await c.query(
            `insert into invitations (id, organisation_id, email, role, token_hash, invited_by, expires_at)
             values ($1, $2, $3, $4, $5, $6, now() + ($7 || ' days')::interval)`,
            [randomUUID(), orgId, email, role, hash, user.id, String(INVITE_DAYS)]);
          const orgName = (await c.query<{ name: string }>(`select name from organisations where id = $1`, [orgId])).rows[0]?.name ?? 'your team';
          return { orgName };
        });
        if ('error' in made) return json({ error: made.error }, 403);
        const link = inviteUrl(token);
        const inviter = user.name || user.email;
        const { sendMail } = await import('@/lib/mail');
        const sent = await sendMail(email, `${inviter} invited you to ${made.orgName} on My Buddy`,
          `${inviter} invited you to join ${made.orgName} on My Buddy.\n\nOpen this link and log in with ${email} to accept:\n${link}\n\nThe link works once and expires in ${INVITE_DAYS} days.`);
        return json({ ok: true, emailed: sent.sent, link: sent.sent ? null : link, mailError: sent.error ?? null });
      }
      case 'revoke': {
        const id = String(b.inviteId ?? '');
        if (!isUuid(id)) return json({ error: 'Bad request.' }, 400);
        const done = await withUser(user.id, async c => {
          const org = (await c.query<{ organisation_id: string }>(`select organisation_id from invitations where id = $1`, [id])).rows[0]?.organisation_id;
          const mine = org ? await roleOf(c, org, user.id) : null;
          if (!mine || mine === 'member') return false;
          await c.query(`delete from invitations where id = $1`, [id]);
          return true;
        });
        return done ? json({ ok: true }) : json({ error: 'Only owners and admins can cancel invitations.' }, 403);
      }
      case 'role': {
        const target = String(b.userId ?? '');
        if (!isUuid(orgId) || !target || !ROLES.includes(role)) return json({ error: 'Bad request.' }, 400);
        await withUser(user.id, async c => { await c.query(`select set_org_member_role($1, $2, $3, $4)`, [user.id, orgId, target, role]); });
        return json({ ok: true });
      }
      case 'remove': {
        const target = String(b.userId ?? '');
        if (!isUuid(orgId) || !target || target === user.id) return json({ error: 'Bad request.' }, 400);
        await withUser(user.id, async c => { await c.query(`select remove_org_member($1, $2, $3)`, [user.id, orgId, target]); });
        return json({ ok: true });
      }
      case 'delete': {
        if (!isUuid(orgId)) return json({ error: 'Bad request.' }, 400);
        const teamName = await withUser(user.id, async c => (await c.query<{ name: string }>(`select name from organisations where id = $1`, [orgId])).rows[0]?.name ?? '');
        if (!teamName || String(b.confirm ?? '').trim().toLowerCase() !== teamName.toLowerCase()) return json({ error: 'Type the team name exactly to delete it.' }, 400);
        await withUser(user.id, async c => { await c.query(`select delete_organisation($1, $2)`, [user.id, orgId]); });
        return json({ ok: true });
      }
      case 'accept': {
        // An invitation link pasted into the app: https://…/invite/<token>, or the token itself.
        const raw = String(b.link ?? '').trim();
        const token = /\/invite\/([A-Za-z0-9_-]{20,})/.exec(raw)?.[1] ?? (/^[A-Za-z0-9_-]{20,}$/.test(raw) ? raw : '');
        if (!token) return json({ error: 'Paste the whole invitation link from the email.' }, 400);
        const { hashToken } = await import('@/lib/invite');
        const id = await withUser(user.id, async c => (await c.query<{ id: string }>(`select accept_invitation($1, $2) as id`, [user.id, hashToken(token)])).rows[0]?.id ?? '');
        return json({ ok: true, teamId: id });
      }
      default:
        return json({ error: 'Unknown action.' }, 400);
    }
  } catch (e) {
    return json({ error: teamError(e) }, 400);
  }
}
