/** Mobile numbers are stored in E.164 form, for example +919876543210. */
export const COUNTRY_CODES = [
  { code: '91', label: '🇮🇳 +91' }, { code: '1', label: '🇺🇸 +1' }, { code: '44', label: '🇬🇧 +44' }, { code: '971', label: '🇦🇪 +971' },
  { code: '65', label: '🇸🇬 +65' }, { code: '61', label: '🇦🇺 +61' }, { code: '49', label: '🇩🇪 +49' }, { code: '966', label: '🇸🇦 +966' },
] as const;

/** Joins a country code and a local number; returns null when it does not look like a mobile number. */
export function normalizePhone(country: string, local: string): string | null {
  const cc = country.replace(/\D/g, '');
  let n = local.replace(/\D/g, '');
  if (n.startsWith(cc) && n.length > 10) n = n.slice(cc.length);
  n = n.replace(/^0+/, '');
  if (!cc || cc.length > 3) return null;
  if (cc === '91' && !/^[6-9]\d{9}$/.test(n)) return null;
  const full = `+${cc}${n}`;
  return /^\+[1-9]\d{7,14}$/.test(full) ? full : null;
}

/** +919876543210 -> +91 98765 43210 (Indian numbers), otherwise left as is. */
export function formatPhone(p: string | null): string {
  if (!p) return '';
  const m = p.match(/^\+91(\d{5})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : p;
}
