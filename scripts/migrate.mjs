// Applies every SQL file in db/migrations, in name order, once each.
//
// Migrations must run as the database OWNER (for Neon, the role created with the project),
// because they create tables, functions and the app role. The app itself uses the restricted
// mybuddy_app role, so keep the two connection strings separate:
//
//   MIGRATION_DATABASE_URL  owner connection string, used only by this script
//   DATABASE_URL            mybuddy_app connection string, used by the web app
//
// Values are read from the shell first, then from .env.local, then from .env.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const root = join(import.meta.dirname, '..');
for (const file of ['.env.local', '.env']) {
  const path = join(root, file);
  if (existsSync(path)) process.loadEnvFile(path);
}

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) {
  console.error('MIGRATION_DATABASE_URL is not set.');
  console.error('Add the owner connection string to .env.local, for example:');
  console.error('  MIGRATION_DATABASE_URL=postgresql://neondb_owner:...@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require');
  process.exit(1);
}

const dir = join(root, 'db', 'migrations');
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const done = new Set((await client.query('select name from schema_migrations')).rows.map(r => r.name));
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(file)) { console.log(`skip ${file}`); continue; }
    await client.query('begin');
    await client.query(readFileSync(join(dir, file), 'utf8'));
    await client.query('insert into schema_migrations (name) values ($1)', [file]);
    await client.query('commit');
    console.log(`applied ${file}`);
  }
} catch (error) {
  await client.query('rollback');
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end();
}
