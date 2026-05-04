'use client';

import Link from 'next/link';
import {
  BrushCleaning,
  CalendarDays,
  CircleAlert,
  ChevronDown,
  ClipboardList,
  Droplet,
  History,
  Table2,
  Tags,
  Thermometer,
  Wrench,
} from 'lucide-react';
import { CHEF_ONE_TAPER_LINE_CLASS } from '@/components/ChefOneGlowLine';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';

function TemperaturasMainCard() {
  return (
    <Link
      href="/appcc/temperaturas"
      className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-200/90 bg-white px-6 py-7 shadow-sm ring-1 ring-zinc-100 transition hover:shadow-md hover:ring-zinc-200 active:scale-[0.98]"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#D32F2F]/10 shadow-inner">
        <Thermometer className="h-8 w-8 text-[#D32F2F]" strokeWidth={2} />
      </div>
      <div className="text-center">
        <p className="text-base font-bold text-zinc-900">Registrar temperaturas</p>
        <p className="mt-0.5 text-[12px] font-medium text-zinc-400">Mañana y noche · por sector</p>
      </div>
    </Link>
  );
}

const LINE_SM = `mx-auto mt-1 w-14 ${CHEF_ONE_TAPER_LINE_CLASS}`;

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
      className="flex flex-col items-center rounded-xl bg-zinc-50/90 px-2 py-[0.4rem] text-center ring-1 ring-zinc-200/80 transition hover:bg-white hover:ring-zinc-300"
    >
      <div
        className={[
          'mb-0.5 grid h-7 w-7 place-items-center rounded-lg shadow-inner',
          tone === 'red' ? 'bg-[#D32F2F]/12 text-[#D32F2F]' : 'bg-zinc-200/70 text-zinc-700',
        ].join(' ')}
      >
        <Icon className="h-4 w-4" strokeWidth={2.1} />
      </div>
      <span className="text-[11px] font-semibold leading-tight text-zinc-900 sm:text-xs">{label}</span>
      <span className="mt-0.5 line-clamp-1 text-[9px] font-medium leading-snug text-zinc-500">{sub}</span>
      <span className={`${LINE_SM}`} aria-hidden />
    </Link>
  );
}

function ExpandableControlGroup({
  title,
  leadHref,
  leadLabel,
  /** Texto de la mini-tarjeta al desplegar; si no se pasa, reutiliza leadLabel. */
  leadGridLabel,
  leadSub,
  LeadIcon,
  items,
}: {
  title: string;
  leadHref: string;
  leadLabel: string;
  leadGridLabel?: string;
  leadSub: string;
  LeadIcon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  items: GroupItem[];
}) {
  return (
    <details className="rounded-2xl border border-zinc-200/90 bg-white px-2.5 py-[0.55rem] shadow-sm ring-1 ring-zinc-100 sm:px-3 sm:py-[0.7rem]">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <h2 className="mb-1.5 text-center text-sm font-bold tracking-tight text-zinc-900 sm:text-base">{title}</h2>
        <div className="mx-auto max-w-sm rounded-xl bg-zinc-50/90 px-2 py-[0.45rem] text-center ring-1 ring-zinc-200/80 transition hover:bg-white hover:ring-zinc-300">
          <div className="mb-0.5 grid h-8 w-8 place-items-center rounded-lg bg-[#D32F2F]/12 text-[#D32F2F] shadow-inner mx-auto">
            <LeadIcon className="h-4 w-4" strokeWidth={2.1} />
          </div>
          <p className="text-xs font-semibold leading-tight text-zinc-900 sm:text-sm">{leadLabel}</p>
          <p className="mt-0.5 text-[10px] font-medium leading-snug text-zinc-500 sm:text-xs">{leadSub}</p>
          <div className="mt-1.5 flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#D32F2F] sm:text-[11px]">
            Ver opciones
            <ChevronDown className="h-4 w-4" />
          </div>
          <span className={`${LINE_SM}`} aria-hidden />
        </div>
      </summary>

      <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-3 sm:gap-2">
        <GroupMiniCard
          href={leadHref}
          label={leadGridLabel ?? leadLabel}
          sub={leadSub}
          Icon={LeadIcon}
          tone="red"
        />
        {items.map((item) => (
          <GroupMiniCard key={item.href} {...item} />
        ))}
      </div>
    </details>
  );
}

export default function AppccHubPage() {
  const { profileRole } = useAuth();
  const isManager = profileRole === 'manager';

  return (
    <div className="space-y-3">
      <MermasStyleHero slim compactTitle eyebrow="APPCC" title="Puntos críticos y control diario" />

      <TemperaturasMainCard />

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
        title="Carta y alérgenos"
        leadHref={isManager ? '/appcc/carta-alergenos/matriz' : '/appcc/carta-alergenos'}
        leadLabel={isManager ? 'Matriz carta y alérgenos' : 'Resumen de carta'}
        leadSub={isManager ? 'Consulta general (solo lectura)' : 'Estados, revisión y trazabilidad'}
        LeadIcon={Tags}
        items={
          isManager
            ? []
            : [
                { href: '/appcc/carta-alergenos/productos', label: 'Fichas ingrediente', sub: 'Completar alérgenos base', Icon: ClipboardList },
                { href: '/appcc/carta-alergenos/matriz', label: 'Matriz de carta', sub: 'Consulta rápida por alérgeno', Icon: Table2 },
                { href: '/appcc/carta-alergenos/incidencias', label: 'Incidencias', sub: 'Pendientes e incompletos', Icon: CircleAlert },
              ]
        }
      />

      <ExpandableControlGroup
        title="Limpieza y mantenimiento"
        leadHref="/appcc/limpieza/registro"
        leadLabel="Registrar limpieza"
        leadSub="Mañana y noche por tarea"
        LeadIcon={BrushCleaning}
        items={[
          { href: '/appcc/limpieza/tareas', label: 'Categorías y tareas', sub: 'Maquinaria, superficies, cubos…', Icon: ClipboardList },
          { href: '/appcc/limpieza/cronograma', label: 'Cronograma semanal', sub: 'Qué toca cada día', Icon: CalendarDays },
          { href: '/appcc/limpieza/historial', label: 'Historial limpieza', sub: 'Registros por día', Icon: History },
        ]}
      />
    </div>
  );
}
