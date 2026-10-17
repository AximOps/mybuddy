import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { RegisterSW } from '@/components/RegisterSW';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import { displayFont } from '@/lib/fonts';
export { viewport } from './page-viewport';

// The page title comes from metadata below. Do not add a <title> tag in <head>, it would override this.
export const metadata: Metadata = {
  title: 'Amiroon',
  description: 'Life Organized!',
  applicationName: 'Amiroon',
  appleWebApp: { capable: true, title: 'Amiroon', statusBarStyle: 'default' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const saved = (await cookies()).get('theme')?.value;
  const theme = saved === 'light' || saved === 'dark' ? saved : undefined;
  return (
    <html lang="en" data-theme={theme} className={displayFont.variable}>
      <body>
        {children}
        <RegisterSW />
        <SpeedInsights />
      </body>
    </html>
  );
}
