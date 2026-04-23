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
  /** Subtítulo bajo el título (referencia visual). */
  sub: string;
  Icon: LucideIcon;
  blocked: boolean;
};

function panelHref(tile: PanelTile) {
  return tile.blocked ? '/planes' : tile.href;
}

function PanelCellEmpty() {
  return <div className="min-h-[4.75rem] rounded-[18px] bg-transparent" aria-hidden />;
}

/** Tarjeta oscura unificada (referencia): icono, título, subtítulo, flecha, línea roja. */
function PanelDarkModuleCard({ tile, wide }: { tile: PanelTile; wide?: boolean }) {
  const Icon = tile.Icon;
  return (
    <Link
      href={panelHref(tile)}
      className={[
        'panel-ref-card-dark flex flex-col rounded-[18px] bg-gradient-to-br from-zinc-900 via-zinc-950 to-black text-left text-white antialiased outline-none select-none touch-manipulation',
        wide ? 'px-3.5 py-3 sm:px-4 sm:py-3.5' : 'px-3.5 py-3 sm:px-3.5',
        tile.blocked ? 'panel-ref-card--blocked opacity-[0.58]' : '',
        'focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f5f7]',
      ].join(' ')}
    >
      <div className={`flex items-center ${wide ? 'gap-3.5' : 'gap-3'}`}>
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
          <Icon className="h-7 w-7 text-[#D32F2F]" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[1.02rem] font-semibold leading-[1.2] tracking-tight">{tile.label}</p>
          <p className="mt-0.5 text-sm font-normal leading-snug text-zinc-400">{tile.sub}</p>
        </div>
        <ChevronRight
          className={`shrink-0 text-[#D32F2F] ${wide ? 'h-5 w-5 sm:h-6 sm:w-6' : 'h-5 w-5'}`}
          strokeWidth={2.25}
          aria-hidden
        />
      </div>
      <div className="mt-3 flex justify-center">
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

  let row4Left: PanelTile | null = null;
  if (canAccessComidaPersonal(role)) {
    row4Left = consumoInterno;
  } else if (showPedidosCocina) {
    row4Left = pedirCentral;
  } else if (showCocinaCentral) {
    row4Left = cocinaCentral;
  }

  const row4UsesPedir = row4Left?.id === 'pedidos-cocina';
  const row4UsesCocina = row4Left?.id === 'cocina-central';

  let row6Right: PanelTile | null = null;
  if (showCocinaCentral && !row4UsesCocina) {
    row6Right = cocinaCentral;
  } else if (showPedidosCocina && !row4UsesPedir) {
    row6Right = pedirCentral;
  }

  /** Orden referencia (con Pedidos): 6 filas × 2 columnas + Finanzas ancha. */
  const gridRowsWithPedidos: [PanelTile | null, PanelTile | null][] = [
    [pedidosTile, mermas],
    [appcc, checklist],
    [produccion, servicio],
    [row4Left, horarios],
    [inventarioTile, chat],
    [escandallos, row6Right],
  ];

  /** Sin módulo Pedidos en cabecera: mismas filas sustituyendo la primera. */
  const gridRowsNoPedidos = ((): [PanelTile | null, PanelTile | null][] => {
    const r3Right: PanelTile | null = canAccessComidaPersonal(role)
      ? consumoInterno
      : showPedidosCocina
        ? pedirCentral
        : showCocinaCentral
          ? cocinaCentral
          : null;
    const r3UsesCocina = r3Right?.id === 'cocina-central';
    const r3UsesPed = r3Right?.id === 'pedidos-cocina';

    let r4Right: PanelTile = inventarioTile;
    if (!showInventario) {
      if (showCocinaCentral && !r3UsesCocina) {
        r4Right = cocinaCentral;
      } else if (showPedidosCocina && !r3UsesPed) {
        r4Right = pedirCentral;
      }
    }

    const cocinaIn = r3UsesCocina || r4Right.id === 'cocina-central';
    const pedirIn = r3UsesPed || r4Right.id === 'pedidos-cocina';

    let r6R: PanelTile | null = null;
    if (showCocinaCentral && !cocinaIn) {
      r6R = cocinaCentral;
    } else if (showPedidosCocina && !pedirIn) {
      r6R = pedirCentral;
    }

    return [
      [mermas, appcc],
      [checklist, produccion],
      [servicio, r3Right],
      [horarios, r4Right],
      [chat, escandallos],
      [r6R, null],
    ];
  })();

  const rows = showPedidos ? gridRowsWithPedidos : gridRowsNoPedidos;

  return (
    <div className="-mx-4 bg-[#f5f5f7] px-4 pb-10 pt-2 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
      <div className="mx-auto max-w-full space-y-3 sm:max-w-2xl md:max-w-4xl lg:max-w-5xl">
        <ProductoGuiadoChecklist />

        <div className="flex flex-col gap-y-3">
          {rows.map(([left, right], idx) => (
            <div key={idx} className="grid grid-cols-2 gap-x-2.5 gap-y-2.5 sm:gap-x-3 sm:gap-y-3">
              {left ? <PanelDarkModuleCard tile={left} /> : <PanelCellEmpty />}
              {right ? <PanelDarkModuleCard tile={right} /> : <PanelCellEmpty />}
            </div>
          ))}
        </div>

        {showFinanzas ? (
          <div className="pt-0.5">
            <PanelDarkModuleCard tile={finanzasTile} wide />
          </div>
        ) : null}
      </div>
    </div>
  );
}
