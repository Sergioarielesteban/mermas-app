import type { Metadata } from 'next';
import MarketingLanding from '@/components/MarketingLanding';

export const metadata: Metadata = {
  title: 'Chef-One | SaaS para operaciones de cocina en hostelería — desde 39,90 €/mes',
  description:
    'Controla lo que en cocina casi nadie controla bien: pedidos, mermas, APPCC, inventario y más. Para equipos de cocina y profesionales del sector. Menos de 10 €/semana por local. En móvil o tablet.',
  openGraph: {
    title: 'Chef-One — operaciones de cocina',
    description:
      'SaaS para cocineros y cocinas que quieren trabajar mejor: pedidos, mermas, APPCC, inventario y módulos claros. 39,90 €/mes por local.',
    type: 'website',
  },
};

export default function Home() {
  return <MarketingLanding />;
}
