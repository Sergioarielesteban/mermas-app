import type { Metadata } from 'next';
import MarketingLanding from '@/components/MarketingLanding';

export const metadata: Metadata = {
  title: 'Chef-One | Operaciones de cocina',
  description:
    'Chef One reúne pedidos, inventario, mermas, APPCC y escandallos en una app operativa mobile-first para hostelería.',
  openGraph: {
    title: 'Chef-One — software operativo para hostelería',
    description:
      'Pedidos, inventario, mermas, APPCC y escandallos en una experiencia clara para cocina y gestión.',
    type: 'website',
  },
};

export default function Home() {
  return <MarketingLanding />;
}
