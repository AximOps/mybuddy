// Creates the Apple "client secret" (a short-lived signed JWT) that Apple sign-in on the web needs.
// Apple accepts secrets valid for up to 6 months, so run this again before it expires and update
// APPLE_CLIENT_SECRET in Vercel.
//
// Usage:
//   APPLE_TEAM_ID=ABCDE12345 APPLE_KEY_ID=KEY123 APPLE_CLIENT_ID=com.example.mybuddy.web \
//   APPLE_PRIVATE_KEY_PATH=./AuthKey_KEY123.p8 node scripts/apple-client-secret.mjs
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const { APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID, APPLE_PRIVATE_KEY_PATH } = process.env;
for (const [name, value] of Object.entries({ APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID, APPLE_PRIVATE_KEY_PATH })) {
  if (!value) { console.error(`${name} is not set.`); process.exit(1); }
}

const b64url = (data) => Buffer.from(data).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = b64url(JSON.stringify({ alg: 'ES256', kid: APPLE_KEY_ID }));
const payload = b64url(JSON.stringify({
  iss: APPLE_TEAM_ID,
  iat: now,
  exp: now + 60 * 60 * 24 * 180,
  aud: 'https://appleid.apple.com',
  sub: APPLE_CLIENT_ID,
}));
const key = createPrivateKey(readFileSync(APPLE_PRIVATE_KEY_PATH));
const signature = sign('sha256', Buffer.from(`${header}.${payload}`), { key, dsaEncoding: 'ieee-p1363' });
console.log(`${header}.${payload}.${b64url(signature)}`);
