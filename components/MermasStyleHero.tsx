import React from 'react';
import ChefOneGlowLine from '@/components/ChefOneGlowLine';

type Props = {
  /** Texto pequeño superior; omitir para no mostrar fila (evita duplicar marca). */
  eyebrow?: string;
  title: string;
  description: string;
  className?: string;
};

/**
 * Hero claro: fondo blanco, título oscuro y línea roja sangre con forma/halo (como panel).
 */
export default function MermasStyleHero({ eyebrow, title, description, className = '' }: Props) {
  return (
    <section
      className={`rounded-3xl bg-white px-4 py-3.5 text-zinc-900 shadow-sm ring-1 ring-zinc-200/90 sm:px-5 sm:py-4 ${className}`}
    >
      {eyebrow ? (
        <h1 className="text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500 sm:text-[11px]">
          {eyebrow}
        </h1>
      ) : null}
      <p
        className={`text-center text-base font-semibold uppercase tracking-[0.14em] text-zinc-900 sm:text-lg ${eyebrow ? 'mt-1 sm:mt-1.5' : ''}`}
      >
        {title}
      </p>
      <ChefOneGlowLine className="mt-2.5 max-w-[220px] sm:mt-3" />
      <p className="mx-auto mt-2 max-w-sm text-center text-xs leading-snug text-zinc-600 sm:mt-2.5 sm:text-sm sm:leading-relaxed">
        {description}
      </p>
    </section>
  );
}
