import { json, userFromBearer } from '@/lib/connected-apps';

export const dynamic = 'force-dynamic';

/** Who the Autopilot token belongs to (used to show "Connected as …"). */
export async function GET(req: Request) {
  const user = await userFromBearer(req);
  return user ? json({ user }) : json({ error: 'invalid_token' }, 401);
}
