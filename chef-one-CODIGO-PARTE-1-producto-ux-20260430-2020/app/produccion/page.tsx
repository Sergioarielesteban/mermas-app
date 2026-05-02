'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { History, ListTree, Play } from 'lucide-react';
import { CHEF_ONE_TAPER_LINE_CLASS } from '@/components/ChefOneGlowLine';
import MermasStyleHero from '@/components/MermasStyleHero';

const LINE_SM = `mx-auto mt-1.5 w-14 ${CHEF_ONE_TAPER_LINE_CLASS}`;

function HubCard({
  href,
  label,
  sub,
  Icon,
}: {
  href: string;
  label: string;
  sub: string;
  Icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center rounded-2xl border border-zinc-200/90 bg-gradient-to-b from-zinc-50 to-white px-4 py-[1.125rem] text-center shadow-sm ring-1 ring-zinc-100 transition hover:border-[#D32F2F]/35 hover:shadow-md active:scale-[0.99]"
    >
      <div className="mb-1.5 grid h-11 w-11 place-items-center rounded-2xl bg-[#D32F2F]/12 text-[#D32F2F] shadow-inner ring-1 ring-[#D32F2F]/15">
        <Icon className="h-[1.35rem] w-[1.35rem]" strokeWidth={2.1} />
      </div>
      <span className="text-sm font-extrabold tracking-tight text-zinc-900">{label}</span>
      <span className="mt-1 text-[11px] font-medium leading-snug text-zinc-500">{sub}</span>
      <span className={LINE_SM} aria-hidden />
    </Link>
  );
}

export default function ProduccionHubPage() {
  return (
    <div className="space-y-5 pb-10">
      <MermasStyleHero
        eyebrow="Operaciones"
        title="Producción cocina"
        description="Plantillas con bloques de días a tu medida. Cada día ves objetivo, lo hecho y lo que falta por hacer, con el cálculo al momento."
        slim
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <HubCard
          href="/produccion/ejecutar"
          label="Lista del día"
          sub="Elegir plantilla, fecha y rellenar hecho / hacer"
          Icon={Play}
        />
        <HubCard
          href="/produccion/planes"
          label="Plantillas"
          sub="Bloques de días, secciones y objetivos por producto"
          Icon={ListTree}
        />
        <HubCard href="/produccion/historial" label="Historial" sub="Listas cerradas por fecha" Icon={History} />
      </div>
    </div>
  );
}
