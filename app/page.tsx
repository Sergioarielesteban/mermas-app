import type { Metadata } from 'next';
import MarketingLanding from '@/components/MarketingLanding';

export const metadata: Metadata = {
  title: 'Chef-One | Software modular para cocina real',
  description:
    'Menos caos en servicio y mas control operativo: pedidos con OCR de albaran, APPCC, mermas, inventario, escandallos, produccion, checklists y chat incluido. Base 29 EUR + packs modulares.',
  openGraph: {
    title: 'Chef-One - herramienta hecha para cocina',
    description:
      'Software premium para hosteleria real: OCR de albaranes, ayudante IA sobre tus datos y estructura modular por packs.',
    type: 'website',
  },
};

export default function Home() {
  return <MarketingLanding />;
}
