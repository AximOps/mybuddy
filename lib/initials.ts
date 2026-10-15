/** Two letters for an avatar, from the name or else the email. */
export function initials(name: string, email: string) {
  const source = (name ?? '').trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}
