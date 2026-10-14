import type { Viewport } from 'next';

/** Lets the site scale to the phone's width and uses the phone's status bar colour. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#f4f5fa' }, { media: '(prefers-color-scheme: dark)', color: '#0f1126' }],
};
