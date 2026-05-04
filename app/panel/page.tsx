'use client';

import Link from 'next/link';
import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  BookOpen,
  Calculator,
  CalendarDays,
  ChefHat,
  ChevronRight,
  ClipboardList,
  Factory,
  ListChecks,
  MessageCircle,
  Package,
  ShieldCheck,
  ShoppingCart,
  Soup,
  UtensilsCrossed,
} from 'lucide-react';
import ChefOneGlowLine from '@/components/ChefOneGlowLine';
import { useAuth } from '@/components/AuthProvider';
import {
  canAccessChat,
  canAccessComidaPersonal,
  canAccessEscandallos,
  canAccessFinanzas,
  canAccessInventario,
  canAccessPedidosByRole,
} from '@/lib/app-role-permissions';
import { canAccessCocinaCentralModule, canPlaceCentralSupplyOrder } from '@/lib/cocina-central-permissions';
import ProductoGuiadoChecklist from '@/components/ProductoGuiadoChecklist';
import { canAccessPedidos } from '@/lib/pedidos-access';
import { getModuleAccess } from '@/lib/canAccessModule';
import type { PlanModule } from '@/lib/planPermissions';

type PanelTile = {
  id: string;
  href: string;
  label: string;
  sub: string;
  Icon: LucideIcon;
  blocked: boolean;
};

function panelHref(tile: PanelTile) {
  return tile.blocked ? '/planes' : tile.href;
}

// ─── Saludo según hora del día ────────────────────────────────────────────────
function useGreeting() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 14) return { text: 'Buenos días', emoji: '☀️' };
  if (hour >= 14 && hour < 21) return { text: 'Buenas tardes', emoji: '🍳' };
  return { text: 'Buenas noches', emoji: '🌙' };
}

function useDateLabel() {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
}

// ─── Tarjeta compacta de acceso rápido (icono + label) ───────────────────────
function QuickTile({ tile }: { tile: PanelTile }) {
  const Icon = tile.Icon;
  return (
    <Link
      href={panelHref(tile)}
      className="flex flex-col items-center gap-1.5 select-none touch-manipulation outline-none min-w-[4.5rem]"
    >
      <div
        className={[
          'grid h-14 w-14 place-items-center rounded-2xl shadow-sm ring-1 transition-transform active:scale-95',
          tile.blocked
            ? 'bg-zinc-100 ring-zinc-200 text-zinc-400'
            : 'bg-white ring-zinc-200/80 text-[#D32F2F]',
        ].join(' ')}
      >
        <Icon className="h-6 w-6" strokeWidth={2} />
      </div>
      <span
        className={[
          'w-full max-w-[4.5rem] text-center text-[11px] font-medium leading-tight',
          tile.blocked ? 'text-zinc-400' : 'text-zinc-700',
        ].join(' ')}
      >
        {tile.label}
      </span>
    </Link>
  );
}

// ─── Tarjeta de módulo (grid) ─────────────────────────────────────────────────
function PanelGridCard({ tile }: { tile: PanelTile }) {
  const Icon = tile.Icon;
  return (
    <Link
      href={panelHref(tile)}
      className={[
        'flex items-center gap-3 rounded-2xl bg-white px-3.5 py-3 text-left antialiased outline-none select-none touch-manipulation shadow-sm ring-1 ring-zinc-200/80 transition-transform active:scale-[0.98]',
        tile.blocked ? 'opacity-50' : '',
        'focus-visible:ring-2 focus-visible:ring-[#D32F2F]/35',
      ].join(' ')}
    >
      <div
        className={[
          'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
          tile.blocked ? 'bg-zinc-100 text-zinc-400' : 'bg-[#D32F2F]/10 text-[#D32F2F]',
        ].join(' ')}
      >
        <Icon className="h-5 w-5" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-[13px] font-semibold leading-tight text-zinc-900">{tile.label}</p>
        <p className="mt-0.5 line-clamp-1 text-[11px] leading-tight text-zinc-400">{tile.sub}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300" strokeWidth={2.5} aria-hidden />
    </Link>
  );
}

// ─── Tarjeta destacada Pedidos ────────────────────────────────────────────────
function PanelFeaturedPedidosDark({
  tile,
}: {
  tile: Pick<PanelTile, 'href' | 'label' | 'sub' | 'Icon' | 'blocked'>;
}) {
  const Icon = tile.Icon;
  return (
    <Link
      href={tile.blocked ? '/planes' : tile.href}
      className={[
        'flex items-center gap-3.5 rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-950 to-black px-4 py-3.5 text-left text-white antialiased outline-none select-none touch-manipulation shadow-md transition-transform active:scale-[0.99]',
        tile.blocked ? 'opacity-50' : '',
        'focus-visible:ring-2 focus-visible:ring-white/40',
      ].join(' ')}
    >
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
        <Icon className="h-6 w-6 text-[#D32F2F]" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold leading-tight tracking-tight">{tile.label}</p>
        <p className="mt-0.5 text-[12px] text-zinc-400">{tile.sub}</p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <ChevronRight className="h-5 w-5 text-[#D32F2F]" strokeWidth={2.25} aria-hidden />
      </div>
    </Link>
  );
}

export default function PanelControlPage() {
  const { localCode, localName, localId, email, profileRole, profileReady, isCentralKitchen, plan } = useAuth();
  const role = profileRole ?? 'staff';
  const greeting = useGreeting();
  const dateLabel = useDateLabel();

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

  const mermas: PanelTile = {
    id: 'mermas', href: '/dashboard', label: 'Mermas',
    sub: 'Registro y seguimiento', Icon: BookOpen, blocked: false,
  };
  const appcc: PanelTile = {
    id: 'appcc', href: '/appcc', label: 'APPCC',
    sub: 'Controles y registros', Icon: ShieldCheck, blocked: isBlockedByPlan('appcc'),
  };
  const checklist: PanelTile = {
    id: 'checklist', href: '/checklist', label: 'Check list',
    sub: 'Listas y ejecución', Icon: ListChecks, blocked: isBlockedByPlan('checklist'),
  };
  const produccion: PanelTile = {
    id: 'produccion', href: '/produccion', label: 'Producción',
    sub: 'Planes y ejecución', Icon: Factory, blocked: isBlockedByPlan('produccion'),
  };
  const servicio: PanelTile = {
    id: 'servicio', href: '/servicio', label: 'Servicio',
    sub: 'Carta y producción', Icon: Soup, blocked: isBlockedByPlan('servicio'),
  };
  const consumoInterno: PanelTile = {
    id: 'comida-personal', href: '/comida-personal', label: 'Consumos',
    sub: 'Comida del equipo', Icon: UtensilsCrossed, blocked: isBlockedByPlan('comida_personal'),
  };
  const pedirCentral: PanelTile = {
    id: 'pedidos-cocina', href: '/pedidos-cocina', label: 'Pedir a central',
    sub: 'Pedidos a cocina central', Icon: Package, blocked: false,
  };
  const cocinaCentral: PanelTile = {
    id: 'cocina-central', href: '/cocina-central', label: 'Cocina central',
    sub: 'Gestión de sede central', Icon: ChefHat, blocked: isBlockedByPlan('cocina_central'),
  };
  const horarios: PanelTile = {
    id: 'personal', href: '/personal', label: 'Horarios',
    sub: 'Equipo, turnos y fichaje', Icon: CalendarDays, blocked: isBlockedByPlan('personal'),
  };
  const inventarioTile: PanelTile = {
    id: 'inventario', href: '/inventario', label: 'Inventario',
    sub: 'Stock y movimientos', Icon: ClipboardList, blocked: !showInventario || isBlockedByPlan('inventario'),
  };
  const chat: PanelTile = {
    id: 'chat', href: '/chat', label: 'Chat',
    sub: 'Mensajes del equipo', Icon: MessageCircle, blocked: !showChat || isBlockedByPlan('chat'),
  };
  const escandallos: PanelTile = {
    id: 'escandallos', href: '/escandallos', label: 'Escandallos',
    sub: 'Recetas y costes', Icon: Calculator, blocked: !showEscandallos || isBlockedByPlan('escandallos'),
  };
  const finanzasTile: PanelTile = {
    id: 'finanzas', href: '/finanzas', label: 'Finanzas',
    sub: 'Ventas, márgenes y análisis', Icon: BarChart3, blocked: isBlockedByPlan('finanzas'),
  };

  // ─── Accesos rápidos (icono compacto, scroll horizontal) ──────────────────
  const quickTiles: PanelTile[] = [
    mermas,
    produccion,
    inventarioTile,
    checklist,
    appcc,
    horarios,
    ...(showChat ? [chat] : []),
    ...(showEscandallos ? [escandallos] : []),
    ...(canAccessComidaPersonal(role) ? [consumoInterno] : []),
  ].filter(Boolean);

  // ─── Grid de módulos secundarios ──────────────────────────────────────────
  let row3Right: PanelTile | null = null;
  if (canAccessComidaPersonal(role)) row3Right = consumoInterno;
  else if (showPedidosCocina) row3Right = pedirCentral;
  else if (showCocinaCentral) row3Right = cocinaCentral;

  const row3UsesCocina = row3Right?.id === 'cocina-central';
  const row3UsesPedCocina = row3Right?.id === 'pedidos-cocina';

  let row4Right: PanelTile = inventarioTile;
  if (!showInventario) {
    if (showCocinaCentral && !row3UsesCocina) row4Right = cocinaCentral;
    else if (showPedidosCocina && !row3UsesPedCocina) row4Right = pedirCentral;
  }

  const cocinaInGrid = row3UsesCocina || row4Right.id === 'cocina-central';
  const pedirInGrid = row3UsesPedCocina || row4Right.id === 'pedidos-cocina';

  const needCocina = showCocinaCentral && !cocinaInGrid;
  const needPedir = showPedidosCocina && !pedirInGrid;
  const needFinanzas = showFinanzas;

  let row6Left: PanelTile | null = null;
  let row6Right: PanelTile | null = null;
  if (needCocina && needFinanzas) { row6Left = cocinaCentral; row6Right = finanzasTile; }
  else if (needCocina && needPedir) { row6Left = cocinaCentral; row6Right = pedirCentral; }
  else if (needPedir && needFinanzas) { row6Left = pedirCentral; row6Right = finanzasTile; }
  else if (needCocina) { row6Left = cocinaCentral; if (needPedir) row6Right = pedirCentral; }
  else if (needPedir) { row6Left = pedirCentral; if (needFinanzas) row6Right = finanzasTile; }
  else if (needFinanzas) { row6Left = finanzasTile; }

  const gridRows: [PanelTile | null, PanelTile | null][] = [
    [mermas, appcc],
    [checklist, produccion],
    [servicio, row3Right],
    [horarios, row4Right],
    [chat, escandallos],
    [row6Left, row6Right],
  ];

  const pedidosBlocked = !showPedidos || isBlockedByPlan('pedidos');
  const featuredPedidos = {
    href: '/pedidos', label: 'Pedidos', sub: 'Proveedores y recepción',
    Icon: ShoppingCart, blocked: pedidosBlocked,
  };

  const displayName = localName ?? localCode ?? '';

  return (
    <div className="-mx-4 min-h-screen bg-[#f5f5f7] px-4 pb-12 pt-3 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6">
      <div className="mx-auto max-w-full space-y-3 sm:max-w-2xl md:max-w-4xl">

        {/* ── Saludo ─────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white px-4 py-3.5 shadow-sm ring-1 ring-zinc-200/80">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[17px] font-bold tracking-tight text-zinc-900">
                {greeting.text}, equipo {greeting.emoji}
              </p>
              {displayName && (
                <p className="mt-0.5 text-[13px] font-medium text-zinc-400">{displayName}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-[11px] capitalize text-zinc-400">{dateLabel}</p>
            </div>
          </div>
        </div>

        {/* ── Checklist guiado (si aplica) ───────────────────────── */}
        <ProductoGuiadoChecklist />

        {/* ── Pedidos destacado ───────────────────────────────────── */}
        {showPedidos && <PanelFeaturedPedidosDark tile={featuredPedidos} />}

        {/* ── Accesos rápidos (scroll horizontal) ─────────────────── */}
        <div>
          <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
            Accesos rápidos
          </p>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5">
            {quickTiles.map((tile) => (
              <QuickTile key={tile.id} tile={tile} />
            ))}
          </div>
        </div>

        {/* ── Todos los módulos ────────────────────────────────────── */}
        <div>
          <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
            Todos los módulos
          </p>
          <div className="flex flex-col gap-y-2">
            {gridRows.map(([left, right], idx) => (
              <div key={idx} className="grid grid-cols-2 gap-2">
                {left ? <PanelGridCard tile={left} /> : <div />}
                {right ? <PanelGridCard tile={right} /> : <div />}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
