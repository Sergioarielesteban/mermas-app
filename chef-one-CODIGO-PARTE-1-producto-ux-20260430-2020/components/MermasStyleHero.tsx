import React from 'react';
import ModuleHeader from '@/components/ModuleHeader';

type Props = {
  eyebrow?: string;
  brandLogo?: boolean;
  title: string;
  tagline?: string;
  description?: string;
  compact?: boolean;
  slim?: boolean;
  compactTitle?: boolean;
  micro?: boolean;
  condensed?: boolean;
  className?: string;
};

/**
 * Compatibilidad: delega en {@link ModuleHeader} (título + línea roja). Ceja y título se unen en una sola frase.
 * Otros campos se ignoran (antes alimentaban variantes y textos bajo el banner).
 */
export default function MermasStyleHero(p: Props) {
  const { eyebrow, title, className = '' } = p;
  const a = eyebrow?.trim();
  const b = title?.trim();
  const line = a && b ? `${a} · ${b}` : a || b || title;
  return <ModuleHeader title={line} className={className} />;
}
