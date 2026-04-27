import ModuleHeader from '@/components/ModuleHeader';

type Props = {
  title?: string;
  /** @deprecated Ignorado; el banner es siempre el estándar único (ModuleHeader). */
  dense?: boolean;
};

/**
 * Alias de {@link ModuleHeader} (módulos APPCC). Misma altura y estilo en toda la app.
 */
export default function AppccCompactHero(p: Props) {
  return <ModuleHeader title={p.title ?? 'Registros de temperatura'} />;
}
