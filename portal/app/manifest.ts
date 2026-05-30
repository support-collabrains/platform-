import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CollaBrains',
    short_name: 'CollaBrains',
    description: 'Self-hosted personal platform',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#0f172a',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    shortcuts: [
      {
        name: 'Documenten',
        url: '/dashboard/docs',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
      {
        name: "Foto's",
        url: '/dashboard/photos',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}
