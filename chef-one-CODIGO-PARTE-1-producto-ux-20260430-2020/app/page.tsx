import type { Metadata } from 'next';
import MarketingLanding from '@/components/MarketingLanding';

export const metadata: Metadata = {
  title: 'Chef-One | Operaciones de cocina — paga solo por lo que necesites',
  description:
    'Módulos a tu medida: pedidos con OCR de albarán, asistente Oído Chef (voz e IA opcional), mermas, APPCC, checklists, producción, inventario, escandallos, comida de personal y chat. App móvil y tablet. Paga solo por lo que necesites.',
  openGraph: {
    title: 'Chef-One — software para cocina',
    description:
      'Pedidos con OCR, Oído Chef, APPCC, checklists, producción, mermas, inventario, escandallos y más. Paga solo por lo que necesites.',
    type: 'website',
  },
};

export default function Home() {
  return <MarketingLanding />;
}
