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

/** Misma altura en todas las filas; ~30 % menos que la base anterior (Pedidos no usa esto). */
const PANEL_GRID_CARD_H =
  'h-[5.95rem] min-h-[5.95rem] max-h-[5.95rem] sm:h-[6.125rem] sm:min-h-[6.125rem] sm:max-h-[6.125rem]';

function PanelGridEmpty() {
  return <div className={['rounded-[18px] bg-transparent', PANEL_GRID_CARD_H].join(' ')} aria-hidden />;
}

/**
 * Tarjeta blanca del grid: medidas unificadas (icono, título, descripción, flecha, línea roja).
 * La descripción no puede crecer: 2 líneas fijas.
 */
function PanelGridCard({ tile }: { tile: PanelTile }) {
  const Icon = tile.Icon;
  return (
    <Link
      href={panelHref(tile)}
      className={[
        'panel-ref-card-white flex flex-col rounded-[18px] bg-white px-3 py-2.5 text-left antialiased outline-none select-none touch-manipulation sm:px-3.5 sm:py-2.5',
        PANEL_GRID_CARD_H,
        tile.blocked ? 'panel-ref-card--blocked opacity-[0.58]' : '',
        'focus-visible:ring-2 focus-visible:ring-[#D32F2F]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f5f7]',
      ].join(' ')}
    >
      <div className="flex min-h-0 flex-1 items-center gap-2.5 sm:gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#D32F2F]/12 text-[#D32F2F] ring-1 ring-[#D32F2F]/10">
          <Icon className="h-6 w-6" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1 self-center">
          <p className="line-clamp-1 text-sm font-semibold leading-tight tracking-tight text-zinc-900">{tile.label}</p>
          <p className="mt-0.5 h-[2.4em] max-h-[2.4em] min-h-[2.4em] line-clamp-2 overflow-hidden text-xs font-normal leading-[1.2] text-zinc-500">
            {tile.sub}
          </p>
        </div>
        <ChevronRight
          className="h-5 w-5 shrink-0 self-center text-[#D32F2F]"
          strokeWidth={2.25}
          aria-hidden
        />
      </div>
      <div className="mt-2.5 flex shrink-0 justify-center">
        <ChefOneGlowLine className="w-14 sm:w-16" />
      </div>
    </Link>
  );
}

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
        'panel-ref-card-dark flex flex-col rounded-[18px] bg-gradient-to-br from-zinc-900 via-zinc-950 to-black px-3.5 py-3 text-left text-white antialiased outline-none select-none touch-manipulation sm:px-3.5',
        tile.blocked ? 'panel-ref-card--blocked opacity-[0.58]' : '',
        'focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f5f7]',
      ].join(' ')}
    >
      <div className="flex items-center gap-3">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
          <Icon className="h-7 w-7 text-[#D32F2F]" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[1.02rem] font-semibold leading-[1.2] tracking-tight">{tile.label}</p>
          <p className="mt-0.5 text-sm font-normal leading-tight text-zinc-400">{tile.sub}</p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-[#D32F2F]" strokeWidth={2.25} aria-hidden />
      </div>
      <div className="mt-2.5 flex justify-center">
        <ChefOneGlowLine className="w-16 sm:w-20" />
      </div>
    </Link>
  );
}

export default function PanelControlPage() {
  const { localCode, localName, localId, email, profileRole, profileReady, isCentralKitchen, plan } = useAuth();
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

  const mermas: PanelTile = {
    id: 'mermas',
    href: '/dashboard',
    label: 'Mermas',
    sub: 'Registro y seguimiento en tiempo real',
    Icon: BookOpen,
    blocked: false,
  };
  const appcc: PanelTile = {
    id: 'appcc',
    href: '/appcc',
    label: 'APPCC',
    sub: 'Controles, registros y trazabilidad',
    Icon: ShieldCheck,
    blocked: isBlockedByPlan('appcc'),
  };
  const checklist: PanelTile = {
    id: 'checklist',
    href: '/checklist',
    label: 'Check list',
    sub: 'Listas y ejecución diaria',
    Icon: ListChecks,
    blocked: isBlockedByPlan('checklist'),
  };
  const produccion: PanelTile = {
    id: 'produccion',
    href: '/produccion',
    label: 'Producción',
    sub: 'Planes y ejecución en cocina',
    Icon: Factory,
    blocked: isBlockedByPlan('produccion'),
  };
  const servicio: PanelTile = {
    id: 'servicio',
    href: '/servicio',
    label: 'Servicio',
    sub: 'Carta y producción del día',
    Icon: Soup,
    blocked: isBlockedByPlan('servicio'),
  };
  const consumoInterno: PanelTile = {
    id: 'comida-personal',
    href: '/comida-personal',
    label: 'Consumo interno',
    sub: 'Comida del equipo',
    Icon: UtensilsCrossed,
    blocked: isBlockedByPlan('comida_personal'),
  };
  const pedirCentral: PanelTile = {
    id: 'pedidos-cocina',
    href: '/pedidos-cocina',
    label: 'Pedir a central',
    sub: 'Pedidos a cocina central',
    Icon: Package,
    blocked: false,
  };
  const cocinaCentral: PanelTile = {
    id: 'cocina-central',
    href: '/cocina-central',
    label: 'Cocina central',
    sub: 'Gestión de sede central',
    Icon: ChefHat,
    blocked: isBlockedByPlan('cocina_central'),
  };
  const horarios: PanelTile = {
    id: 'personal',
    href: '/personal',
    label: 'Horarios',
    sub: 'Equipo, turnos y fichaje',
    Icon: CalendarDays,
    blocked: isBlockedByPlan('personal'),
  };
  const inventarioTile: PanelTile = {
    id: 'inventario',
    href: '/inventario',
    label: 'Inventario',
    sub: 'Stock y movimientos',
    Icon: ClipboardList,
    blocked: !showInventario || isBlockedByPlan('inventario'),
  };
  const chat: PanelTile = {
    id: 'chat',
    href: '/chat',
    label: 'Chat',
    sub: 'Mensajes del equipo',
    Icon: MessageCircle,
    blocked: !showChat || isBlockedByPlan('chat'),
  };
  const escandallos: PanelTile = {
    id: 'escandallos',
    href: '/escandallos',
    label: 'Escandallos',
    sub: 'Recetas y costes',
    Icon: Calculator,
    blocked: !showEscandallos || isBlockedByPlan('escandallos'),
  };
  const finanzasTile: PanelTile = {
    id: 'finanzas',
    href: '/finanzas',
    label: 'Finanzas',
    sub: 'Ventas, márgenes y análisis por local',
    Icon: BarChart3,
    blocked: isBlockedByPlan('finanzas'),
  };

  let row3Right: PanelTile | null = null;
  if (canAccessComidaPersonal(role)) {
    row3Right = consumoInterno;
  } else if (showPedidosCocina) {
    row3Right = pedirCentral;
  } else if (showCocinaCentral) {
    row3Right = cocinaCentral;
  }

  const row3UsesCocina = row3Right?.id === 'cocina-central';
  const row3UsesPedCocina = row3Right?.id === 'pedidos-cocina';

  let row4Right: PanelTile = inventarioTile;
  if (!showInventario) {
    if (showCocinaCentral && !row3UsesCocina) {
      row4Right = cocinaCentral;
    } else if (showPedidosCocina && !row3UsesPedCocina) {
      row4Right = pedirCentral;
    }
  }

  const cocinaInGrid = row3UsesCocina || row4Right.id === 'cocina-central';
  const pedirInGrid = row3UsesPedCocina || row4Right.id === 'pedidos-cocina';

  const needCocina = showCocinaCentral && !cocinaInGrid;
  const needPedir = showPedidosCocina && !pedirInGrid;
  const needFinanzas = showFinanzas;

  let row6Left: PanelTile | null = null;
  let row6Right: PanelTile | null = null;
  /** Fila 6: hasta 2 módulos; Finanzas usa la misma tarjeta que el resto (mitad de ancho). */
  if (needCocina && needFinanzas) {
    row6Left = cocinaCentral;
    row6Right = finanzasTile;
  } else if (needCocina && needPedir) {
    row6Left = cocinaCentral;
    row6Right = pedirCentral;
  } else if (needPedir && needFinanzas) {
    row6Left = pedirCentral;
    row6Right = finanzasTile;
  } else if (needCocina) {
    row6Left = cocinaCentral;
    if (needPedir) {
      row6Right = pedirCentral;
    }
  } else if (needPedir) {
    row6Left = pedirCentral;
    if (needFinanzas) {
      row6Right = finanzasTile;
    }
  } else if (needFinanzas) {
    row6Left = finanzasTile;
  }

  const gridRows: [PanelTile | null, PanelTile | null][] = [
    [mermas, appcc],
    [checklist, produccion],
    [servicio, row3Right],
    [horarios, row4Right],
    [chat, escandallos],
    [row6Left, row6Right],
  ];

  const pedidosBlocked = !showPedidos || isBlockedByPlan('pedidos');
  const featuredPedidos: Pick<PanelTile, 'href' | 'label' | 'sub' | 'Icon' | 'blocked'> = {
    href: '/pedidos',
    label: 'Pedidos',
    sub: 'Proveedores y recepción',
    Icon: ShoppingCart,
    blocked: pedidosBlocked,
  };

  return (
    <div className="-mx-4 bg-[#f5f5f7] px-4 pb-10 pt-2 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
      <div className="mx-auto max-w-full space-y-2.5 sm:max-w-2xl md:max-w-4xl lg:max-w-5xl sm:space-y-2.5">
        <ProductoGuiadoChecklist />

        {showPedidos ? <PanelFeaturedPedidosDark tile={featuredPedidos} /> : null}

        <div className="flex flex-col gap-y-2.5 sm:gap-y-2.5">
          {gridRows.map(([left, right], idx) => (
            <div key={idx} className="grid grid-cols-2 gap-x-2.5 gap-y-2.5 sm:gap-x-3 sm:gap-y-2.5">
              {left ? <PanelGridCard tile={left} /> : <PanelGridEmpty />}
              {right ? <PanelGridCard tile={right} /> : <PanelGridEmpty />}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
