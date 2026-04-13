import type { Metadata } from 'next';
import MarketingLanding from '@/components/MarketingLanding';

export const metadata: Metadata = {
  title: 'Chef-One | Pedidos, mermas y cocina bajo control — desde 39,90 €/mes',
  description:
    'Menos de 10 €/semana. Pedidos y recepción, mermas y residuos, APPCC e inventario en móvil o tablet. La información que se pierde en WhatsApp y cuadernos, centralizada para jefe de cocina y dueño.',
  openGraph: {
    title: 'Chef-One — operaciones de cocina',
    description:
      'Control operativo para restaurantes: pedidos, mermas, puntos críticos e inventario. 39,90 €/mes.',
    type: 'website',
  },
};

export default function Home() {
  return <MarketingLanding />;
}
