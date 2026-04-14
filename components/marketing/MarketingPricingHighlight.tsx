'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Layers } from 'lucide-react';

const BRAND = '#D32F2F';

const bullets = ['Pedidos y mermas', 'APPCC: frío, aceite y limpieza', 'Inventario y escandallos', 'Chat por local'] as const;

const easeOut: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function MarketingPricingHighlight() {
  const reduceMotion = useReducedMotion();

  return (
    <section
      id="precio"
      className="scroll-mt-[4.5rem] border-t border-slate-200/70 bg-gradient-to-b from-slate-50/95 via-white to-[#f5f6f8] px-4 py-14 sm:scroll-mt-24 sm:px-6 sm:py-20 md:py-24"
      aria-labelledby="precio-impacto-heading"
    >
      <motion.div
        className="mx-auto max-w-2xl"
        initial={reduceMotion ? false : { opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-50px', amount: 0.2 }}
        transition={{
          duration: reduceMotion ? 0.01 : 0.55,
          ease: easeOut,
        }}
      >
        <div className="relative overflow-hidden rounded-[1.65rem] border border-slate-200/90 bg-white px-5 py-9 shadow-[0_28px_64px_-36px_rgba(15,23,42,0.22),0_1px_0_rgba(255,255,255,0.9)_inset] ring-1 ring-slate-900/[0.04] sm:rounded-[2rem] sm:px-9 sm:py-11 md:px-12 md:py-14">
          <div
            className="pointer-events-none absolute -right-20 top-0 h-56 w-56 rounded-full bg-[#D32F2F]/[0.07] blur-2xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-slate-900/[0.04] blur-2xl"
            aria-hidden
          />

          <div className="relative text-center">
            <h2
              id="precio-impacto-heading"
              className="text-balance text-2xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-3xl"
            >
              Precio claro. Tú eliges el alcance.
            </h2>

            <div className="mt-8 sm:mt-10">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Desde</p>
              <p className="mt-2 flex flex-wrap items-baseline justify-center gap-x-2 text-5xl font-extrabold tracking-tight sm:text-6xl md:text-7xl">
                <span className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-transparent">
                  39,90&nbsp;€
                </span>
                <span className="text-2xl font-bold text-slate-500 sm:text-3xl md:text-4xl">/ mes · local</span>
              </p>
            </div>

            <div className="mx-auto mt-6 flex max-w-md items-start justify-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/90 px-4 py-3 text-left ring-1 ring-slate-100/80">
              <Layers className="mt-0.5 h-5 w-5 shrink-0 text-[#D32F2F]" strokeWidth={2} aria-hidden />
              <p className="text-sm font-medium leading-snug text-slate-700">
                Pack modular: incorpora solo los módulos que necesites y amplía cuando toque. Lo ajustamos contigo en la
                puesta en marcha.
              </p>
            </div>

            <ul className="mx-auto mt-8 max-w-sm space-y-2.5 text-left sm:max-w-md">
              {bullets.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm font-medium leading-snug text-slate-700 sm:text-[0.9375rem]">
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

            <Link
              href="#solicitar-info"
              className="mt-9 inline-flex h-14 w-full max-w-sm items-center justify-center rounded-2xl text-base font-bold text-white shadow-[0_14px_36px_-10px_rgba(211,47,47,0.45)] transition hover:brightness-105 active:scale-[0.99] sm:mt-10 sm:max-w-xs"
              style={{ backgroundColor: BRAND }}
            >
              Pedir propuesta
            </Link>

            <p className="mt-5 text-xs leading-relaxed text-slate-500 sm:text-sm">
              Condiciones al detalle hablando contigo · Menos de 10&nbsp;€ a la semana en referencia mensual
            </p>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
