import React from 'react';
import ChefOneGlowLine from '@/components/ChefOneGlowLine';

type Props = {
  title: string;
  className?: string;
  'aria-label'?: string;
  /** Bloque más bajo (cabeceras compactas dentro de un módulo). */
  dense?: boolean;
};

/**
 * Cabecera única de módulo: fondo oscuro, título centrado (mayúsculas vía CSS), línea roja. Sin subtítulos ni descripciones.
 */
export default function ModuleHeader({
  title,
  className = '',
  dense = false,
  'aria-label': ariaLabel,
}: Props) {
  return (
    <section
      className={[
        'flex flex-col items-center justify-center rounded-2xl border border-white/10',
        'bg-gradient-to-b from-zinc-900 via-zinc-950 to-zinc-950 text-center ring-1 ring-white/[0.07]',
        dense
          ? 'h-11 px-3 shadow-md shadow-black/15'
          : 'h-14 px-4 shadow-lg shadow-black/20',
        className,
      ].join(' ')}
      aria-label={ariaLabel ?? title}
    >
      <p
        className={[
          'font-semibold uppercase tracking-[0.22em] text-zinc-100',
          dense ? 'text-[0.6875rem]' : 'text-[0.8125rem]',
        ].join(' ')}
      >
        {title}
      </p>
      <ChefOneGlowLine className={['mx-auto', dense ? 'mt-1 w-11' : 'mt-1.5 w-[5.25rem]'].join(' ')} />
    </section>
  );
}
