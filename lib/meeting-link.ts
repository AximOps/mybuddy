/** Video call links on meetings. Google Meet is the main option; any https link (Zoom, Teams) also works. */

export const MEET_NEW_URL = 'https://meet.google.com/new';
const MEET_CODE = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i;

/**
 * Cleans what someone pasted: a full link, a link without https://, or a bare Meet code such as
 * "abc-defg-hij". Returns '' for empty, the clean https link, or null when it is not a usable link.
 */
export function normalizeMeetUrl(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (MEET_CODE.test(s)) return `https://meet.google.com/${s.toLowerCase()}`;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol === 'http:' ) u.protocol = 'https:';
    if (u.protocol !== 'https:' || !u.hostname.includes('.') || u.username || u.password) return null;
    const out = u.toString();
    return out.length <= 300 ? out : null;
  } catch { return null; }
}

export const isGoogleMeet = (url: string | null | undefined) => !!url && /^https:\/\/meet\.google\.com\//i.test(url);
export const callLabel = (url: string) => isGoogleMeet(url) ? 'Google Meet'
  : /zoom\.us\//i.test(url) ? 'Zoom' : /teams\.(microsoft|live)\.com\//i.test(url) ? 'Microsoft Teams' : 'video call';
