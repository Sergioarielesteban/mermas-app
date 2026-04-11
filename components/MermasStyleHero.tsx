import React from 'react';

type Props = {
  /** Texto pequeño superior; omitir para no mostrar fila (evita duplicar marca). */
  eyebrow?: string;
  title: string;
  description: string;
  className?: string;
};

/**
 * Hero oscuro compacto (misma escala que Mermas en /dashboard): zinc-950, tipografía y línea roja.
 */
export default function MermasStyleHero({ eyebrow, title, description, className = '' }: Props) {
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
      <span className="mx-auto mt-2 block h-[2px] w-28 bg-[#D32F2F] sm:mt-2.5" aria-hidden />
      <p className="mx-auto mt-2 max-w-sm text-center text-xs leading-snug text-zinc-400 sm:mt-2.5 sm:text-sm sm:leading-relaxed">
        {description}
      </p>
    </section>
  );
}
