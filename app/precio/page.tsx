'use client';

import Link from 'next/link';
import React from 'react';
import { ChefHat, ClipboardList, LineChart } from 'lucide-react';
import Logo from '@/components/Logo';

const highlights = [
  {
    Icon: ChefHat,
    title: 'Pensada para cocina',
    text: 'Pedidos, mermas, escandallos y el día a día del servicio, en el móvil o la tablet.',
  },
  {
    Icon: LineChart,
    title: 'Todo visible',
    text: 'Un solo sitio para ver qué pasa en tu local y decidir con calma.',
  },
  {
    Icon: ClipboardList,
    title: 'Menos caos',
    text: 'APPCC, checklists y producción cuando las necesites, sin duplicar herramientas.',
  },
] as const;

export default function PrecioPage() {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-gradient-to-b from-zinc-50 via-white to-red-50/30 px-4 py-12 sm:px-6">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(211,47,47,0.12),transparent),radial-gradient(ellipse_60%_40%_at_100%_100%,rgba(15,23,42,0.04),transparent)]"
        aria-hidden
      />
      <div className="relative mx-auto w-full max-w-lg">
        <div className="rounded-[1.75rem] border border-zinc-200/80 bg-white/90 p-8 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.18)] ring-1 ring-zinc-100/90 backdrop-blur-sm sm:p-10">
          <div className="flex justify-center">
            <Logo variant="login" className="!h-16 sm:!h-[4.5rem]" />
          </div>
          <h1 className="mt-5 text-balance text-center text-2xl font-black leading-tight tracking-tight text-zinc-900 sm:mt-6 sm:text-3xl">
            Operaciones de cocina, claras y a tu ritmo
          </h1>
          <p className="mt-4 text-pretty text-center text-sm leading-relaxed text-zinc-600 sm:text-base">
            Cuando definamos cómo quieres dar el paso con nosotros, te lo contaremos con detalle. Mientras tanto, entra,
            prueba la demo o habla con tu contacto.
          </p>

          <ul className="mt-8 space-y-4">
            {highlights.map(({ Icon, title, text }) => (
              <li
                key={title}
                className="flex gap-4 rounded-2xl border border-zinc-100 bg-zinc-50/50 p-4 text-left ring-1 ring-zinc-100/80"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#D32F2F]/10 text-[#B91C1C]">
                  <Icon className="h-5 w-5" strokeWidth={2.2} aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-bold text-zinc-900">{title}</p>
                  <p className="mt-1 text-xs leading-snug text-zinc-600 sm:text-sm">{text}</p>
                </div>
              </li>
            ))}
          </ul>

          <Link
            href="/login"
            className="mt-10 flex h-12 w-full items-center justify-center rounded-2xl bg-[#D32F2F] text-sm font-bold text-white shadow-[0_12px_32px_-12px_rgba(185,28,28,0.55)] transition hover:bg-[#B91C1C] active:scale-[0.99]"
          >
            Empezar ahora
          </Link>
          <Link
            href="/onboarding"
            className="mt-4 block text-center text-sm font-semibold text-zinc-600 underline underline-offset-2 hover:text-zinc-900"
          >
            Ver introducción
          </Link>
          <Link href="/" className="mt-2 block text-center text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-700">
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
