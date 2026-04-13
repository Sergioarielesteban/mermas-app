'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

const BRAND = '#D32F2F';

function DeviceMockup() {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className="relative mx-auto w-full max-w-[280px] sm:max-w-[320px]"
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.65, ease: [0.22, 1, 0.36, 1], delay: reduceMotion ? 0 : 0.12 }}
    >
      {/* Tablet hint behind */}
      <div
        className="absolute -right-4 top-8 z-0 hidden h-[340px] w-[220px] rounded-[1.75rem] border border-stone-200/90 bg-gradient-to-br from-stone-100 to-stone-200/80 shadow-lg sm:block sm:-right-8 sm:top-10 sm:h-[380px] sm:w-[240px]"
        aria-hidden
      />
      {/* Phone */}
      <div
        className="relative z-10 mx-auto rounded-[2.25rem] border-[3px] border-stone-800/90 bg-stone-900 p-2 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.06)_inset]"
        style={{ transform: 'translateZ(0)' }}
      >
        <div className="overflow-hidden rounded-[1.85rem] bg-gradient-to-b from-stone-50 to-white ring-1 ring-stone-200/80">
          {/* status */}
          <div className="flex h-7 items-center justify-center gap-1 bg-stone-900 px-6 pt-1">
            <span className="h-1 w-10 rounded-full bg-stone-700" />
          </div>
          {/* app chrome */}
          <div className="border-b border-stone-100 bg-white px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="h-2 w-16 rounded-full bg-stone-200" />
              <div className="h-7 w-7 rounded-lg bg-[#D32F2F]/12 ring-1 ring-[#D32F2F]/20" />
            </div>
          </div>
          <div className="space-y-2.5 p-3.5 pb-6">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl border border-stone-100 bg-white px-3 py-2.5 shadow-sm"
              >
                <div
                  className={`h-10 w-10 shrink-0 rounded-lg ${i === 1 ? 'bg-rose-100' : i === 2 ? 'bg-amber-50' : 'bg-emerald-50/80'}`}
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-2.5 w-[72%] max-w-[140px] rounded-full bg-stone-200" />
                  <div className="h-2 w-[45%] rounded-full bg-stone-100" />
                </div>
                <div className="h-6 w-10 rounded-md bg-stone-100" />
              </div>
            ))}
            <div className="mt-3 flex gap-2">
              <div className="h-9 flex-1 rounded-xl bg-[#D32F2F] shadow-md shadow-rose-900/15" />
              <div className="h-9 w-14 rounded-xl bg-stone-100" />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function MarketingHero() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative overflow-hidden border-b border-stone-200/50 bg-gradient-to-b from-white via-[#faf9f8] to-[#f3f4f6] px-4 pb-16 pt-10 sm:px-6 sm:pb-24 sm:pt-14">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(211,47,47,0.09),transparent),radial-gradient(ellipse_60%_40%_at_100%_50%,rgba(15,23,42,0.04),transparent)]"
        aria-hidden
      />
      <div className="relative mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div className="text-center lg:text-left">
          <motion.p
            className="inline-flex items-center gap-2 rounded-full border border-stone-200/90 bg-white/80 px-3 py-1.5 text-xs font-semibold text-stone-600 shadow-sm backdrop-blur-sm"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Sparkles className="h-3.5 w-3.5 text-[#D32F2F]" aria-hidden />
            Operaciones de cocina, sin perder el hilo
          </motion.p>
          <motion.h1
            className="mt-6 text-balance text-3xl font-bold leading-[1.12] tracking-tight text-stone-900 sm:text-4xl sm:leading-[1.1] lg:text-[2.75rem]"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: reduceMotion ? 0 : 0.05 }}
          >
            Controla lo que en cocina{' '}
            <span className="relative inline-block">
              <span className="relative z-10 bg-gradient-to-r from-[#D32F2F] to-[#b71c1c] bg-clip-text font-extrabold text-transparent">
                casi nadie controla bien
              </span>
              <span
                className="absolute -bottom-1 left-0 right-0 h-3 rounded-sm bg-rose-100/90 -z-0 sm:h-3.5"
                aria-hidden
              />
            </span>
          </motion.h1>
          <motion.p
            className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-stone-600 sm:text-lg lg:mx-0"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: reduceMotion ? 0 : 0.1 }}
          >
            Chef-One concentra pedidos, mermas, APPCC e inventario en una herramienta seria,{' '}
            <strong className="font-semibold text-stone-800">diseñada para el día a día de cualquier equipo de cocina</strong>.
            Menos errores, menos información perdida, más claridad cuando más lo necesitas.
          </motion.p>
          <motion.div
            className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center lg:justify-start"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: reduceMotion ? 0 : 0.15 }}
          >
            <Link
              href="#solicitar-info"
              className="inline-flex h-12 items-center justify-center rounded-2xl px-8 text-sm font-bold text-white shadow-[0_8px_24px_-6px_rgba(211,47,47,0.45)] transition hover:brightness-105 active:scale-[0.99]"
              style={{ backgroundColor: BRAND }}
            >
              Solicitar información
            </Link>
            <a
              href="#modulos"
              className="inline-flex h-12 items-center justify-center rounded-2xl border-2 border-stone-200 bg-white/90 px-8 text-sm font-bold text-stone-800 shadow-sm backdrop-blur-sm transition hover:border-stone-300 hover:bg-white"
            >
              Ver módulos
            </a>
          </motion.div>
        </div>
        <DeviceMockup />
      </div>
    </section>
  );
}
