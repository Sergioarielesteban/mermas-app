import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Can Xampa Mermas',
    short_name: 'Mermas',
    description: 'Gestión de mermas para hostelería',
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
        src: '/logo-can-xampa.png',
        sizes: '1024x1024',
        type: 'image/png',
      },
    ],
  };
}

