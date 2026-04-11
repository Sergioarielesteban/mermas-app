import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Chef-One',
    short_name: 'ChefOne',
    description: 'Gestión operativa para restaurantes',
    start_url: '/',
    display: 'standalone',
    background_color: '#f4f5f7',
    theme_color: '#d32f2f',
    orientation: 'portrait',
    icons: [
      {
        src: '/icons/icon-192.jpg',
        sizes: '192x192',
        type: 'image/jpeg',
      },
      {
        src: '/icons/icon-512.jpg',
        sizes: '512x512',
        type: 'image/jpeg',
      },
      {
        src: '/logo-chef-one.svg',
        sizes: '512x160',
        type: 'image/svg+xml',
      },
    ],
  };
}

