'use client';

import Link from 'next/link';
import { BrushCleaning, ChevronDown, ChevronLeft, ClipboardList, Droplet, History, Thermometer, Wrench } from 'lucide-react';
import { CHEF_ONE_TAPER_LINE_CLASS } from '@/components/ChefOneGlowLine';
import MermasStyleHero from '@/components/MermasStyleHero';

const LINE_SM = `mx-auto mt-2 w-14 ${CHEF_ONE_TAPER_LINE_CLASS}`;

type GroupItem = {
  href: string;
  label: string;
  sub: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  tone?: 'red' | 'zinc';
};

function GroupMiniCard({ href, label, sub, Icon, tone = 'zinc' }: GroupItem) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center rounded-xl bg-zinc-50/90 px-2 py-3 text-center ring-1 ring-zinc-200/80 transition hover:bg-white hover:ring-zinc-300"
    >
      <div
        className={[
          'mb-1.5 grid h-10 w-10 place-items-center rounded-xl shadow-inner',
          tone === 'red' ? 'bg-[#D32F2F]/12 text-[#D32F2F]' : 'bg-zinc-200/70 text-zinc-700',
        ].join(' ')}
      >
        <Icon className="h-5 w-5" strokeWidth={2.1} />
      </div>
      <span className="text-xs font-semibold leading-tight text-zinc-900 sm:text-[0.8125rem]">{label}</span>
      <span className="mt-1 line-clamp-2 text-[10px] font-medium leading-snug text-zinc-500">{sub}</span>
      <span className={`${LINE_SM}`} aria-hidden />
    </Link>
  );
}

function ExpandableControlGroup({
  title,
  leadHref,
  leadLabel,
  leadSub,
  LeadIcon,
  items,
}: {
  title: string;
  leadHref: string;
  leadLabel: string;
  leadSub: string;
  LeadIcon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  items: GroupItem[];
}) {
  return (
    <details className="rounded-2xl border border-zinc-200/90 bg-white px-3 py-4 shadow-sm ring-1 ring-zinc-100 sm:px-4 sm:py-5">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <h2 className="mb-3 text-center text-base font-bold tracking-tight text-zinc-900 sm:text-lg">{title}</h2>
        <div className="mx-auto max-w-sm rounded-xl bg-zinc-50/90 px-3 py-3 text-center ring-1 ring-zinc-200/80 transition hover:bg-white hover:ring-zinc-300">
          <div className="mb-1.5 grid h-10 w-10 place-items-center rounded-xl bg-[#D32F2F]/12 text-[#D32F2F] shadow-inner mx-auto">
            <LeadIcon className="h-5 w-5" strokeWidth={2.1} />
          </div>
          <p className="text-sm font-semibold leading-tight text-zinc-900">{leadLabel}</p>
          <p className="mt-1 text-xs font-medium leading-snug text-zinc-500">{leadSub}</p>
          <div className="mt-3 flex items-center justify-center gap-1 text-[11px] font-bold uppercase tracking-wide text-[#D32F2F]">
            Ver opciones
            <ChevronDown className="h-4 w-4" />
          </div>
          <span className={`${LINE_SM}`} aria-hidden />
        </div>
      </summary>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-2.5">
        <GroupMiniCard href={leadHref} label={leadLabel} sub={leadSub} Icon={LeadIcon} tone="red" />
        {items.map((item) => (
          <GroupMiniCard key={item.href} {...item} />
        ))}
      </div>
    </details>
  );
}

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

      <ExpandableControlGroup
        title="Control de temperaturas"
        leadHref="/appcc/temperaturas"
        leadLabel="Registrar temperaturas"
        leadSub="Mañana y noche"
        LeadIcon={Thermometer}
        items={[
          { href: '/appcc/equipos', label: 'Gestionar equipos', sub: 'Neveras y congeladores', Icon: Wrench },
          { href: '/appcc/historial', label: 'Historial', sub: 'Últimos días con registros', Icon: History },
        ]}
      />

      <ExpandableControlGroup
        title="Cambios de aceite"
        leadHref="/appcc/aceite/registro"
        leadLabel="Registrar aceite"
        leadSub="Filtrado o cambio por freidora"
        LeadIcon={Droplet}
        items={[
          { href: '/appcc/aceite/equipos', label: 'Freidoras', sub: 'Alta y baja', Icon: Wrench },
          { href: '/appcc/aceite/historial', label: 'Historial aceite', sub: 'Registros y PDF', Icon: History },
        ]}
      />

      <ExpandableControlGroup
        title="Limpieza y mantenimiento"
        leadHref="/appcc/limpieza/registro"
        leadLabel="Registrar limpieza"
        leadSub="Mañana y noche por tarea"
        LeadIcon={BrushCleaning}
        items={[
          { href: '/appcc/limpieza/tareas', label: 'Categorías y tareas', sub: 'Maquinaria, superficies, cubos…', Icon: ClipboardList },
          { href: '/appcc/limpieza/historial', label: 'Historial limpieza', sub: 'Registros por día', Icon: History },
        ]}
      />
    </div>
  );
}
