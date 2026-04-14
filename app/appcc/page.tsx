'use client';

import Link from 'next/link';
import { BrushCleaning, ChevronLeft, ClipboardList, Droplet, History, Thermometer, Wrench } from 'lucide-react';
import { CHEF_ONE_TAPER_LINE_CLASS } from '@/components/ChefOneGlowLine';
import MermasStyleHero from '@/components/MermasStyleHero';

const LINE_SM = `mx-auto mt-2 w-14 ${CHEF_ONE_TAPER_LINE_CLASS}`;

export default function AppccHubPage() {
  return (
    <div className="space-y-4">
      <MermasStyleHero
        eyebrow="APPCC"
        title="Puntos críticos y control diario"
        description="Temperaturas, aceite y programa de limpieza con trazabilidad para el equipo y para inspecciones."
      />

      <Link
        href="/panel"
        className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-[#D32F2F]"
      >
        <ChevronLeft className="h-4 w-4" />
        Panel
      </Link>

      <section className="rounded-2xl border border-zinc-200/90 bg-white px-3 py-4 shadow-sm ring-1 ring-zinc-100 sm:px-4 sm:py-5">
        <h2 className="mb-3 text-center text-base font-bold tracking-tight text-zinc-900 sm:text-lg">
          Control de temperaturas
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-2.5">
          <Link
            href="/appcc/temperaturas"
            className="flex flex-col items-center rounded-xl bg-zinc-50/90 px-2 py-3 text-center ring-1 ring-zinc-200/80 transition hover:bg-white hover:ring-zinc-300"
          >
            <div className="mb-1.5 grid h-10 w-10 place-items-center rounded-xl bg-[#D32F2F]/12 text-[#D32F2F] shadow-inner">
              <Thermometer className="h-5 w-5" strokeWidth={2.1} />
            </div>
            <span className="text-xs font-semibold leading-tight text-zinc-900 sm:text-[0.8125rem]">
              Registrar temperaturas
            </span>
                       <span className="mt-1 line-clamp-2 text-[10px] font-medium leading-snug text-zinc-500">
              Mañana y noche
            </span>
            <span className={`${LINE_SM}`} aria-hidden />
          </Link>

          <Link
            href="/appcc/historial"
            className="flex flex-col items-center rounded-xl bg-zinc-50/90 px-2 py-3 text-center ring-1 ring-zinc-200/80 transition hover:bg-white hover:ring-zinc-300"
          >
            <div className="mb-1.5 grid h-10 w-10 place-items-center rounded-xl bg-zinc-200/70 text-zinc-700 shadow-inner">
              <History className="h-5 w-5" strokeWidth={2.1} />
            </div>
            <span className="text-xs font-semibold leading-tight text-zinc-900 sm:text-[0.8125rem]">Historial</span>
            <span className="mt-1 line-clamp-2 text-[10px] font-medium leading-snug text-zinc-500">
              Últimos días con registros
            </span>
            <span className={`${LINE_SM}`} aria-hidden />
          </Link>

          <Link
            href="/appcc/equipos"
            className="flex flex-col items-center rounded-xl bg-zinc-50/90 px-2 py-3 text-center ring-1 ring-zinc-200/80 transition hover:bg-white hover:ring-zinc-300"
          >
            <div className="mb-1.5 grid h-10 w-10 place-items-center rounded-xl bg-zinc-200/70 text-zinc-700 shadow-inner">
              <Wrench className="h-5 w-5" strokeWidth={2.1} />
            </div>
            <span className="text-xs font-semibold leading-tight text-zinc-900 sm:text-[0.8125rem]">
              Gestionar equipos
            </span>
            <span className="mt-1 line-clamp-2 text-[10px] font-medium leading-snug text-zinc-500">
              Neveras y congeladores
            </span>
            <span className={`${LINE_SM}`} aria-hidden />
          </Link>
        </div>
      </section>

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
              Registrar aceite
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
            <span className="text-xs font-semibold leading-tight text-zinc-900 sm:text-[0.8125rem]">
              Historial aceite
            </span>
            <span className="mt-1 line-clamp-2 text-[10px] font-medium leading-snug text-zinc-500">
              Registros y PDF
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
              Alta y baja
            </span>
            <span className={`${LINE_SM}`} aria-hidden />
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200/90 bg-white px-3 py-4 shadow-sm ring-1 ring-zinc-100 sm:px-4 sm:py-5">
        <h2 className="mb-3 text-center text-base font-bold tracking-tight text-zinc-900 sm:text-lg">
          Limpieza y mantenimiento
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-2.5">
          <Link
            href="/appcc/limpieza/registro"
            className="flex flex-col items-center rounded-xl bg-zinc-50/90 px-2 py-3 text-center ring-1 ring-zinc-200/80 transition hover:bg-white hover:ring-zinc-300"
          >
            <div className="mb-1.5 grid h-10 w-10 place-items-center rounded-xl bg-[#D32F2F]/12 text-[#D32F2F] shadow-inner">
              <BrushCleaning className="h-5 w-5" strokeWidth={2.1} />
            </div>
            <span className="text-xs font-semibold leading-tight text-zinc-900 sm:text-[0.8125rem]">
              Registrar limpieza
            </span>
            <span className="mt-1 line-clamp-2 text-[10px] font-medium leading-snug text-zinc-500">
              Mañana y noche por tarea
            </span>
            <span className={`${LINE_SM}`} aria-hidden />
          </Link>

          <Link
            href="/appcc/limpieza/historial"
            className="flex flex-col items-center rounded-xl bg-zinc-50/90 px-2 py-3 text-center ring-1 ring-zinc-200/80 transition hover:bg-white hover:ring-zinc-300"
          >
            <div className="mb-1.5 grid h-10 w-10 place-items-center rounded-xl bg-zinc-200/70 text-zinc-700 shadow-inner">
              <History className="h-5 w-5" strokeWidth={2.1} />
            </div>
            <span className="text-xs font-semibold leading-tight text-zinc-900 sm:text-[0.8125rem]">
              Historial limpieza
            </span>
            <span className="mt-1 line-clamp-2 text-[10px] font-medium leading-snug text-zinc-500">
              Registros por día
            </span>
            <span className={`${LINE_SM}`} aria-hidden />
          </Link>

          <Link
            href="/appcc/limpieza/tareas"
            className="flex flex-col items-center rounded-xl bg-zinc-50/90 px-2 py-3 text-center ring-1 ring-zinc-200/80 transition hover:bg-white hover:ring-zinc-300"
          >
            <div className="mb-1.5 grid h-10 w-10 place-items-center rounded-xl bg-zinc-200/70 text-zinc-700 shadow-inner">
              <ClipboardList className="h-5 w-5" strokeWidth={2.1} />
            </div>
            <span className="text-xs font-semibold leading-tight text-zinc-900 sm:text-[0.8125rem]">
              Categorías y tareas
            </span>
            <span className="mt-1 line-clamp-2 text-[10px] font-medium leading-snug text-zinc-500">
              Maquinaria, superficies, cubos…
            </span>
            <span className={`${LINE_SM}`} aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}
