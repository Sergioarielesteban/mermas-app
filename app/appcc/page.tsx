'use client';

import Link from 'next/link';
import { ChevronLeft, History, Thermometer, Wrench } from 'lucide-react';
import { CHEF_ONE_TAPER_LINE_CLASS } from '@/components/ChefOneGlowLine';
import MermasStyleHero from '@/components/MermasStyleHero';

const LINE = `mx-auto mt-4 w-24 ${CHEF_ONE_TAPER_LINE_CLASS}`;

export default function AppccHubPage() {
  return (
    <div className="space-y-6">
      <Link
        href="/panel"
        className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-[#D32F2F]"
      >
        <ChevronLeft className="h-4 w-4" />
        Panel
      </Link>

      <MermasStyleHero
        eyebrow="APPCC"
        title="Control higiénico"
        description="Temperaturas de neveras y congeladores, registro e historial."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/appcc/temperaturas"
          className="flex flex-col items-center rounded-3xl bg-zinc-50/80 px-6 py-7 text-center ring-1 ring-zinc-200/90 transition hover:bg-white hover:ring-zinc-300"
        >
          <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[#D32F2F]/15 text-[#D32F2F] shadow-inner">
            <Thermometer className="h-7 w-7" strokeWidth={2.1} />
          </div>
          <span className="text-lg font-semibold text-zinc-900">Registrar temperaturas</span>
          <span className="mt-2 text-xs font-medium text-zinc-500">Mañana, tarde y noche</span>
          <span className={`mt-4 ${LINE}`} aria-hidden />
        </Link>

        <Link
          href="/appcc/historial"
          className="flex flex-col items-center rounded-3xl bg-zinc-50/80 px-6 py-7 text-center ring-1 ring-zinc-200/90 transition hover:bg-white hover:ring-zinc-300"
        >
          <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-zinc-200/80 text-zinc-700 shadow-inner">
            <History className="h-7 w-7" strokeWidth={2.1} />
          </div>
          <span className="text-lg font-semibold text-zinc-900">Historial</span>
          <span className="mt-2 text-xs font-medium text-zinc-500">Últimos días con registros</span>
          <span className={`mt-4 ${LINE}`} aria-hidden />
        </Link>

        <Link
          href="/appcc/equipos"
          className="flex flex-col items-center rounded-3xl bg-zinc-50/80 px-6 py-7 text-center ring-1 ring-zinc-200/90 transition hover:bg-white hover:ring-zinc-300 sm:col-span-2"
        >
          <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-zinc-200/80 text-zinc-700 shadow-inner">
            <Wrench className="h-7 w-7" strokeWidth={2.1} />
          </div>
          <span className="text-lg font-semibold text-zinc-900">Gestionar equipos</span>
          <span className="mt-2 text-xs font-medium text-zinc-500">Neveras y congeladores por zona</span>
          <span className={`mt-4 ${LINE}`} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
