/** Evita HTML/RSC del panel congelado en CDN o caché intermedia. */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return children;
}
