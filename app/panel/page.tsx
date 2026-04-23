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

const LINE = `mx-auto mt-1 w-16 ${CHEF_ONE_TAPER_LINE_CLASS}`;

type TileProps = {
  href?: string;
  onClick?: () => void;
  label: string;
  Icon: LucideIcon;
  tone?: 'red' | 'zinc';
  blocked?: boolean;
};

function HubTile({ href, onClick, label, Icon, tone = 'zinc', blocked = false }: TileProps) {
  const inner = (
    <>
      <div
        className={[
          'mb-0.5 grid h-7 w-7 place-items-center rounded-xl shadow-inner sm:h-7 sm:w-7',
          tone === 'red' ? 'bg-[#D32F2F]/15 text-[#D32F2F]' : 'bg-zinc-200/80 text-zinc-700',
        ].join(' ')}
      >
        <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" strokeWidth={2.1} />
      </div>
      <span className="block max-w-full truncate whitespace-nowrap px-0.5 text-center text-[11px] font-semibold leading-none tracking-tight text-zinc-900 sm:text-xs">
        {label}
      </span>
      {blocked ? (
        <span className="mt-0.5 inline-flex max-w-full items-center gap-0.5 truncate rounded-full bg-zinc-100 px-1.5 py-px text-[9px] font-extrabold uppercase tracking-wide text-zinc-600">
          <Lock className="h-2.5 w-2.5 shrink-0" />
          Bloqueado
        </span>
      ) : null}
      {blocked ? (
        <span className="mt-0.5 block max-w-full truncate px-0.5 text-center text-[9px] font-semibold leading-snug text-zinc-500 sm:text-[10px]">
          Disponible en plan superior
        </span>
      ) : null}
      <span className={LINE} aria-hidden />
    </>
  );

  const className = [
    'flex w-full flex-col items-center rounded-2xl px-1.5 py-2 text-center outline-none transition-all duration-300 ease-out sm:px-2 sm:py-2.5',
    'bg-zinc-50/80 ring-1 ring-zinc-200/90 hover:bg-white hover:ring-zinc-300',
    blocked ? 'opacity-55' : '',
    'focus-visible:ring-2 focus-visible:ring-[#D32F2F]/40 focus-visible:ring-offset-2',
    'active:scale-[0.99]',
  ].join(' ');

  if (href) {
    const targetHref = blocked ? '/planes' : href;
    return (
      <Link href={targetHref} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
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

  return (
    <div className="space-y-2.5 sm:space-y-3">
      <MermasStyleHero title="Panel de control" slim compactTitle />

      <ProductoGuiadoChecklist />

      <div className="grid grid-cols-3 gap-x-2 gap-y-1 sm:gap-x-2.5 sm:gap-y-1.5">
        <HubTile href="/dashboard" label="Mermas" Icon={BookOpen} tone="red" />
        {showPedidos ? (
          <HubTile
            href="/pedidos"
            label="Pedidos"
            Icon={ShoppingCart}
            tone="red"
            blocked={isBlockedByPlan('pedidos')}
          />
        ) : null}
        {showPedidosCocina ? (
          <HubTile
            href="/pedidos-cocina"
            label="Pedir a central"
            Icon={Package}
            tone="red"
          />
        ) : null}
        <HubTile
          href="/appcc"
          label="APPCC"
          Icon={ShieldCheck}
          tone="red"
          blocked={isBlockedByPlan('appcc')}
        />
        <HubTile
          href="/checklist"
          label="Check list"
          Icon={ListChecks}
          tone="red"
          blocked={isBlockedByPlan('checklist')}
        />
        <HubTile
          href="/produccion"
          label="Producción"
          Icon={Factory}
          tone="red"
          blocked={isBlockedByPlan('produccion')}
        />
        <HubTile
          href="/servicio"
          label="Servicio"
          Icon={Soup}
          tone="red"
          blocked={isBlockedByPlan('servicio')}
        />
        {canAccessComidaPersonal(role) ? (
          <HubTile
            href="/comida-personal"
            label="Consumo interno"
            Icon={UtensilsCrossed}
            tone="red"
            blocked={isBlockedByPlan('comida_personal')}
          />
        ) : null}
        <HubTile
          href="/personal"
          label="Horarios"
          Icon={CalendarDays}
          tone="red"
          blocked={isBlockedByPlan('personal')}
        />
        {showInventario ? (
          <HubTile
            href="/inventario"
            label="Inventario"
            Icon={ClipboardList}
            tone="red"
            blocked={isBlockedByPlan('inventario')}
          />
        ) : null}
        {showChat ? (
          <HubTile
            href="/chat"
            label="Chat"
            Icon={MessageCircle}
            tone="red"
            blocked={isBlockedByPlan('chat')}
          />
        ) : null}
        {showEscandallos ? (
          <HubTile
            href="/escandallos"
            label="Escandallos"
            Icon={Calculator}
            tone="red"
            blocked={isBlockedByPlan('escandallos')}
          />
        ) : null}
        {showCocinaCentral ? (
          <HubTile
            href="/cocina-central"
            label="Cocina central"
            Icon={ChefHat}
            tone="red"
            blocked={isBlockedByPlan('cocina_central')}
          />
        ) : null}
        {showFinanzas ? (
          <HubTile
            href="/finanzas"
            label="Finanzas"
            Icon={BarChart3}
            tone="red"
            blocked={isBlockedByPlan('finanzas')}
          />
        ) : null}
      </div>
    </div>
  );
}
