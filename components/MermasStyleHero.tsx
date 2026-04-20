import React from 'react';
import ChefOneGlowLine from '@/components/ChefOneGlowLine';
import Logo from '@/components/Logo';

type Props = {
  /** Texto pequeño superior (omitir si `brandLogo`). */
  eyebrow?: string;
  /** Marca con logo PNG en lugar de texto en la ceja. */
  brandLogo?: boolean;
  title: string;
  /** Eslogan bajo la línea roja (p. ej. panel), estilo “claim” / logo. */
  tagline?: string;
  /** Párrafo gris inferior; omitir para banner más corto. */
  description?: string;
  /** Menos padding y márgenes (~25 % menos altura), p. ej. panel de control. */
  compact?: boolean;
  /** ~Mitad de altura que el banner estándar (hub pedidos). */
  slim?: boolean;
  className?: string;
};

/**
 * Banner oscuro compacto: fondo casi negro, título blanco, línea roja sólida.
 */
export default function MermasStyleHero({
  eyebrow,
  brandLogo = false,
  title,
  tagline,
  description,
  compact = false,
  slim = false,
  className = '',
}: Props) {
  const pad = slim
    ? 'px-3 py-2 sm:px-4 sm:py-2.5'
    : compact
      ? 'px-4 py-2 sm:px-5 sm:py-2.5'
      : 'px-4 py-3.5 sm:px-5 sm:py-4';
  const titleMt =
    eyebrow || brandLogo ? (slim ? 'mt-0.5' : compact ? 'mt-0.5' : 'mt-1 sm:mt-1.5') : '';
  const lineMt = slim ? 'mt-1' : compact ? 'mt-1 sm:mt-1.5' : 'mt-2 sm:mt-2.5';
  const taglineMt = slim ? 'mt-1.5 sm:mt-2' : compact ? 'mt-2 sm:mt-2.5' : 'mt-3 sm:mt-3.5';
  const descMt = tagline
    ? slim
      ? 'mt-1.5 sm:mt-2'
      : compact
        ? 'mt-2 sm:mt-2.5'
        : 'mt-3 sm:mt-3.5'
    : slim
      ? 'mt-1'
      : compact
        ? 'mt-1 sm:mt-1.5'
        : 'mt-2 sm:mt-2.5';

  return (
    <section className={`rounded-3xl bg-zinc-950 text-white shadow-xl shadow-zinc-900/20 ${pad} ${className}`}>
      {brandLogo ? (
        <div className="flex justify-center">
          <Logo
            variant="banner"
            className={
              slim
                ? '!h-6 max-w-[min(180px,70vw)] sm:!h-7'
                : compact
                  ? '!h-7 max-w-[min(190px,72vw)] sm:!h-8'
                  : '!h-8 max-w-[min(200px,75vw)] sm:!h-9'
            }
          />
        </div>
      ) : eyebrow ? (
        <h1
          className={`text-center font-semibold uppercase tracking-[0.22em] text-zinc-400 ${
            slim ? 'text-[9px] sm:text-[10px]' : 'text-[10px] sm:text-[11px]'
          }`}
        >
          {eyebrow}
        </h1>
      ) : null}
      <p
        className={`text-center font-semibold uppercase tracking-[0.14em] text-white ${titleMt} ${
          slim ? 'text-sm sm:text-base' : 'text-base sm:text-lg'
        }`}
      >
        {title}
      </p>
      {brandLogo ? null : (
        <ChefOneGlowLine className={`mx-auto ${slim ? 'w-20' : 'w-28'} ${lineMt}`} />
      )}
      {tagline ? (
        <p
          className={`mx-auto max-w-[min(20rem,88vw)] text-center text-[0.8125rem] font-medium leading-snug tracking-wide text-zinc-100 sm:max-w-md sm:text-[0.9375rem] sm:leading-relaxed md:max-w-2xl md:text-base ${taglineMt}`}
        >
          {tagline}
        </p>
      ) : null}
      {description ? (
        <p
          className={`mx-auto max-w-sm text-center text-zinc-400 ${descMt} ${
            slim
              ? 'text-[10px] leading-snug sm:text-[11px]'
              : compact
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
