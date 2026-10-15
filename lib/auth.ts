import { betterAuth } from 'better-auth';
import { pool } from './db';

const google = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  ? { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }
  : null;

const apple = process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
  ? { clientId: process.env.APPLE_CLIENT_ID, clientSecret: process.env.APPLE_CLIENT_SECRET }
  : null;

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: pool,
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  socialProviders: {
    ...(google ? { google } : {}),
    ...(apple ? { apple } : {}),
  },
  databaseHooks: {
    session: {
      create: {
        // Refuse new sign-ins for suspended accounts.
        before: async session => {
          const { rows } = await pool.query<{ s: boolean }>(`select is_user_suspended($1) as s`, [session.userId]);
          if (rows[0]?.s) return false;
        },
      },
    },
    user: {
      create: {
        // Every new account gets a personal workspace, owned by that person.
        after: async user => {
          await pool.query('select create_personal_workspace($1, $2)', [user.id, `${user.name || 'My'} workspace`]);
        },
      },
    },
  },
});
