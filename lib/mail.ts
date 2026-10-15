/**
 * Sends transactional email through Resend (https://resend.com). Needs two settings in Vercel:
 *   RESEND_API_KEY  the API key from Resend
 *   MAIL_FROM       a sender on a domain you have verified in Resend, e.g. "My Buddy <hello@yourdomain.com>"
 * Without them, nothing is sent and the caller falls back to showing the invitation link.
 */
export async function sendMail(to: string, subject: string, text: string): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) return { sent: false };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    if (!res.ok) return { sent: false, error: `The email could not be sent (status ${res.status}).` };
    return { sent: true };
  } catch {
    return { sent: false, error: 'The email could not be sent. Check the connection and try again.' };
  }
}
