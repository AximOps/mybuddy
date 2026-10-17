import { NextResponse, type NextRequest } from 'next/server';

/*
 * Cross-origin access for the Amiroon app's browser build (for example when it is opened from its own
 * address while testing). Native phone apps do not need this. Allowed origins come from
 * MOBILE_WEB_ORIGINS (comma separated, e.g. "https://app.amiroon.app,http://localhost:8081").
 * The app signs in with a bearer token, so no cookies are shared across origins.
 */
const ALLOWED = (process.env.MOBILE_WEB_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);

export function proxy(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin || !ALLOWED.includes(origin)) return NextResponse.next();
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Expose-Headers': 'set-auth-token',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  if (req.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers });
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

export const config = { matcher: ['/api/auth/:path*', '/api/mobile/:path*'] };
