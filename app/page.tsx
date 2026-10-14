import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { SpeedInsights } from "@vercel/speed-insights/next"

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <SpeedInsights />
    </>
  );
}

export default async function Home() {
  redirect((await getCurrentUser()) ? '/today' : '/login');
}
