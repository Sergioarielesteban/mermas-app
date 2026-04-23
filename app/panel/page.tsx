'use client';

import Link from 'next/link';
import React, { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  BookOpen,
  Calculator,
  CalendarDays,
  ChefHat,
  ClipboardList,
  Factory,
  ListChecks,
  MessageCircle,
  ShieldCheck,
  ShoppingCart,
  Package,
  UtensilsCrossed,
  Lock,
  Soup,
} from 'lucide-react';
import { CHEF_ONE_TAPER_LINE_CLASS } from '@/components/ChefOneGlowLine';
import MermasStyleHero from '@/components/MermasStyleHero';
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

const LINE = `mx-auto mt-1.5 w-16 ${CHEF_ONE_TAPER_LINE_CLASS}`;

type HubEntry = {
  id: string;
  href: string;
  label: string;
  Icon: LucideIcon;
  blocked: boolean;
};

type HubTileProps = HubEntry & {
  index: number;
  onClick?: () => void;
};

function HubTile({ id: _tileId, href, onClick, label, Icon, blocked, index }: HubTileProps) {
  const inner = (
    <div className="flex min-h-[5.25rem] w-full flex-col items-center justify-between gap-1.5 py-0.5">
      <div className="flex flex-col items-center gap-1">
        <div
          className={[
            'grid h-11 w-11 shrink-0 place-items-center rounded-full shadow-inner',
            'bg-[#D32F2F]/15 text-[#D32F2F]',
          ].join(' ')}
        >
          <Icon className="h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem]" strokeWidth={2} />
        </div>
        <span className="max-w-full truncate whitespace-nowrap px-0.5 text-center text-[10px] font-medium leading-tight tracking-tight text-zinc-800 sm:text-[11px]">
          {label}
        </span>
        {blocked ? (
          <span className="inline-flex max-w-full items-center gap-0.5 truncate rounded-full bg-zinc-100 px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide text-zinc-600">
            <Lock className="h-2.5 w-2.5 shrink-0" />
            Bloqueado
          </span>
        ) : null}
        {blocked ? (
          <span className="max-w-full truncate px-0.5 text-center text-[8px] font-medium leading-snug text-zinc-500 sm:text-[9px]">
            Plan superior
          </span>
        ) : null}
      </div>
      <span className={LINE} aria-hidden />
    </div>
  );

  const interactive = [
    'panel-hub-tile panel-hub-tile--enter flex w-full flex-col items-center rounded-[18px] bg-white text-center antialiased outline-none select-none touch-manipulation',
    blocked ? 'panel-hub-tile--blocked' : '',
    'focus-visible:ring-2 focus-visible:ring-[#D32F2F]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f5f7]',
  ].join(' ');

  const style = { animationDelay: `${index * 32}ms` } as React.CSSProperties;

  if (href) {
    const targetHref = blocked ? '/planes' : href;
    return (
      <Link href={targetHref} className={interactive} style={style}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={interactive} style={style}>
      {inner}
    </button>
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

  const hubEntries = useMemo(() => {
    const out: HubEntry[] = [
      { id: 'mermas', href: '/dashboard', label: 'Mermas', Icon: BookOpen, blocked: false },
    ];
    if (showPedidos) {
      out.push({
        id: 'pedidos',
        href: '/pedidos',
        label: 'Pedidos',
        Icon: ShoppingCart,
        blocked: isBlockedByPlan('pedidos'),
      });
    }
    if (showPedidosCocina) {
      out.push({ id: 'pedidos-cocina', href: '/pedidos-cocina', label: 'Pedir a central', Icon: Package, blocked: false });
    }
    out.push(
      { id: 'appcc', href: '/appcc', label: 'APPCC', Icon: ShieldCheck, blocked: isBlockedByPlan('appcc') },
      { id: 'checklist', href: '/checklist', label: 'Check list', Icon: ListChecks, blocked: isBlockedByPlan('checklist') },
      { id: 'produccion', href: '/produccion', label: 'Producción', Icon: Factory, blocked: isBlockedByPlan('produccion') },
      { id: 'servicio', href: '/servicio', label: 'Servicio', Icon: Soup, blocked: isBlockedByPlan('servicio') },
    );
    if (canAccessComidaPersonal(role)) {
      out.push({
        id: 'comida-personal',
        href: '/comida-personal',
        label: 'Consumo interno',
        Icon: UtensilsCrossed,
        blocked: isBlockedByPlan('comida_personal'),
      });
    }
    out.push({
      id: 'personal',
      href: '/personal',
      label: 'Horarios',
      Icon: CalendarDays,
      blocked: isBlockedByPlan('personal'),
    });
    if (showInventario) {
      out.push({
        id: 'inventario',
        href: '/inventario',
        label: 'Inventario',
        Icon: ClipboardList,
        blocked: isBlockedByPlan('inventario'),
      });
    }
    if (showChat) {
      out.push({ id: 'chat', href: '/chat', label: 'Chat', Icon: MessageCircle, blocked: isBlockedByPlan('chat') });
    }
    if (showEscandallos) {
      out.push({
        id: 'escandallos',
        href: '/escandallos',
        label: 'Escandallos',
        Icon: Calculator,
        blocked: isBlockedByPlan('escandallos'),
      });
    }
    if (showCocinaCentral) {
      out.push({
        id: 'cocina-central',
        href: '/cocina-central',
        label: 'Cocina central',
        Icon: ChefHat,
        blocked: isBlockedByPlan('cocina_central'),
      });
    }
    if (showFinanzas) {
      out.push({
        id: 'finanzas',
        href: '/finanzas',
        label: 'Finanzas',
        Icon: BarChart3,
        blocked: isBlockedByPlan('finanzas'),
      });
    }
    return out;
  }, [
    isBlockedByPlan,
    role,
    showCocinaCentral,
    showChat,
    showEscandallos,
    showFinanzas,
    showInventario,
    showPedidos,
    showPedidosCocina,
  ]);

  return (
    <div className="-mx-4 bg-[#f5f5f7] px-4 pb-10 pt-1 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
      <div className="mx-auto max-w-full space-y-3 sm:max-w-2xl sm:space-y-3.5 md:max-w-4xl lg:max-w-5xl">
        <MermasStyleHero title="Panel de control" slim compactTitle condensed />

        <ProductoGuiadoChecklist />

        <div className="grid grid-cols-3 gap-x-[11px] gap-y-[13px] pb-1 sm:gap-x-3 sm:gap-y-3.5">
          {hubEntries.map((entry, index) => (
            <HubTile key={entry.id} {...entry} index={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
