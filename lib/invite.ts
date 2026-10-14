import { createHash, randomBytes } from 'node:crypto';

export const INVITE_DAYS = 7;

/** A new invitation token. Only its hash is stored; the link is shown once. */
export function newInviteToken() {
  const token = randomBytes(24).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function inviteUrl(token: string) {
  const base = (process.env.BETTER_AUTH_URL ?? '').replace(/\/$/, '');
  return `${base}/invite/${token}`;
}
