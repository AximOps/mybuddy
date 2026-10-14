import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { SpeedInsights } from "@vercel/speed-insights/next"
import './globals.css';
export { viewport } from './page-viewport';

export const metadata = { title: 'My Buddy', description: 'Plan your day, buddy.' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const saved = (await cookies()).get('theme')?.value;
  const theme = saved === 'light' || saved === 'dark' ? saved : undefined;
  return (
    <html lang="en" data-theme={theme}>
      <body>
	  {children}
	  <SpeedInsights />
	  </body>
    </html>
  );
}