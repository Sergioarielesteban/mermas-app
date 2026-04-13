import type { Metadata } from 'next';
import MarketingLanding from '@/components/MarketingLanding';

export const metadata: Metadata = {
  title: 'Chef-One | SaaS para operaciones de cocina en hostelería — desde 39,90 €/mes',
  description:
    'Controla lo que en cocina casi nadie controla bien: pedidos, mermas, APPCC, inventario y más. Menos de 10 €/semana por local. App profesional para restaurantes, en móvil o tablet.',
  openGraph: {
    title: 'Chef-One — operaciones de cocina',
    description:
      'SaaS para hostelería: pedidos, mermas, APPCC, inventario y módulos claros. 39,90 €/mes por local.',
    type: 'website',
  },
};

export default function Home() {
  return <MarketingLanding />;
}
