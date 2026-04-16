'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ChevronLeft, ClipboardCheck, History, ListChecks, Play } from 'lucide-react';
import { CHEF_ONE_TAPER_LINE_CLASS } from '@/components/ChefOneGlowLine';
import MermasStyleHero from '@/components/MermasStyleHero';

const LINE_SM = `mx-auto mt-2 w-14 ${CHEF_ONE_TAPER_LINE_CLASS}`;

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
      className="flex flex-col items-center rounded-2xl border border-zinc-200/90 bg-gradient-to-b from-zinc-50 to-white px-4 py-5 text-center shadow-sm ring-1 ring-zinc-100 transition hover:border-[#D32F2F]/35 hover:shadow-md active:scale-[0.99]"
    >
      <div className="mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-[#D32F2F]/12 text-[#D32F2F] shadow-inner ring-1 ring-[#D32F2F]/15">
        <Icon className="h-6 w-6" strokeWidth={2.1} />
      </div>
      <span className="text-sm font-extrabold tracking-tight text-zinc-900">{label}</span>
      <span className="mt-1.5 text-[11px] font-medium leading-snug text-zinc-500">{sub}</span>
      <span className={LINE_SM} aria-hidden />
    </Link>
  );
}

export default function ChecklistHubPage() {
  return (
    <div className="space-y-5 pb-10">
      <MermasStyleHero
        eyebrow="Operaciones"
        title="Check list"
        description="Listas de apertura, cambio de turno, cierre e higiene. Tú defines categorías e ítems; el equipo las marca al momento."
        compact
      />

      <Link
        href="/panel"
        className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-[#D32F2F]"
      >
        <ChevronLeft className="h-4 w-4" />
        Panel
      </Link>

      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-center text-xs font-semibold leading-snug text-amber-950 ring-1 ring-amber-100">
        Primera vez: ejecuta{' '}
        <code className="rounded bg-amber-100/90 px-1.5 py-0.5 text-[10px]">supabase-chef-ops-checklist-production.sql</code>{' '}
        en Supabase para crear las tablas.
      </div>

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

      <section className="rounded-2xl border border-zinc-200/90 bg-white px-4 py-4 shadow-sm ring-1 ring-zinc-100">
        <div className="flex items-start gap-3">
          <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#D32F2F]" strokeWidth={2.2} aria-hidden />
          <div>
            <p className="text-sm font-bold text-zinc-900">Nivel pro</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-600">
              Plantillas sugeridas (apertura, cierre, lavabos…) solo rellenan el tipo de contexto; el contenido lo controlas
              tú en «Mis listas». Ideal para auditorías y turnos.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
