import React from 'react';
import ChefOneGlowLine from '@/components/ChefOneGlowLine';

type Props = {
  /** Título visible y accesible (por defecto: registros de temperatura). */
  title?: string;
};

/**
 * Banner corto solo título + línea roja (módulo APPCC: temperaturas, aceite, etc.).
 */
export default function AppccCompactHero({ title = 'Registros de temperatura' }: Props) {
  return (
    <section
      className="rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900 via-zinc-950 to-zinc-950 px-4 py-2 text-center shadow-lg shadow-black/20 ring-1 ring-white/[0.07]"
      aria-label={title}
    >
      <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.22em] text-zinc-100">
        {title}
      </p>
      <ChefOneGlowLine className="mx-auto mt-1.5 w-[5.25rem]" />
    </section>
  );
}
