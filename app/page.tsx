import type { Metadata } from 'next';
import MarketingLanding from '@/components/MarketingLanding';

export const metadata: Metadata = {
  title: 'Chef-One | Operaciones de cocina — desde 39,90 €/mes por local',
  description:
    'Módulos a tu medida: pedidos con OCR de albarán, asistente Oído Chef (voz e IA opcional), mermas, APPCC, checklists, producción, inventario, escandallos, comida de personal y chat. App móvil y tablet. Desde 39,90 €/mes por local.',
  openGraph: {
    title: 'Chef-One — software para cocina',
    description:
      'Pedidos con OCR, Oído Chef, APPCC, checklists, producción, mermas, inventario, escandallos y más. Desde 39,90 €/mes por local.',
    type: 'website',
  },
};

export default function Home() {
  return <MarketingLanding />;
}
