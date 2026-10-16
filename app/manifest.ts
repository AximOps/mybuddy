import type { MetadataRoute } from 'next';

/** Lets people install My Buddy on their phone or computer like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'My Buddy · Daily Planner',
    short_name: 'My Buddy',
    description: 'Plan your day, buddy. Routines, to-dos, notes, focus and more.',
    id: '/today',
    start_url: '/today',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f4f5fb',
    theme_color: '#4b5be8',
    categories: ['productivity', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Today', url: '/today', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'To-Do', url: '/tasks', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'New note', url: '/notes/new', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Focus', url: '/focus', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
