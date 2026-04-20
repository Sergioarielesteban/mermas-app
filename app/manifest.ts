import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Chef-One',
    short_name: 'Chef-One',
    description: 'Gestión operativa para restaurantes',
    /** Al abrir desde el icono instalado: entra a la app, no a la landing pública en `/`. */
    start_url: '/login',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#d32f2f',
    orientation: 'portrait',
    icons: [
      {
        src: '/logo-chef-one.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/logo-chef-one.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/logo-chef-one.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}

