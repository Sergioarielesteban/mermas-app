import type { Metadata } from 'next';
import MarketingLanding from '@/components/MarketingLanding';

export const metadata: Metadata = {
  title: 'Chef-One | Operaciones de cocina — desde 39,90 €/mes por local',
  description:
    'Módulos a tu medida: pedidos, mermas, APPCC (frío, aceite, limpieza), inventario, escandallos y chat. App en móvil y tablet. Desde 39,90 €/mes por local.',
  openGraph: {
    title: 'Chef-One — software para cocina',
    description:
      'Módulos que eliges tú. Pedidos, mermas, APPCC, inventario, escandallos y más. Desde 39,90 €/mes por local.',
    type: 'website',
  },
};

export default function Home() {
  return <MarketingLanding />;
}
