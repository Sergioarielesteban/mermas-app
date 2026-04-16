'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Factory, History, ListTree, Play } from 'lucide-react';
import { CHEF_ONE_TAPER_LINE_CLASS } from '@/components/ChefOneGlowLine';
import { ModuleBackLink, ModulePageShell } from '@/components/ModulePageShell';
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
      className="flex flex-col items-center rounded-2xl border border-zinc-200/90 bg-gradient-to-b from-zinc-50 to-white px-4 py-5 text-center shadow-[0_16px_40px_-20px_rgba(0,0,0,0.15)] ring-1 ring-black/[0.04] transition hover:border-[#D32F2F]/35 hover:shadow-lg active:scale-[0.99]"
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

export default function ProduccionHubPage() {
  return (
    <ModulePageShell contentClassName="space-y-5">
      <ModuleBackLink />

      <MermasStyleHero
        eyebrow="Operaciones"
        title="Producción"
        tagline="Planes por zonas y cadencia: tu cuarto frío u horno, organizado."
        description="Planes por cadencia (diaria, semanal…), zonas que tú nombras y tareas bajo cada zona. Independiente de Cocina central."
        compact
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <HubCard
          href="/produccion/ejecutar"
          label="Ejecutar"
          sub="Arrancar un plan con fecha y etiqueta de periodo"
          Icon={Play}
        />
        <HubCard href="/produccion/planes" label="Mis planes" sub="Zonas, tareas y cadencia" Icon={ListTree} />
        <HubCard href="/produccion/historial" label="Historial" sub="Últimas corridas de producción" Icon={History} />
      </div>

      <section className="rounded-2xl border border-zinc-200/90 bg-white px-4 py-4 shadow-[0_16px_40px_-20px_rgba(0,0,0,0.1)] ring-1 ring-black/[0.04]">
        <div className="flex items-start gap-3">
          <Factory className="mt-0.5 h-5 w-5 shrink-0 text-[#D32F2F]" strokeWidth={2.2} aria-hidden />
          <div>
            <p className="text-sm font-bold text-zinc-900">Nivel premium</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-600">
              Ordena por verduras, cuarto frío, quesos o elaborados: los nombres y las tareas los defines tú. Ideal para
              delegar y auditar sin mezclar con el módulo de Cocina central.
            </p>
          </div>
        </div>
      </section>
    </ModulePageShell>
  );
}
