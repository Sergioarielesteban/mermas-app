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
import PanelAlertas from '@/components/PanelAlertas';
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

// ─── Emoji de buen rollo (cambia cada día) ────────────────────────────────────
const GOOD_VIBES = ['👋', '💪', '🙌', '✨', '🤜', '🫶', '😊', '🚀', '🔥', '🤩', '👊', '🎯'];
function useDailyEmoji() {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000,
  );
  return GOOD_VIBES[dayOfYear % GOOD_VIBES.length];
}

// ─── Saludo según hora del día ────────────────────────────────────────────────
function useGreeting() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 14) return 'Buenos días';
  if (hour >= 14 && hour < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

function useDateLabel() {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
}

// ─── Tarjeta compacta de acceso rápido ───────────────────────────────────────
function QuickTile({ tile }: { tile: PanelTile }) {
  const Icon = tile.Icon;
  return (
    <Link
      href={panelHref(tile)}
      className="flex flex-col items-center gap-1.5 select-none touch-manipulation outline-none"
    >
      <div className={[
        'grid h-14 w-14 place-items-center rounded-2xl shadow-sm ring-1 transition-transform active:scale-95',
        tile.blocked ? 'bg-zinc-100 ring-zinc-200 text-zinc-400' : 'bg-white ring-zinc-200/80 text-[#D32F2F]',
      ].join(' ')}>
        <Icon className="h-6 w-6" strokeWidth={2} />
      </div>
      <span className={[
        'text-center text-[11px] font-medium leading-tight',
        tile.blocked ? 'text-zinc-400' : 'text-zinc-700',
      ].join(' ')}>
        {tile.label}
      </span>
    </Link>
  );
}

// ─── Tarjeta destacada Pedidos (más suave) ────────────────────────────────────
function PanelFeaturedPedidos({
  tile,
}: {
  tile: Pick<PanelTile, 'href' | 'label' | 'sub' | 'Icon' | 'blocked'>;
}) {
  const Icon = tile.Icon;
  return (
    <Link
      href={tile.blocked ? '/planes' : tile.href}
      className={[
        'flex items-center gap-2.5 rounded-xl px-3 py-2 text-left antialiased outline-none select-none touch-manipulation shadow-sm transition-transform active:scale-[0.99]',
        'bg-gradient-to-br from-zinc-700 to-zinc-800',
        tile.blocked ? 'opacity-50' : '',
      ].join(' ')}
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/10">
        <Icon className="h-4 w-4 text-[#ef6060]" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold leading-tight tracking-tight text-white">{tile.label}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">{tile.sub}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-[#ef6060]" strokeWidth={2.25} aria-hidden />
    </Link>
  );
}

export default function PanelControlPage() {
  const { localCode, localName, localId, email, profileRole, profileReady, isCentralKitchen, plan } = useAuth();
  const role = profileRole ?? 'staff';
  const emoji = useDailyEmoji();
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

  const mermas: PanelTile = { id: 'mermas', href: '/dashboard', label: 'Mermas', sub: '', Icon: BookOpen, blocked: false };
  const appcc: PanelTile = { id: 'appcc', href: '/appcc', label: 'APPCC', sub: '', Icon: ShieldCheck, blocked: isBlockedByPlan('appcc') };
  const checklist: PanelTile = { id: 'checklist', href: '/checklist', label: 'Check list', sub: '', Icon: ListChecks, blocked: isBlockedByPlan('checklist') };
  const produccion: PanelTile = { id: 'produccion', href: '/produccion', label: 'Producción', sub: '', Icon: Factory, blocked: isBlockedByPlan('produccion') };
  const servicio: PanelTile = { id: 'servicio', href: '/servicio', label: 'Servicio', sub: '', Icon: Soup, blocked: isBlockedByPlan('servicio') };
  const consumoInterno: PanelTile = { id: 'comida-personal', href: '/comida-personal', label: 'Consumos', sub: '', Icon: UtensilsCrossed, blocked: isBlockedByPlan('comida_personal') };
  const pedirCentral: PanelTile = { id: 'pedidos-cocina', href: '/pedidos-cocina', label: 'Pedir a central', sub: '', Icon: Package, blocked: false };
  const cocinaCentral: PanelTile = { id: 'cocina-central', href: '/cocina-central', label: 'Cocina central', sub: '', Icon: ChefHat, blocked: isBlockedByPlan('cocina_central') };
  const horarios: PanelTile = { id: 'personal', href: '/personal', label: 'Horarios', sub: '', Icon: CalendarDays, blocked: isBlockedByPlan('personal') };
  const inventarioTile: PanelTile = { id: 'inventario', href: '/inventario', label: 'Inventario', sub: '', Icon: ClipboardList, blocked: !showInventario || isBlockedByPlan('inventario') };
  const chat: PanelTile = { id: 'chat', href: '/chat', label: 'Chat', sub: '', Icon: MessageCircle, blocked: !showChat || isBlockedByPlan('chat') };
  const escandallos: PanelTile = { id: 'escandallos', href: '/escandallos', label: 'Escandallos', sub: '', Icon: Calculator, blocked: !showEscandallos || isBlockedByPlan('escandallos') };
  const finanzasTile: PanelTile = { id: 'finanzas', href: '/finanzas', label: 'Finanzas', sub: '', Icon: BarChart3, blocked: isBlockedByPlan('finanzas') };

  // ─── Lista completa de módulos (rejilla 4 columnas, mismo tile que antiguos accesos rápidos) ──
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

  const extraTiles: PanelTile[] = [];
  if (showCocinaCentral && !cocinaInGrid) extraTiles.push(cocinaCentral);
  if (showPedidosCocina && !pedirInGrid) extraTiles.push(pedirCentral);
  if (showFinanzas) extraTiles.push(finanzasTile);

  const allModules: PanelTile[] = [
    mermas, appcc, checklist, produccion,
    servicio, row3Right, horarios, row4Right,
    chat, escandallos, ...extraTiles,
  ].filter((t): t is PanelTile => t !== null);

  const pedidosBlocked = !showPedidos || isBlockedByPlan('pedidos');
  const featuredPedidos = { href: '/pedidos', label: 'Pedidos', sub: 'Proveedores y recepción', Icon: ShoppingCart, blocked: pedidosBlocked };

  return (
    <div className="-mx-4 min-h-screen bg-[#f5f5f7] pb-12 pt-3 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6">
      <div className="mx-auto max-w-full space-y-3 px-4 sm:max-w-2xl sm:px-0 md:max-w-4xl">

        {/* ── Saludo (una línea: saludo + fecha) ───────────────────── */}
        <div className="rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-zinc-200/80">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[15px] font-bold tracking-tight text-zinc-900">
              {greeting} {emoji}
            </p>
            <p className="shrink-0 text-right text-[11px] capitalize leading-none text-zinc-400">{dateLabel}</p>
          </div>
        </div>

        {/* ── Alertas inteligentes ────────────────────────────────── */}
        {localId && <PanelAlertas localId={localId} showPedidos={showPedidos} />}

        {/* ── Checklist guiado (si aplica) ───────────────────────── */}
        <ProductoGuiadoChecklist />

        {/* ── Módulos (rejilla 4×N, mismo diseño que los antiguos accesos rápidos) ── */}
        <div>
          <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
            Módulos
          </p>
          {showPedidos ? (
            <div className="mb-2">
              <PanelFeaturedPedidos tile={featuredPedidos} />
            </div>
          ) : null}
          <div className="rounded-2xl bg-white px-3 py-4 shadow-sm ring-1 ring-zinc-200/80 sm:px-4">
            <div className="grid grid-cols-4 justify-items-center gap-x-1 gap-y-5 sm:gap-x-2">
              {allModules.map((tile) => (
                <QuickTile key={tile.id} tile={tile} />
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
