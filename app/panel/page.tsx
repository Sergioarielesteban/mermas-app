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
  Icon: LucideIcon;
  blocked: boolean;
};

function panelHref(tile: PanelTile) {
  return tile.blocked ? '/planes' : tile.href;
}

function PanelGridEmpty() {
  return <div className="min-h-[5.5rem] rounded-[18px] bg-transparent" aria-hidden />;
}

function PanelGridCard({ tile }: { tile: PanelTile }) {
  const Icon = tile.Icon;
  return (
    <Link
      href={panelHref(tile)}
      className={[
        'panel-ref-card-white flex min-h-[5.5rem] flex-col justify-between rounded-[18px] bg-white p-3 text-left antialiased outline-none select-none touch-manipulation',
        tile.blocked ? 'panel-ref-card--blocked' : '',
        'focus-visible:ring-2 focus-visible:ring-[#D32F2F]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f5f7]',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#D32F2F]/15 text-[#D32F2F]">
          <Icon className="h-5 w-5" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-sm font-semibold leading-tight tracking-tight text-zinc-900">{tile.label}</p>
        </div>
        <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-[#D32F2F]" strokeWidth={2.25} aria-hidden />
      </div>
      <div className="mt-3 flex justify-center">
        <ChefOneGlowLine className="w-14 sm:w-16" />
      </div>
    </Link>
  );
}

function PanelFeaturedPedidos({ blocked }: { blocked: boolean }) {
  return (
    <Link
      href={blocked ? '/planes' : '/pedidos'}
      className={[
        'panel-ref-card-dark flex flex-col rounded-[18px] bg-gradient-to-br from-zinc-900 via-zinc-950 to-black px-4 py-4 text-left text-white antialiased outline-none select-none touch-manipulation',
        blocked ? 'panel-ref-card--blocked' : '',
        'focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f5f7]',
      ].join(' ')}
    >
      <div className="flex items-center gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
          <ShoppingCart className="h-7 w-7 text-[#D32F2F]" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[1.05rem] font-semibold leading-tight tracking-tight">Pedidos</p>
          <p className="mt-0.5 text-sm font-normal leading-snug text-zinc-400">Proveedores y recepción</p>
        </div>
        <ChevronRight className="h-6 w-6 shrink-0 text-[#D32F2F]" strokeWidth={2.25} aria-hidden />
      </div>
      <div className="mt-4 flex justify-center">
        <ChefOneGlowLine className="w-16 sm:w-20" />
      </div>
    </Link>
  );
}

function PanelFinanzasWide({ blocked }: { blocked: boolean }) {
  return (
    <Link
      href={blocked ? '/planes' : '/finanzas'}
      className={[
        'panel-ref-card-white flex flex-col rounded-[18px] bg-white px-4 py-4 text-left antialiased outline-none select-none touch-manipulation',
        blocked ? 'panel-ref-card--blocked' : '',
        'focus-visible:ring-2 focus-visible:ring-[#D32F2F]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f5f7]',
      ].join(' ')}
    >
      <div className="flex items-center gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#D32F2F]/15 text-[#D32F2F]">
          <BarChart3 className="h-6 w-6" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold leading-tight tracking-tight text-zinc-900">Finanzas</p>
          <p className="mt-0.5 text-sm font-normal leading-snug text-zinc-500">Ventas, márgenes y análisis por local</p>
        </div>
        <ChevronRight className="h-6 w-6 shrink-0 text-[#D32F2F]" strokeWidth={2.25} aria-hidden />
      </div>
      <div className="mt-4 flex justify-center">
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
    Icon: BookOpen,
    blocked: false,
  };
  const appcc: PanelTile = {
    id: 'appcc',
    href: '/appcc',
    label: 'APPCC',
    Icon: ShieldCheck,
    blocked: isBlockedByPlan('appcc'),
  };
  const checklist: PanelTile = {
    id: 'checklist',
    href: '/checklist',
    label: 'Check list',
    Icon: ListChecks,
    blocked: isBlockedByPlan('checklist'),
  };
  const produccion: PanelTile = {
    id: 'produccion',
    href: '/produccion',
    label: 'Producción',
    Icon: Factory,
    blocked: isBlockedByPlan('produccion'),
  };
  const servicio: PanelTile = {
    id: 'servicio',
    href: '/servicio',
    label: 'Servicio',
    Icon: Soup,
    blocked: isBlockedByPlan('servicio'),
  };
  const consumoInterno: PanelTile = {
    id: 'comida-personal',
    href: '/comida-personal',
    label: 'Consumo interno',
    Icon: UtensilsCrossed,
    blocked: isBlockedByPlan('comida_personal'),
  };
  const pedirCentral: PanelTile = {
    id: 'pedidos-cocina',
    href: '/pedidos-cocina',
    label: 'Pedir a central',
    Icon: Package,
    blocked: false,
  };
  const cocinaCentral: PanelTile = {
    id: 'cocina-central',
    href: '/cocina-central',
    label: 'Cocina central',
    Icon: ChefHat,
    blocked: isBlockedByPlan('cocina_central'),
  };
  const horarios: PanelTile = {
    id: 'personal',
    href: '/personal',
    label: 'Horarios',
    Icon: CalendarDays,
    blocked: isBlockedByPlan('personal'),
  };
  const inventarioTile: PanelTile = {
    id: 'inventario',
    href: '/inventario',
    label: 'Inventario',
    Icon: ClipboardList,
    blocked: !showInventario || isBlockedByPlan('inventario'),
  };
  const chat: PanelTile = {
    id: 'chat',
    href: '/chat',
    label: 'Chat',
    Icon: MessageCircle,
    blocked: !showChat || isBlockedByPlan('chat'),
  };
  const escandallos: PanelTile = {
    id: 'escandallos',
    href: '/escandallos',
    label: 'Escandallos',
    Icon: Calculator,
    blocked: !showEscandallos || isBlockedByPlan('escandallos'),
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

  const gridRows: [PanelTile, PanelTile | null][] = [
    [mermas, appcc],
    [checklist, produccion],
    [servicio, row3Right],
    [horarios, row4Right],
    [chat, escandallos],
  ];

  const cocinaInGrid = row3UsesCocina || row4Right.id === 'cocina-central';
  const pedirCentralInGrid = row3UsesPedCocina || row4Right.id === 'pedidos-cocina';

  /** Fila extra: Cocina central si el rol la tiene y aún no salía en la rejilla (p. ej. fila 3 = Consumo interno). */
  const cocinaCentralRow: [PanelTile, PanelTile | null] | null =
    showCocinaCentral && !cocinaInGrid
      ? [
          cocinaCentral,
          showPedidosCocina && !pedirCentralInGrid ? pedirCentral : null,
        ]
      : null;

  const pedidosBlocked = !showPedidos || isBlockedByPlan('pedidos');
  const finanzasBlocked = !showFinanzas || isBlockedByPlan('finanzas');

  return (
    <div className="-mx-4 bg-[#f5f5f7] px-4 pb-10 pt-2 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
      <div className="mx-auto max-w-full space-y-3.5 sm:max-w-2xl md:max-w-4xl lg:max-w-5xl">
        <ProductoGuiadoChecklist />

        {showPedidos ? (
          <PanelFeaturedPedidos blocked={pedidosBlocked} />
        ) : null}

        <div className="flex flex-col gap-y-3.5">
          {gridRows.map(([left, right], idx) => (
            <div key={idx} className="grid grid-cols-2 gap-3">
              <PanelGridCard tile={left} />
              {right ? <PanelGridCard tile={right} /> : <PanelGridEmpty />}
            </div>
          ))}
          {cocinaCentralRow ? (
            <div className="grid grid-cols-2 gap-3">
              <PanelGridCard tile={cocinaCentralRow[0]} />
              {cocinaCentralRow[1] ? <PanelGridCard tile={cocinaCentralRow[1]} /> : <PanelGridEmpty />}
            </div>
          ) : null}
        </div>

        {showFinanzas ? (
          <div className="pt-0.5">
            <PanelFinanzasWide blocked={finanzasBlocked} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
