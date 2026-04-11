import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Chef-One',
    short_name: 'Chef-One',
    description: 'Gestión operativa para restaurantes',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#d32f2f',
    orientation: 'portrait',
    icons: [
      {
        src: '/icons/icon-app.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icons/icon-app.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icons/icon-app.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}

