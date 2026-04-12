import React from 'react';
import ChefOneGlowLine from '@/components/ChefOneGlowLine';

type Props = {
  /** Texto pequeño superior (p. ej. CHEF-ONE en panel). */
  eyebrow?: string;
  title: string;
  /** Eslogan bajo la línea roja (p. ej. panel), estilo “claim” / logo. */
  tagline?: string;
  description: string;
  className?: string;
};

/**
 * Banner oscuro compacto: fondo casi negro, título blanco, línea roja sólida.
 */
export default function MermasStyleHero({ eyebrow, title, tagline, description, className = '' }: Props) {
  return (
    <section
      className={`rounded-3xl bg-zinc-950 px-4 py-3.5 text-white shadow-xl shadow-zinc-900/20 sm:px-5 sm:py-4 ${className}`}
    >
      {eyebrow ? (
        <h1 className="text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400 sm:text-[11px]">
          {eyebrow}
        </h1>
      ) : null}
      <p
        className={`text-center text-base font-semibold uppercase tracking-[0.14em] text-white sm:text-lg ${eyebrow ? 'mt-1 sm:mt-1.5' : ''}`}
      >
        {title}
      </p>
      <ChefOneGlowLine className="mx-auto mt-2 w-28 sm:mt-2.5" />
      {tagline ? (
        <p className="mx-auto mt-3 max-w-[min(20rem,88vw)] text-center text-[0.8125rem] font-medium leading-snug tracking-wide text-zinc-100 sm:mt-3.5 sm:max-w-md sm:text-[0.9375rem] sm:leading-relaxed">
          {tagline}
        </p>
      ) : null}
      <p
        className={`mx-auto max-w-sm text-center text-xs leading-snug text-zinc-400 sm:text-sm sm:leading-relaxed ${tagline ? 'mt-3 sm:mt-3.5' : 'mt-2 sm:mt-2.5'}`}
      >
        {description}
      </p>
    </section>
  );
}
