import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Load only the icons each page uses, which makes pages faster to open.
    optimizePackageImports: ['lucide-react'],
  },
  // The Team page moved to /teams. Query strings carry over.
  async redirects() {
    return [{ source: '/organisation', destination: '/teams', permanent: true }];
  },
  async headers() {
    return [{
      source: '/sw.js',
      headers: [
        { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Service-Worker-Allowed', value: '/' },
      ],
    }];
  },
};

export default nextConfig;
