import React from 'react';
import ChefOneGlowLine from '@/components/ChefOneGlowLine';

type Props = {
  /** Texto pequeño superior (p. ej. CHEF-ONE en panel). */
  eyebrow?: string;
  title: string;
  /** Eslogan bajo la línea roja (p. ej. panel), estilo “claim” / logo. */
  tagline?: string;
  /** Párrafo gris inferior; omitir para banner más corto. */
  description?: string;
  /** Menos padding y márgenes (~25 % menos altura), p. ej. panel de control. */
  compact?: boolean;
  className?: string;
};

/**
 * Banner oscuro compacto: fondo casi negro, título blanco, línea roja sólida.
 */
export default function MermasStyleHero({
  eyebrow,
  title,
  tagline,
  description,
  compact = false,
  className = '',
}: Props) {
  const pad = compact ? 'px-4 py-2 sm:px-5 sm:py-2.5' : 'px-4 py-3.5 sm:px-5 sm:py-4';
  const titleMt = eyebrow ? (compact ? 'mt-0.5' : 'mt-1 sm:mt-1.5') : '';
  const lineMt = compact ? 'mt-1 sm:mt-1.5' : 'mt-2 sm:mt-2.5';
  const taglineMt = compact ? 'mt-2 sm:mt-2.5' : 'mt-3 sm:mt-3.5';
  const descMt = tagline
    ? compact
      ? 'mt-2 sm:mt-2.5'
      : 'mt-3 sm:mt-3.5'
    : compact
      ? 'mt-1 sm:mt-1.5'
      : 'mt-2 sm:mt-2.5';

  return (
    <section className={`rounded-3xl bg-zinc-950 text-white shadow-xl shadow-zinc-900/20 ${pad} ${className}`}>
      {eyebrow ? (
        <h1 className="text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400 sm:text-[11px]">
          {eyebrow}
        </h1>
      ) : null}
      <p className={`text-center text-base font-semibold uppercase tracking-[0.14em] text-white sm:text-lg ${titleMt}`}>
        {title}
      </p>
      <ChefOneGlowLine className={`mx-auto w-28 ${lineMt}`} />
      {tagline ? (
        <p
          className={`mx-auto max-w-[min(20rem,88vw)] text-center text-[0.8125rem] font-medium leading-snug tracking-wide text-zinc-100 sm:max-w-md sm:text-[0.9375rem] sm:leading-relaxed ${taglineMt}`}
        >
          {tagline}
        </p>
      ) : null}
      {description ? (
        <p
          className={`mx-auto max-w-sm text-center text-zinc-400 ${descMt} ${
            compact
              ? 'text-[11px] leading-snug sm:text-xs sm:leading-snug'
              : 'text-xs leading-snug sm:text-sm sm:leading-relaxed'
          }`}
        >
          {description}
        </p>
      ) : null}
    </section>
  );
}
