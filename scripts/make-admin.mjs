// Makes an existing account a platform admin. Run once per admin, with the OWNER connection:
//   MIGRATION_DATABASE_URL=postgresql://... node scripts/make-admin.mjs someone@example.com
import pg from 'pg';

const email = (process.argv[2] ?? '').trim().toLowerCase();
const url = process.env.MIGRATION_DATABASE_URL;
if (!email || !url) {
  console.error('Usage: MIGRATION_DATABASE_URL=... node scripts/make-admin.mjs <email>');
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const { rowCount } = await client.query(
    `insert into platform_admins (user_id) select id from "user" where lower(email) = $1 on conflict do nothing`, [email]);
  console.log(rowCount ? `${email} is now a platform admin.` : `No account found for ${email}.`);
} finally {
  await client.end();
}
