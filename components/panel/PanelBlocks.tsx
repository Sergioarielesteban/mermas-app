'use client';

/**
 * Renderers de cada bloque configurable del Panel de Control.
 *
 * Cada renderer es un componente pequeño que consume `usePanelData()` y
 * `useAuth()` para decidir qué pintar. Devuelve `null` cuando el bloque no
 * tiene contenido relevante (p. ej. usuario sin permiso, agenda vacía, etc.).
 *
 * `PANEL_BLOCK_RENDERERS` mapea cada `PanelBlockId` a su componente. Esto
 * permite que `OperationalDayHome` itere sobre los bloques visibles y los
 * renderice por id sin importar nada manualmente.
 */

import Link from 'next/link';
import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bell,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Calculator,
  Droplets,
  Factory,
  ListChecks,
  MessageCircle,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Thermometer,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import PedidosAgendaTodayCard from '@/components/pedidos/PedidosAgendaTodayCard';
import { usePanelData } from '@/components/panel/PanelDataProvider';
import { buildPanelGreetingParts } from '@/lib/panel-greeting';
import type { PanelBlockId } from '@/lib/panel/panel-blocks';

type BlockRenderer = React.ComponentType;

/* ────────────────────────────────────────────────────────────────────────── */
/*  Tarjetas reutilizables                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

function PriorityRowCard(props: {
  title: string;
  sub: string;
  badge?: string | null;
  badgeClass?: string;
  iconBg: string;
  href: string;
  blocked?: boolean;
  Icon: LucideIcon;
  lines?: string[];
  layout?: 'default' | 'shorter';
}) {
  const {
    title,
    sub,
    badge,
    badgeClass,
    iconBg,
    href,
    blocked,
    Icon,
    lines = [],
    layout = 'default',
  } = props;
  const short = layout === 'shorter';
  return (
    <Link
      href={blocked ? '/planes' : href}
      className={[
        'flex items-stretch rounded-3xl bg-white shadow-sm ring-1 ring-zinc-200/80 transition-transform active:scale-[0.99]',
        short ? 'gap-2.5 p-3' : 'gap-3 p-3.5',
        blocked ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div
        className={[
          'grid shrink-0 place-items-center rounded-2xl ring-1 ring-white/60',
          short ? 'h-11 w-11' : 'h-12 w-12',
          iconBg,
        ].join(' ')}
      >
        <Icon className={short ? 'h-5 w-5' : 'h-6 w-6'} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={[
            'font-serif font-normal leading-tight text-zinc-900',
            short ? 'text-[15px]' : 'text-[16px]',
          ].join(' ')}
        >
          {title}
        </p>
        <p
          className={[
            'text-zinc-500',
            short ? 'mt-px text-[11px]' : 'mt-0.5 text-[12px]',
          ].join(' ')}
        >
          {sub}
        </p>
        {lines.length > 0 ? (
          <ul className={short ? 'mt-1.5 space-y-0.5' : 'mt-2 space-y-0.5'}>
            {lines.map((line) => (
              <li
                key={line}
                className={short ? 'text-[10px] text-zinc-600' : 'text-[11px] text-zinc-600'}
              >
                · {line}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between gap-1">
        {badge ? (
          <span
            className={[
              'rounded-full font-bold uppercase tracking-wide ring-1',
              short ? 'px-1.5 py-px text-[8px]' : 'px-2 py-0.5 text-[9px]',
              badgeClass ?? 'bg-zinc-100 text-zinc-700 ring-zinc-200',
            ].join(' ')}
          >
            {badge}
          </span>
        ) : (
          <span />
        )}
        <ChevronRight className={short ? 'h-4 w-4 text-zinc-300' : 'h-5 w-5 text-zinc-300'} aria-hidden />
      </div>
    </Link>
  );
}

/** Tarjeta cuadrada compacta: 3 por fila en mobile, mosaico tipo iOS widgets. */
function PrioritySquareCard(props: {
  title: string;
  sub?: string;
  badge?: string | null;
  badgeClass?: string;
  iconBg: string;
  href: string;
  blocked?: boolean;
  Icon: LucideIcon;
  /** Si es true, la tarjeta se tinta de rojo (novedad / hay que mirarla). */
  alert?: boolean;
}) {
  const { title, sub, badge, badgeClass, iconBg, href, blocked, Icon, alert } = props;
  return (
    <Link
      href={blocked ? '/planes' : href}
      className={[
        'relative flex h-full min-h-[96px] flex-col rounded-2xl p-2.5 shadow-sm ring-1 transition-transform active:scale-[0.99]',
        alert ? 'bg-red-50 ring-red-200' : 'bg-white ring-zinc-200/80',
        blocked ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div
        className={[
          'grid h-8 w-8 place-items-center rounded-lg ring-1 ring-white/60',
          alert ? 'bg-red-100 text-red-700' : iconBg,
        ].join(' ')}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <p
        className={[
          'mt-1.5 font-serif text-[12px] font-normal leading-tight',
          alert ? 'text-red-900' : 'text-zinc-900',
        ].join(' ')}
      >
        {title}
      </p>
      {sub ? (
        <p
          className={[
            'mt-0.5 line-clamp-2 text-[9.5px] leading-snug',
            alert ? 'text-red-700/80' : 'text-zinc-500',
          ].join(' ')}
        >
          {sub}
        </p>
      ) : null}
      {badge ? (
        <span
          className={[
            'absolute right-1.5 top-1.5 grid min-h-[16px] min-w-[16px] place-items-center rounded-full px-1 text-[9px] font-bold uppercase tracking-wide ring-1',
            badgeClass ?? 'bg-zinc-100 text-zinc-700 ring-zinc-200',
          ].join(' ')}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Bloques                                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

function BlockPedidosAgenda() {
  const { agenda, perms, localId } = usePanelData();
  if (!localId || !perms.showPedidos) return null;
  if (!agenda.showCard) return null;
  return (
    <section id="panel-agenda-pedidos" className="scroll-mt-28">
      <PedidosAgendaTodayCard
        loading={agenda.loading}
        mandatoryRows={agenda.mandatoryRows}
        reviewSupplierGroups={agenda.reviewSupplierGroups}
        showAgendaCompletadaMicro={agenda.showAgendaCompletadaMicro}
        localId={localId}
        ymd={agenda.ymd}
        onAgendaAction={agenda.refresh}
      />
    </section>
  );
}

function BlockPedidosLleganHoy() {
  const { kpi, perms } = usePanelData();
  const pedidosLleganHoy = kpi.pedidosHoy ?? 0;
  const blocked = !perms.showPedidos || perms.isBlockedByPlan('pedidos');
  return (
    <PrioritySquareCard
      title="Recibir pedidos de hoy"
      sub={
        kpi.loading
          ? 'Cargando…'
          : pedidosLleganHoy === 0
            ? 'Nada previsto'
            : `${pedidosLleganHoy} llegada${pedidosLleganHoy === 1 ? '' : 's'}`
      }
      badge={pedidosLleganHoy > 0 ? String(pedidosLleganHoy) : null}
      badgeClass="bg-red-600 text-white ring-red-500"
      iconBg="bg-red-100 text-red-700"
      href="/pedidos?recibir=hoy"
      blocked={blocked}
      Icon={ShoppingCart}
    />
  );
}

function BlockTemperaturas() {
  const { kpi, perms } = usePanelData();
  const blocked = perms.isBlockedByPlan('appcc');
  const tempNeeds = kpi.tempDueSlots.length > 0 && !blocked;
  return (
    <PrioritySquareCard
      title="Temperaturas"
      sub={kpi.loading ? 'Cargando…' : tempNeeds ? 'Registros pendientes' : 'Al día'}
      badge={tempNeeds ? 'PEND.' : null}
      badgeClass="bg-amber-100 text-amber-900 ring-amber-200"
      iconBg="bg-amber-100 text-amber-800"
      href="/appcc/temperaturas"
      blocked={blocked}
      Icon={Thermometer}
    />
  );
}

function BlockAceites() {
  const { kpi, perms } = usePanelData();
  const blocked = perms.isBlockedByPlan('appcc');
  const needsReview = !blocked && !kpi.loading && kpi.oilFryersActive > 0 && !kpi.oilHadEventToday;
  return (
    <PrioritySquareCard
      title="Aceites"
      sub={
        blocked
          ? 'No disponible'
          : kpi.loading
            ? 'Cargando…'
            : kpi.oilFryersActive === 0
              ? 'Sin freidoras'
              : kpi.oilHadEventToday
                ? 'Al día'
                : 'Falta registro'
      }
      badge={
        blocked || kpi.loading || kpi.oilFryersActive === 0 || kpi.oilHadEventToday
          ? null
          : 'REVISAR'
      }
      badgeClass={
        needsReview
          ? 'bg-amber-100 text-amber-900 ring-amber-200'
          : 'bg-emerald-100 text-emerald-900 ring-emerald-200'
      }
      iconBg="bg-emerald-100 text-emerald-800"
      href="/appcc/aceite/registro"
      blocked={blocked}
      Icon={Droplets}
    />
  );
}

function BlockProduccion() {
  const { perms } = usePanelData();
  const blocked = perms.isBlockedByPlan('produccion');
  return (
    <PriorityRowCard
      title="Producción de hoy"
      sub={blocked ? 'Disponible en plan superior' : 'Plan del día y elaboraciones'}
      lines={blocked ? [] : ['Consulta tareas en Producción']}
      badge={blocked ? null : 'EN CURSO'}
      badgeClass="bg-sky-100 text-sky-900 ring-sky-200"
      iconBg="bg-sky-100 text-sky-800"
      href="/produccion"
      blocked={blocked}
      Icon={Factory}
      layout="shorter"
    />
  );
}

function BlockHorarios() {
  const { perms } = usePanelData();
  const blocked = perms.isBlockedByPlan('personal');
  return (
    <PriorityRowCard
      title="Horarios"
      sub={blocked ? 'No disponible' : 'Turnos, fichajes y equipo'}
      iconBg="bg-sky-100 text-sky-800"
      href="/personal"
      blocked={blocked}
      Icon={CalendarDays}
      layout="shorter"
    />
  );
}

function BlockChecklist() {
  const { perms } = usePanelData();
  const blocked = perms.isBlockedByPlan('checklist');
  return (
    <PrioritySquareCard
      title="Check list"
      sub="Apertura, cierre…"
      href="/checklist"
      Icon={ListChecks}
      iconBg="bg-violet-100 text-violet-800"
      blocked={blocked}
    />
  );
}

function BlockAPPCC() {
  const { perms } = usePanelData();
  const blocked = perms.isBlockedByPlan('appcc');
  return (
    <PriorityRowCard
      title="APPCC"
      sub={blocked ? 'No disponible' : 'Alérgenos, registros y partes'}
      iconBg="bg-emerald-100 text-emerald-800"
      href="/appcc"
      blocked={blocked}
      Icon={ShieldCheck}
      layout="shorter"
    />
  );
}

function BlockLimpieza() {
  const { perms } = usePanelData();
  const blocked = perms.isBlockedByPlan('appcc');
  return (
    <PrioritySquareCard
      title="Limpieza"
      sub="Plan y registro"
      href="/appcc/limpieza/registro"
      Icon={Sparkles}
      iconBg="bg-teal-100 text-teal-800"
      blocked={blocked}
    />
  );
}

function BlockInventario() {
  const { perms } = usePanelData();
  const blocked = perms.isBlockedByPlan('inventario');
  return (
    <PriorityRowCard
      title="Inventario"
      sub={blocked ? 'No disponible' : 'Stock y valoración'}
      iconBg="bg-amber-100 text-amber-800"
      href="/inventario"
      blocked={blocked}
      Icon={ClipboardList}
      layout="shorter"
    />
  );
}

function BlockEscandallos() {
  const { perms } = usePanelData();
  const blocked = perms.isBlockedByPlan('escandallos');
  return (
    <PriorityRowCard
      title="Escandallos"
      sub={blocked ? 'No disponible' : 'Recetas y costes por plato'}
      iconBg="bg-violet-100 text-violet-800"
      href="/escandallos"
      blocked={blocked}
      Icon={Calculator}
      layout="shorter"
    />
  );
}

function BlockFinanzas() {
  const { perms } = usePanelData();
  const blocked = perms.isBlockedByPlan('finanzas');
  return (
    <PriorityRowCard
      title="Finanzas"
      sub={blocked ? 'No disponible' : 'Ventas, costes y rentabilidad'}
      iconBg="bg-rose-100 text-rose-800"
      href="/finanzas"
      blocked={blocked}
      Icon={BarChart3}
      layout="shorter"
    />
  );
}

function BlockChat() {
  const { perms, chatUnreadCount } = usePanelData();
  const blocked = perms.isBlockedByPlan('chat');
  const hasNew = !blocked && chatUnreadCount > 0;
  return (
    <PrioritySquareCard
      title="Chat del local"
      sub={hasNew ? `${chatUnreadCount} mensaje${chatUnreadCount === 1 ? '' : 's'} nuevo${chatUnreadCount === 1 ? '' : 's'}` : 'Mensajes del turno'}
      href="/chat"
      Icon={MessageCircle}
      iconBg="bg-sky-100 text-sky-800"
      blocked={blocked}
      alert={hasNew}
      badge={hasNew ? String(chatUnreadCount) : null}
      badgeClass="bg-red-600 text-white ring-red-500"
    />
  );
}

function BlockComunicacion() {
  const { chatUnreadCount } = usePanelData();
  const hasNew = chatUnreadCount > 0;
  return (
    <PrioritySquareCard
      title="Comunicación"
      sub={hasNew ? `${chatUnreadCount} aviso${chatUnreadCount === 1 ? '' : 's'} nuevo${chatUnreadCount === 1 ? '' : 's'}` : 'Avisos y notas'}
      href="/chat"
      Icon={Bell}
      iconBg="bg-zinc-100 text-zinc-700"
      alert={hasNew}
      badge={hasNew ? String(chatUnreadCount) : null}
      badgeClass="bg-red-600 text-white ring-red-500"
    />
  );
}

function BlockActividadReciente() {
  const { localId } = usePanelData();
  if (!localId) return null;
  return (
    <section className="rounded-2xl border border-dashed border-zinc-200/90 bg-zinc-50/40 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
        Actividad reciente
      </p>
      <p className="mt-1 text-[12px] text-zinc-500">
        Pronto verás aquí los últimos movimientos del equipo.
      </p>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Bloques globales (no configurables, siempre arriba)                       */
/* ────────────────────────────────────────────────────────────────────────── */

export function PanelGreetingBlock() {
  const { displayName, loginUsername, email } = useAuth();
  const greeting = React.useMemo(
    () => buildPanelGreetingParts(displayName, loginUsername, email),
    [displayName, loginUsername, email],
  );
  const dateLabel = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  return (
    <div className="rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-zinc-200/80">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[15px] font-bold tracking-tight text-zinc-900">
          {greeting.text} {greeting.emoji}
        </p>
        <p className="shrink-0 text-right text-[11px] capitalize leading-none text-zinc-400">
          {dateLabel}
        </p>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Mapeo final                                                               */
/* ────────────────────────────────────────────────────────────────────────── */

export const PANEL_BLOCK_RENDERERS: Readonly<Record<PanelBlockId, BlockRenderer>> = {
  'pedidos-agenda': BlockPedidosAgenda,
  'pedidos-llegan-hoy': BlockPedidosLleganHoy,
  'produccion': BlockProduccion,
  'actividad-reciente': BlockActividadReciente,
  'temperaturas': BlockTemperaturas,
  'aceites': BlockAceites,
  'checklist': BlockChecklist,
  'appcc': BlockAPPCC,
  'limpieza': BlockLimpieza,
  'inventario': BlockInventario,
  'escandallos': BlockEscandallos,
  'finanzas': BlockFinanzas,
  'horarios': BlockHorarios,
  'chat': BlockChat,
  'comunicacion': BlockComunicacion,
};
