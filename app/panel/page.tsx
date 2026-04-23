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

function PanelCellEmpty() {
  return <div className="min-h-[4.25rem] rounded-[18px] bg-transparent" aria-hidden />;
}

type CardLayout = 'hero' | 'grid' | 'footer';

/** Tarjeta oscura: icono, título, subtítulo, flecha, línea roja (~10% más baja que la referencia anterior). */
function PanelDarkModuleCard({ tile, layout = 'grid' }: { tile: PanelTile; layout?: CardLayout }) {
  const Icon = tile.Icon;
  const isHero = layout === 'hero';
  const isFooter = layout === 'footer';
  const pad = isHero || isFooter ? 'px-3.5 py-2.5 sm:px-4 sm:py-2.5' : 'px-3 py-2.5 sm:px-3.5';
  const rowGap = isHero || isFooter ? 'gap-3' : 'gap-2.5';
  const chev = isFooter ? 'h-5 w-5 sm:h-6 sm:w-6' : 'h-5 w-5';

  return (
    <Link
      href={panelHref(tile)}
      className={[
        'panel-ref-card-dark flex flex-col rounded-[18px] bg-gradient-to-br from-zinc-900 via-zinc-950 to-black text-left text-white antialiased outline-none select-none touch-manipulation',
        isHero ? 'w-full' : '',
        pad,
        tile.blocked ? 'panel-ref-card--blocked opacity-[0.58]' : '',
        'focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f5f7]',
      ].join(' ')}
    >
      <div className={`flex items-center ${rowGap}`}>
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[#f5dede]/35 ring-1 ring-[#D32F2F]/15">
          <Icon className="h-7 w-7 text-[#D32F2F]" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[1.02rem] font-semibold leading-[1.2] tracking-tight">{tile.label}</p>
          <p className="mt-0.5 text-sm font-normal leading-snug text-zinc-400">{tile.sub}</p>
        </div>
        <ChevronRight className={`shrink-0 text-[#D32F2F] ${chev}`} strokeWidth={2.25} aria-hidden />
      </div>
      <div className="mt-2 flex justify-center">
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

  const pedidosBlocked = !showPedidos || isBlockedByPlan('pedidos');
  const finanzasBlocked = !showFinanzas || isBlockedByPlan('finanzas');

  const pedidosTile: PanelTile = {
    id: 'pedidos',
    href: '/pedidos',
    label: 'Pedidos',
    sub: 'Proveedores y recepción',
    Icon: ShoppingCart,
    blocked: pedidosBlocked,
  };
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
    sub: 'Limpieza, temperaturas, aceite y trazabilidad',
    Icon: ShieldCheck,
    blocked: isBlockedByPlan('appcc'),
  };
  const checklist: PanelTile = {
    id: 'checklist',
    href: '/checklist',
    label: 'Check list',
    sub: 'Apertura, turno, cierre e higiene con tus ítems',
    Icon: ListChecks,
    blocked: isBlockedByPlan('checklist'),
  };
  const produccion: PanelTile = {
    id: 'produccion',
    href: '/produccion',
    label: 'Producción',
    sub: 'Planes diarios o semanales por zonas y tareas',
    Icon: Factory,
    blocked: isBlockedByPlan('produccion'),
  };
  const servicio: PanelTile = {
    id: 'servicio',
    href: '/servicio',
    label: 'Servicio',
    sub: 'Platos del día, pasos y mise en place',
    Icon: Soup,
    blocked: isBlockedByPlan('servicio'),
  };
  const consumoInterno: PanelTile = {
    id: 'comida-personal',
    href: '/comida-personal',
    label: 'Consumo interno',
    sub: 'Registro rápido y coste interno',
    Icon: UtensilsCrossed,
    blocked: isBlockedByPlan('comida_personal'),
  };
  const pedirCentral: PanelTile = {
    id: 'pedidos-cocina',
    href: '/pedidos-cocina',
    label: 'Pedir a central',
    sub: 'Catálogo con precios y fecha de entrega',
    Icon: Package,
    blocked: false,
  };
  const cocinaCentral: PanelTile = {
    id: 'cocina-central',
    href: '/cocina-central',
    label: 'Cocina central',
    sub: 'Producción, lotes, entregas y QR',
    Icon: ChefHat,
    blocked: isBlockedByPlan('cocina_central'),
  };
  const horarios: PanelTile = {
    id: 'personal',
    href: '/personal',
    label: 'Horarios',
    sub: 'Horarios, cuadrante y fichajes',
    Icon: CalendarDays,
    blocked: isBlockedByPlan('personal'),
  };
  const inventarioTile: PanelTile = {
    id: 'inventario',
    href: '/inventario',
    label: 'Inventario',
    sub: 'Stock y valor por local',
    Icon: ClipboardList,
    blocked: !showInventario || isBlockedByPlan('inventario'),
  };
  const chat: PanelTile = {
    id: 'chat',
    href: '/chat',
    label: 'Chat',
    sub: 'Habla con tu equipo del mismo local',
    Icon: MessageCircle,
    blocked: !showChat || isBlockedByPlan('chat'),
  };
  const escandallos: PanelTile = {
    id: 'escandallos',
    href: '/escandallos',
    label: 'Escandallos',
    sub: 'Recetas, food cost y centro de mando con gráficas',
    Icon: Calculator,
    blocked: !showEscandallos || isBlockedByPlan('escandallos'),
  };
  const finanzasTile: PanelTile = {
    id: 'finanzas',
    href: '/finanzas',
    label: 'Finanzas',
    sub: 'Ventas, márgenes y análisis por local',
    Icon: BarChart3,
    blocked: finanzasBlocked,
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

  let row6Left: PanelTile | null = null;
  let row6Right: PanelTile | null = null;
  if (showCocinaCentral && !cocinaInGrid) {
    row6Left = cocinaCentral;
  }
  if (showPedidosCocina && !pedirInGrid) {
    row6Right = pedirCentral;
  }
  if (!row6Left && row6Right) {
    row6Left = row6Right;
    row6Right = null;
  }

  const gridBody: [PanelTile | null, PanelTile | null][] = [
    [mermas, appcc],
    [checklist, produccion],
    [servicio, row3Right],
    [horarios, row4Right],
    [chat, escandallos],
    [row6Left, row6Right],
  ];

  return (
    <div className="-mx-4 bg-[#f5f5f7] px-4 pb-10 pt-2 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
      <div className="mx-auto max-w-full space-y-2.5 sm:max-w-2xl md:max-w-4xl lg:max-w-5xl">
        <ProductoGuiadoChecklist />

        <div className="flex flex-col gap-y-2.5 sm:gap-y-2.5">
          {showPedidos ? (
            <div className="w-full">
              <PanelDarkModuleCard tile={pedidosTile} layout="hero" />
            </div>
          ) : null}

          {gridBody.map(([left, right], idx) => (
            <div key={idx} className="grid grid-cols-2 gap-x-2.5 gap-y-2 sm:gap-x-3 sm:gap-y-2.5">
              {left ? <PanelDarkModuleCard tile={left} /> : <PanelCellEmpty />}
              {right ? <PanelDarkModuleCard tile={right} /> : <PanelCellEmpty />}
            </div>
          ))}
        </div>

        {showFinanzas ? (
          <div className="pt-0.5">
            <PanelDarkModuleCard tile={finanzasTile} layout="footer" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
