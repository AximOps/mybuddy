import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
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
  // The Amiroon phone app signs in with the same accounts. It keeps the session token from the
  // sign-in reply and sends it as "Authorization: Bearer <token>" (the bearer plugin).
  plugins: [bearer()],
  // The phone app's link schemes, so its requests pass the origin check.
  // MOBILE_WEB_ORIGINS: addresses of the app's browser build, if it is opened from its own address.
  trustedOrigins: ['amiroon://', 'mybuddy://', ...(process.env.MOBILE_WEB_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean)],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    resetPasswordTokenExpiresIn: 60 * 60, // one hour
    revokeSessionsOnPasswordReset: true,  // a new password signs out every other session
    sendResetPassword: async ({ user, url }) => {
      const { sendMail } = await import('./mail');
      const result = await sendMail(
        user.email,
        'Reset your Amiroon password',
        `Hi ${user.name || 'there'},\n\nUse this link to choose a new password. It expires in one hour:\n${url}\n\nIf you did not ask for this, you can ignore this email. Your password stays the same.`,
      );
      // Without email set up, the link is printed in the server log while developing only.
      if (!result.sent && process.env.NODE_ENV !== 'production') console.log(`[dev] password reset link for ${user.email}: ${url}`);
    },
  },
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
