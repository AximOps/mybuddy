import { headers } from 'next/headers';
import { auth } from './auth';

/** The signed-in user on the server, or null. */
export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}
