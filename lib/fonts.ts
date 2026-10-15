import { Bricolage_Grotesque } from 'next/font/google';

/** Display face for headings and numbers. Body text stays on the system font. */
export const displayFont = Bricolage_Grotesque({ subsets: ['latin'], weight: ['500', '700', '800'], variable: '--font-bricolage', display: 'swap' });
