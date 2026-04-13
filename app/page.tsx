import type { Metadata } from 'next';
import MarketingLanding from '@/components/MarketingLanding';

export const metadata: Metadata = {
  title: 'Chef-One | Gestión operativa para cocinas y restaurantes',
  description:
    'Inventario valorado, mermas, APPCC (temperaturas, aceite), pedidos y panel de control. Toda la gestión de tu cocina, en la palma de tu mano.',
  openGraph: {
    title: 'Chef-One',
    description:
      'Inventario, mermas, APPCC y pedidos en una sola app para tu equipo y tus locales.',
    type: 'website',
  },
};

export default function Home() {
  return <MarketingLanding />;
}
