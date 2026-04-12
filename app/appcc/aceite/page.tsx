'use client';

import Link from 'next/link';
import { ChevronLeft, Droplet, History, Wrench } from 'lucide-react';
import { CHEF_ONE_TAPER_LINE_CLASS } from '@/components/ChefOneGlowLine';

const LINE_SM = `mx-auto mt-2 w-14 ${CHEF_ONE_TAPER_LINE_CLASS}`;

export default function AppccAceiteHubPage() {
  return (
    <div className="space-y-4">
      <Link
        href="/appcc"
        className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-[#D32F2F]"
      >
        <ChevronLeft className="h-4 w-4" />
        APPCC
      </Link>

      <section className="rounded-2xl border border-zinc-200/90 bg-white px-3 py-4 shadow-sm ring-1 ring-zinc-100 sm:px-4 sm:py-5">
        <h2 className="mb-3 text-center text-base font-bold tracking-tight text-zinc-900 sm:text-lg">
          Cambios de aceite
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-2.5">
          <Link
            href="/appcc/aceite/registro"
            className="flex flex-col items-center rounded-xl bg-zinc-50/90 px-2 py-3 text-center ring-1 ring-zinc-200/80 transition hover:bg-white hover:ring-zinc-300"
          >
            <div className="mb-1.5 grid h-10 w-10 place-items-center rounded-xl bg-[#D32F2F]/12 text-[#D32F2F] shadow-inner">
              <Droplet className="h-5 w-5" strokeWidth={2.1} />
            </div>
            <span className="text-xs font-semibold leading-tight text-zinc-900 sm:text-[0.8125rem]">
              Registrar
            </span>
            <span className="mt-1 line-clamp-2 text-[10px] font-medium leading-snug text-zinc-500">
              Filtrado o cambio por freidora
            </span>
            <span className={`${LINE_SM}`} aria-hidden />
          </Link>

          <Link
            href="/appcc/aceite/historial"
            className="flex flex-col items-center rounded-xl bg-zinc-50/90 px-2 py-3 text-center ring-1 ring-zinc-200/80 transition hover:bg-white hover:ring-zinc-300"
          >
            <div className="mb-1.5 grid h-10 w-10 place-items-center rounded-xl bg-zinc-200/70 text-zinc-700 shadow-inner">
              <History className="h-5 w-5" strokeWidth={2.1} />
            </div>
            <span className="text-xs font-semibold leading-tight text-zinc-900 sm:text-[0.8125rem]">Historial</span>
            <span className="mt-1 line-clamp-2 text-[10px] font-medium leading-snug text-zinc-500">
              Últimos registros de aceite
            </span>
            <span className={`${LINE_SM}`} aria-hidden />
          </Link>

          <Link
            href="/appcc/aceite/equipos"
            className="flex flex-col items-center rounded-xl bg-zinc-50/90 px-2 py-3 text-center ring-1 ring-zinc-200/80 transition hover:bg-white hover:ring-zinc-300"
          >
            <div className="mb-1.5 grid h-10 w-10 place-items-center rounded-xl bg-zinc-200/70 text-zinc-700 shadow-inner">
              <Wrench className="h-5 w-5" strokeWidth={2.1} />
            </div>
            <span className="text-xs font-semibold leading-tight text-zinc-900 sm:text-[0.8125rem]">
              Freidoras
            </span>
            <span className="mt-1 line-clamp-2 text-[10px] font-medium leading-snug text-zinc-500">
              Alta y baja de equipos
            </span>
            <span className={`${LINE_SM}`} aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}
