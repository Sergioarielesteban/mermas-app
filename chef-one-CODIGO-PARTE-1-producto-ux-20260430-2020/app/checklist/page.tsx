'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { History, ListChecks, Play } from 'lucide-react';
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

export default function ChecklistHubPage() {
  return (
    <div className="space-y-5 pb-10">
      <MermasStyleHero
        slim
        eyebrow="Operaciones"
        title="Check list"
        description="Listas de apertura, cambio de turno, cierre e higiene. Tú defines categorías e ítems; el equipo las marca al momento."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <HubCard
          href="/checklist/ejecutar"
          label="Ejecutar"
          sub="Iniciar una lista hoy o con nota de turno"
          Icon={Play}
        />
        <HubCard href="/checklist/listas" label="Mis listas" sub="Crear y ordenar secciones e ítems" Icon={ListChecks} />
        <HubCard href="/checklist/historial" label="Historial" sub="Últimas ejecuciones por fecha" Icon={History} />
      </div>
    </div>
  );
}
