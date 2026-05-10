'use client';

import Link from 'next/link';
import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight, Droplets, Factory, ShoppingCart, Thermometer } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import PanelAlertas from '@/components/PanelAlertas';
import ProductoGuiadoChecklist from '@/components/ProductoGuiadoChecklist';
import {
  canAccessChat,
  canAccessComidaPersonal,
  canAccessEscandallos,
  canAccessFinanzas,
  canAccessInventario,
  canAccessPedidosByRole,
} from '@/lib/app-role-permissions';
import { canAccessCocinaCentralModule, canPlaceCentralSupplyOrder } from '@/lib/cocina-central-permissions';
import { canAccessPedidos } from '@/lib/pedidos-access';
import { getModuleAccess } from '@/lib/canAccessModule';
import type { PlanModule } from '@/lib/planPermissions';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { fetchOrders } from '@/lib/pedidos-supabase';
import type { AppccSlot } from '@/lib/appcc-supabase';
import { fetchAppccFryers, fetchOilEventsForDate } from '@/lib/appcc-aceite-supabase';
import {
  appccTemperaturasOperationalDateKey,
  fetchAppccColdUnits,
  fetchAppccReadingsForDate,
  getDueTemperatureRegistrationSlots,
  madridDateKey,
} from '@/lib/appcc-supabase';
import { buildPanelGreetingParts } from '@/lib/panel-greeting';

export default function OperationalDayHome() {
  const {
    localCode,
    localName,
    localId,
    email,
    displayName,
    loginUsername,
    profileRole,
    profileReady,
    plan,
    isCentralKitchen,
  } = useAuth();

  const greeting = React.useMemo(
    () => buildPanelGreetingParts(displayName, loginUsername, email),
    [displayName, loginUsername, email],
  );
  const dateLabel = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  const role = profileRole ?? 'staff';

  const isBlockedByPlan = React.useCallback(
    (module: PlanModule) => {
      if (!profileReady || !profileRole) return false;
      return !getModuleAccess({ plan, role: profileRole }, module).allowed;
    },
    [plan, profileReady, profileRole],
  );

  const showCocinaCentral = canAccessCocinaCentralModule(profileRole);
  const showPedidos = canAccessPedidos(localCode, email, localName, localId) && canAccessPedidosByRole(role);
  const showPedidosCocina = canPlaceCentralSupplyOrder(isCentralKitchen, localId);
  const showFinanzas = showPedidos && canAccessFinanzas(role);
  const showEscandallos = canAccessEscandallos(role);
  const showInventario = canAccessInventario(role);
  const showChat = canAccessChat(role);
  const showComidaPersonal = canAccessComidaPersonal(role);

  const [kpi, setKpi] = React.useState<{
    pedidosHoy: number | null;
    tempDueSlots: AppccSlot[];
    /** Freidoras activas (para saber si aplica revisar aceite). */
    oilFryersActive: number;
    /** Al menos un cambio o filtrado registrado hoy (día civil Madrid, como el registro de aceite). */
    oilHadEventToday: boolean;
    loading: boolean;
  }>({
    pedidosHoy: null,
    tempDueSlots: [],
    oilFryersActive: 0,
    oilHadEventToday: false,
    loading: true,
  });

  React.useEffect(() => {
    if (!localId || !isSupabaseEnabled() || !getSupabaseClient()) {
      setKpi({
        pedidosHoy: null,
        tempDueSlots: [],
        oilFryersActive: 0,
        oilHadEventToday: false,
        loading: false,
      });
      return;
    }
    const sb = getSupabaseClient()!;
    let cancelled = false;
    let firstFetch = true;

    const run = async () => {
      if (firstFetch) {
        setKpi((s) => ({ ...s, loading: true }));
        firstFetch = false;
      }
      const hoyISO = new Date().toISOString().slice(0, 10);
      let pedidosHoy = 0;
      let tempDueSlots: AppccSlot[] = [];
      let oilFryersActive = 0;
      let oilHadEventToday = false;
      try {
        if (showPedidos) {
          const orders = await fetchOrders(sb, localId, { recentDays: 14 });
          pedidosHoy = orders.filter((o) => o.status === 'sent' && o.deliveryDate === hoyISO).length;
        }
      } catch {
        pedidosHoy = 0;
      }
      try {
        const oilDateKey = madridDateKey();
        const [units, readings, fryers, oilEvents] = await Promise.all([
          fetchAppccColdUnits(sb, localId),
          fetchAppccReadingsForDate(sb, localId, appccTemperaturasOperationalDateKey()),
          fetchAppccFryers(sb, localId),
          fetchOilEventsForDate(sb, localId, oilDateKey),
        ]);
        oilFryersActive = fryers.length;
        oilHadEventToday = oilEvents.length > 0;
        if (units.length > 0) {
          tempDueSlots = getDueTemperatureRegistrationSlots(units, readings);
        }
      } catch {
        tempDueSlots = [];
        oilFryersActive = 0;
        oilHadEventToday = false;
      }
      if (!cancelled) {
        setKpi({ pedidosHoy, tempDueSlots, oilFryersActive, oilHadEventToday, loading: false });
      }
    };

    void run();
    const tick = window.setInterval(() => void run(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(tick);
    };
  }, [localId, showPedidos]);

  const pedidosLleganHoy = kpi.pedidosHoy ?? 0;

  const priorityPedidos = {
    title: 'Pedidos que llegan hoy',
    sub: kpi.loading
      ? 'Cargando…'
      : pedidosLleganHoy === 0
        ? 'Nada previsto para recepción hoy'
        : `${pedidosLleganHoy} pedido${pedidosLleganHoy === 1 ? '' : 's'} con llegada hoy`,
    lines: [] as string[],
    badge: pedidosLleganHoy > 0 ? ('HOY' as const) : null,
    badgeClass: 'bg-red-100 text-red-800 ring-red-200',
    iconBg: 'bg-red-100 text-red-700',
    href: '/pedidos',
    blocked: !showPedidos || isBlockedByPlan('pedidos'),
    Icon: ShoppingCart,
  };

  const tempNeeds =
    kpi.tempDueSlots.length > 0 && !isBlockedByPlan('appcc');

  const tempAlertLines =
    tempNeeds && !kpi.loading
      ? kpi.tempDueSlots.map((slot) => ({
          text: slot === 'manana' ? 'Mañana sin registrar' : 'Noche sin registrar',
          tone: slot === 'noche' ? ('red' as const) : ('amber' as const),
        }))
      : undefined;

  const tempBlocked = isBlockedByPlan('appcc');
  const tempPanelTone: 'neutral' | 'danger' | 'success' =
    tempBlocked || kpi.loading ? 'neutral' : tempNeeds ? 'danger' : 'success';

  const priorityTemp = {
    title: 'Temperaturas',
    sub: kpi.loading
      ? 'Cargando…'
      : tempAlertLines && tempAlertLines.length > 0
        ? ''
        : tempNeeds
          ? 'Pendiente'
          : 'Al día',
    badge: tempNeeds ? ('PEND.' as const) : null,
    badgeClass:
      tempPanelTone === 'danger'
        ? 'bg-red-200 text-red-950 ring-red-300'
        : 'bg-emerald-100 text-emerald-900 ring-emerald-200',
    iconBg: 'bg-amber-100 text-amber-800',
    href: '/appcc/temperaturas',
    blocked: tempBlocked,
    Icon: Thermometer,
    alertLines: tempAlertLines,
    panelTone: tempPanelTone,
  };

  const aceiteBlocked = isBlockedByPlan('appcc');
  const aceiteNeedsReview =
    !aceiteBlocked &&
    !kpi.loading &&
    kpi.oilFryersActive > 0 &&
    !kpi.oilHadEventToday;

  const aceitePanelTone: 'neutral' | 'danger' | 'success' =
    aceiteBlocked || kpi.loading ? 'neutral' : aceiteNeedsReview ? 'danger' : 'success';

  const priorityAceite = {
    title: 'Aceites',
    sub: aceiteBlocked
      ? 'No disponible'
      : kpi.loading
        ? 'Cargando…'
        : kpi.oilFryersActive === 0
          ? 'Sin freidoras activas'
          : kpi.oilHadEventToday
            ? 'Al día'
            : 'Freidoras — falta registro hoy',
    badge:
      aceiteBlocked || kpi.loading || kpi.oilFryersActive === 0 || kpi.oilHadEventToday
        ? null
        : ('REVISAR' as const),
    badgeClass:
      aceitePanelTone === 'danger'
        ? 'bg-red-200 text-red-950 ring-red-300'
        : 'bg-emerald-100 text-emerald-900 ring-emerald-200',
    iconBg: 'bg-emerald-100 text-emerald-800',
    href: '/appcc/aceite/registro',
    blocked: aceiteBlocked,
    Icon: Droplets,
    panelTone: aceitePanelTone,
  };

  const priorityProduccion = {
    title: 'Producción de hoy',
    sub: isBlockedByPlan('produccion') ? 'Disponible en plan superior' : 'Plan del día y elaboraciones',
    lines: isBlockedByPlan('produccion') ? [] : ['Consulta tareas en Producción'],
    badge: isBlockedByPlan('produccion') ? null : ('EN CURSO' as const),
    badgeClass: 'bg-sky-100 text-sky-900 ring-sky-200',
    iconBg: 'bg-sky-100 text-sky-800',
    href: '/produccion',
    blocked: isBlockedByPlan('produccion'),
    Icon: Factory,
  };

  return (
    <div className="space-y-4 pb-2">
      <div className="rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-zinc-200/80">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[15px] font-bold tracking-tight text-zinc-900">
            {greeting.text} {greeting.emoji}
          </p>
          <p className="shrink-0 text-right text-[11px] capitalize leading-none text-zinc-400">{dateLabel}</p>
        </div>
      </div>

      {localId ? (
        <section id="panel-alertas" className="scroll-mt-28">
          <PanelAlertas localId={localId} showPedidos={showPedidos} hideTemperaturaAlerts />
        </section>
      ) : null}

      <ProductoGuiadoChecklist />

      <section id="panel-prioridades" className="scroll-mt-28">
        <p className="mb-2 px-0.5 font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
          Prioridades
        </p>
        <div className="space-y-3">
          <PriorityCard {...priorityPedidos} />
          <div className="grid grid-cols-2 gap-1.5">
            <PrioritySquareCard {...priorityTemp} />
            <PrioritySquareCard {...priorityAceite} />
          </div>
          <PriorityCard {...priorityProduccion} />
        </div>
      </section>

      {(showFinanzas || showPedidosCocina || showCocinaCentral || showInventario || showEscandallos || showChat || showComidaPersonal) && (
        <section className="rounded-2xl border border-dashed border-zinc-200/90 bg-zinc-50/50 px-3 py-2 text-center">
          <p className="text-[11px] text-zinc-500">
            Más herramientas en el menú <span className="font-semibold text-zinc-700">☰</span>
          </p>
        </section>
      )}
    </div>
  );
}

function PriorityCard(props: {
  title: string;
  sub: string;
  lines: string[];
  badge: string | null;
  badgeClass?: string;
  iconBg: string;
  href: string;
  blocked?: boolean;
  Icon: LucideIcon;
}) {
  const { title, sub, lines, badge, badgeClass, iconBg, href, blocked, Icon } = props;
  return (
    <Link
      href={blocked ? '/planes' : href}
      className={[
        'flex items-stretch gap-3 rounded-3xl bg-white p-3.5 shadow-sm ring-1 ring-zinc-200/80 transition-transform active:scale-[0.99]',
        blocked ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className={['grid h-12 w-12 shrink-0 place-items-center rounded-2xl ring-1 ring-white/60', iconBg].join(' ')}>
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-serif text-[16px] font-normal leading-tight text-zinc-900">{title}</p>
        <p className="mt-0.5 text-[12px] text-zinc-500">{sub}</p>
        {lines.length > 0 ? (
          <ul className="mt-2 space-y-0.5">
            {lines.map((line) => (
              <li key={line} className="text-[11px] text-zinc-600">
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
              'rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1',
              badgeClass ?? 'bg-zinc-100 text-zinc-700 ring-zinc-200',
            ].join(' ')}
          >
            {badge}
          </span>
        ) : (
          <span />
        )}
        <ChevronRight className="h-5 w-5 text-zinc-300" aria-hidden />
      </div>
    </Link>
  );
}

type SquareAlertLine = { text: string; tone: 'amber' | 'red' };

/** Dos cuadrados iguales en una fila (Temperaturas | Aceites): verde = ok, rojo = falta algo. */
function PrioritySquareCard(props: {
  title: string;
  sub: string;
  badge: string | null;
  badgeClass?: string;
  iconBg: string;
  href: string;
  blocked?: boolean;
  Icon: LucideIcon;
  /** Avisos compactos dentro del cuadrado (temperaturas mañana/noche). */
  alertLines?: SquareAlertLine[];
  /** Verde «Al día», rojo pendiente, neutro cargando / bloqueado. */
  panelTone?: 'neutral' | 'danger' | 'success';
}) {
  const { title, sub, badge, badgeClass, iconBg, href, blocked, Icon, alertLines, panelTone = 'neutral' } = props;
  const hasAlerts = alertLines && alertLines.length > 0;
  const danger = panelTone === 'danger';
  const success = panelTone === 'success';

  const shellClass =
    danger
      ? 'border border-red-300/90 bg-red-50 shadow-sm ring-2 ring-red-300/70'
      : success
        ? 'border border-emerald-300/90 bg-emerald-50 shadow-sm ring-2 ring-emerald-300/70'
        : 'bg-white shadow-sm ring-1 ring-zinc-200/80';

  const iconShellClass = danger
    ? 'bg-red-100 text-red-700 ring-red-200/80'
    : success
      ? 'bg-emerald-100 text-emerald-700 ring-emerald-200/80'
      : [iconBg, 'ring-white/60'].join(' ');

  const titleClass = danger ? 'text-red-950' : success ? 'text-emerald-950' : 'text-zinc-900';

  const subClass =
    danger && !hasAlerts
      ? 'text-[10px] font-medium leading-snug text-red-800'
      : success
        ? 'text-[10px] leading-snug text-emerald-800'
        : 'text-[10px] leading-snug text-zinc-500';

  const chevronClass = danger ? 'text-red-400' : success ? 'text-emerald-500' : 'text-zinc-300';

  return (
    <Link
      href={blocked ? '/planes' : href}
      className={[
        'relative flex min-h-[118px] flex-col items-center justify-between rounded-2xl p-2.5 pt-3 transition-transform active:scale-[0.99] sm:min-h-[126px]',
        shellClass,
        blocked ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className="flex w-full flex-col items-center text-center">
        <div className={['grid h-9 w-9 place-items-center rounded-xl ring-1', iconShellClass].join(' ')}>
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <p className={['mt-1.5 font-serif text-[13px] font-normal leading-tight', titleClass].join(' ')}>
          {title}
        </p>
        {hasAlerts ? (
          <div className="mt-1 flex w-full flex-col gap-0.5 px-0.5">
            {alertLines!.map((line, idx) => (
              <p
                key={`${line.tone}-${idx}-${line.text}`}
                className={[
                  'rounded-md px-1.5 py-0.5 text-[9px] font-semibold leading-tight ring-1',
                  danger
                    ? line.tone === 'red'
                      ? 'bg-red-100/90 text-red-900 ring-red-200'
                      : 'bg-white/90 text-red-900 ring-red-200/80'
                    : line.tone === 'red'
                      ? 'bg-red-50 text-red-800 ring-red-100'
                      : 'bg-amber-50 text-amber-900 ring-amber-100',
                ].join(' ')}
              >
                {line.text}
              </p>
            ))}
          </div>
        ) : (
          <p className={['mt-0.5 line-clamp-2', subClass].join(' ')}>{sub}</p>
        )}
      </div>
      <div className="flex w-full items-center justify-between px-0.5 pb-px pt-1.5">
        {badge ? (
          <span
            className={[
              'rounded-full px-1 py-px text-[7px] font-bold uppercase tracking-wide ring-1',
              badgeClass ?? 'bg-zinc-100 text-zinc-700 ring-zinc-200',
            ].join(' ')}
          >
            {badge}
          </span>
        ) : (
          <span />
        )}
        <ChevronRight className={['h-3.5 w-3.5 shrink-0', chevronClass].join(' ')} aria-hidden />
      </div>
    </Link>
  );
}
