'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Download } from 'lucide-react';

const BRAND = '#D32F2F';

const bullets = [
  'Pedidos controlados',
  'Mermas registradas',
  'APPCC digitalizado',
  'Inventario actualizado',
] as const;

const easeOut: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function MarketingPricingHighlight() {
  const reduceMotion = useReducedMotion();

  return (
    <section
      id="precio"
      className="scroll-mt-[4.5rem] border-t border-slate-200/70 bg-gradient-to-b from-slate-100/90 via-[#f1f3f7] to-white px-4 py-16 sm:scroll-mt-24 sm:px-6 sm:py-20 md:py-28"
      aria-labelledby="precio-impacto-heading"
    >
      <motion.div
        className="mx-auto max-w-2xl"
        initial={reduceMotion ? false : { opacity: 0, y: 36 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px', amount: 0.2 }}
        transition={{
          duration: reduceMotion ? 0.01 : 0.58,
          ease: easeOut,
        }}
      >
        <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white px-6 py-10 shadow-[0_1px_0_rgba(255,255,255,0.95)_inset,0_32px_64px_-32px_rgba(15,23,42,0.18),0_12px_28px_-16px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.04] sm:rounded-[2rem] sm:px-10 sm:py-12 md:px-14 md:py-16">
          <div
            className="pointer-events-none absolute -right-24 top-0 h-64 w-64 rounded-full bg-[#D32F2F]/[0.06] blur-2xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-slate-900/[0.04] blur-2xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-90"
            aria-hidden
          />

          <div className="relative text-center">
            <h2
              id="precio-impacto-heading"
              className="text-balance text-2xl font-bold leading-[1.15] tracking-tight text-slate-900 sm:text-3xl md:text-[2rem] md:leading-tight"
            >
              Menos de lo que te cuestan 2 menús al mes
            </h2>

            <div className="mt-10 sm:mt-12">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Un solo precio por local</p>
              <p className="mt-3 flex flex-wrap items-baseline justify-center gap-x-1 text-5xl font-extrabold tracking-tight sm:text-6xl md:text-7xl">
                <span className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-transparent">
                  39,90&nbsp;€
                </span>
                <span className="text-2xl font-bold text-slate-500 sm:text-3xl md:text-4xl">/mes</span>
              </p>
            </div>

            <p className="mx-auto mt-8 max-w-md text-base font-medium leading-relaxed text-slate-600 sm:text-lg">
              Control total de tu cocina desde una sola app
            </p>

            <ul className="mx-auto mt-10 max-w-sm space-y-3.5 text-left sm:max-w-md">
              {bullets.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm font-medium leading-snug text-slate-700 sm:text-base">
                  <span
                    className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-[#D32F2F]/10 text-[#D32F2F]"
                    aria-hidden
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={2.75} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-slate-100 bg-slate-50/90 px-5 py-4 text-center ring-1 ring-slate-100/80 sm:mt-12 sm:px-6 sm:py-5">
              <p className="flex flex-col items-center gap-2 text-sm font-semibold leading-relaxed text-slate-800 sm:flex-row sm:justify-center sm:gap-2.5 sm:text-[0.9375rem]">
                <Download className="h-5 w-5 shrink-0 text-[#D32F2F]" strokeWidth={2} aria-hidden />
                <span>Toda la información descargable al instante con un solo clic</span>
              </p>
            </div>

            <Link
              href="#solicitar-info"
              className="mt-10 inline-flex h-14 w-full max-w-sm items-center justify-center rounded-2xl text-base font-bold text-white shadow-[0_12px_32px_-8px_rgba(211,47,47,0.45)] transition hover:brightness-105 active:scale-[0.99] sm:mt-12 sm:h-[3.75rem] sm:max-w-xs sm:text-lg"
              style={{ backgroundColor: BRAND }}
            >
              Solicitar información
            </Link>

            <p className="mt-6 text-xs leading-relaxed text-slate-500 sm:text-sm">
              Menos de 10&nbsp;€ a la semana · Sin letra pequeña en la pantalla: condiciones concretas al hablar contigo
            </p>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
