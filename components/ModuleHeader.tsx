import React from 'react';
import ChefOneGlowLine from '@/components/ChefOneGlowLine';

type Props = {
  title: string;
  className?: string;
  'aria-label'?: string;
};

/**
 * Cabecera única de módulo: fondo oscuro, título centrado (mayúsculas vía CSS), línea roja. Sin subtítulos ni descripciones.
 */
export default function ModuleHeader({ title, className = '', 'aria-label': ariaLabel }: Props) {
  return (
    <section
      className={[
        'flex h-14 flex-col items-center justify-center rounded-2xl border border-white/10',
        'bg-gradient-to-b from-zinc-900 via-zinc-950 to-zinc-950 text-center shadow-lg shadow-black/20 ring-1 ring-white/[0.07]',
        'px-4',
        className,
      ].join(' ')}
      aria-label={ariaLabel ?? title}
    >
      <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.22em] text-zinc-100">{title}</p>
      <ChefOneGlowLine className="mx-auto mt-1.5 w-[5.25rem]" />
    </section>
  );
}
