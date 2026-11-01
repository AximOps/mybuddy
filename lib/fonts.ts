import localFont from 'next/font/local';

/**
 * Display face for headings and numbers. Body text stays on the system font.
 * Bricolage Grotesque (SIL Open Font License, see fonts/OFL.txt) is bundled with the app instead of
 * downloaded from Google Fonts at build time, so a Google hiccup can't fail the Vercel build.
 */
export const displayFont = localFont({
  src: [
    { path: './fonts/bricolage-grotesque-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/bricolage-grotesque-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: './fonts/bricolage-grotesque-latin-800-normal.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-bricolage',
  display: 'swap',
});
