import { cache } from 'react';
import { isPlatformAdmin } from './admin';
import { withUser } from './db';
import { getSettings } from './settings';
import { getCurrentUser } from './session';

/** What the app shell needs (user, settings, admin flag). Loaded once per request, in one database transaction. */
export const getAppContext = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;
  const { settings, admin } = await withUser(user.id, async c => ({
    settings: await getSettings(c, user.id),
    admin: await isPlatformAdmin(c, user.id),
  }));
  return { user, settings, admin };
});
