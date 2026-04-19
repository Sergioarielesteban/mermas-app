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
import { canAccessModule } from '@/lib/canAccessModule';

const LINE = `mx-auto mt-4 w-24 ${CHEF_ONE_TAPER_LINE_CLASS}`;

type TileProps = {
  href?: string;
  onClick?: () => void;
  label: string;
  sub?: string;
  Icon: LucideIcon;
  tone?: 'red' | 'zinc';
  blocked?: boolean;
};

function HubTile({ href, onClick, label, sub, Icon, tone = 'zinc', blocked = false }: TileProps) {
  const inner = (
    <>
      <div
        className={[
          'mb-4 grid h-14 w-14 place-items-center rounded-2xl shadow-inner md:h-16 md:w-16',
          tone === 'red' ? 'bg-[#D32F2F]/15 text-[#D32F2F]' : 'bg-zinc-200/80 text-zinc-700',
        ].join(' ')}
      >
        <Icon className="h-7 w-7 md:h-8 md:w-8" strokeWidth={2.1} />
      </div>
      <span className="text-center text-xl font-semibold leading-tight tracking-tight text-zinc-900 sm:text-[1.35rem]">
        {label}
      </span>
      {blocked ? (
        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-zinc-600">
          <Lock className="h-3 w-3" />
          Bloqueado
        </span>
      ) : null}
      {sub ? (
        <span className="mt-2 block max-w-[16.5rem] px-1 text-center text-xs font-medium leading-snug text-zinc-500 sm:max-w-none">
          {sub}
        </span>
      ) : null}
      {blocked ? (
        <span className="mt-1 block max-w-[16.5rem] px-1 text-center text-[11px] font-semibold leading-snug text-zinc-500 sm:max-w-none">
          Disponible en plan superior
        </span>
      ) : null}
      <span className={`mt-4 ${LINE}`} aria-hidden />
    </>
  );

  const className = [
    'flex w-full flex-col items-center rounded-3xl px-6 py-8 text-center outline-none transition-all duration-300 ease-out md:px-5 md:py-7',
    'bg-zinc-50/80 ring-1 ring-zinc-200/90 hover:bg-white hover:ring-zinc-300',
    blocked ? 'opacity-55' : '',
    'focus-visible:ring-2 focus-visible:ring-[#D32F2F]/40 focus-visible:ring-offset-2',
    'active:scale-[0.99]',
  ].join(' ');

  if (href) {
    return (
      <Link href={href} className={className}>
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
  const { localCode, localName, localId, email, profileRole, isCentralKitchen, plan } = useAuth();
  const role = profileRole ?? 'staff';
  const showCocinaCentral = canAccessCocinaCentralModule(profileRole);
  const showPedidos = canAccessPedidos(localCode, email, localName, localId) && canAccessPedidosByRole(role);
  const showPedidosCocina = canPlaceCentralSupplyOrder(isCentralKitchen, localId);
  const showFinanzas = showPedidos && canAccessFinanzas(role);
  const showEscandallos = canAccessEscandallos(role);
  const showInventario = canAccessInventario(role);
  const showChat = canAccessChat(role);

  return (
    <div className="space-y-6">
      <MermasStyleHero
        eyebrow="CHEF-ONE"
        title="Panel de control"
        tagline="Toda tu cocina en la palma de tu mano."
        compact
      />

      <ProductoGuiadoChecklist />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:gap-5 lg:grid-cols-4">
        <HubTile href="/dashboard" label="Mermas" sub="Registro y seguimiento" Icon={BookOpen} tone="red" />
        {showPedidos ? (
          <HubTile
            href="/pedidos"
            label="Pedidos"
            sub="Proveedores y recepción"
            Icon={ShoppingCart}
            tone="red"
            blocked={!canAccessModule({ plan, role }, 'pedidos')}
          />
        ) : null}
        {showPedidosCocina ? (
          <HubTile
            href="/pedidos-cocina"
            label="Pedir a central"
            sub="Catálogo con precios y fecha de entrega"
            Icon={Package}
            tone="red"
          />
        ) : null}
        <HubTile
          href="/appcc"
          label="APPCC"
          sub="Limpieza, temperaturas, aceite y trazabilidad"
          Icon={ShieldCheck}
          tone="red"
          blocked={!canAccessModule({ plan, role }, 'appcc')}
        />
        <HubTile
          href="/checklist"
          label="Check list"
          sub="Apertura, turno, cierre e higiene con tus ítems"
          Icon={ListChecks}
          tone="red"
          blocked={!canAccessModule({ plan, role }, 'checklist')}
        />
        <HubTile
          href="/produccion"
          label="Producción"
          sub="Planes diarios o semanales por zonas y tareas"
          Icon={Factory}
          tone="red"
          blocked={!canAccessModule({ plan, role }, 'produccion')}
        />
        {canAccessComidaPersonal(role) ? (
          <HubTile
            href="/comida-personal"
            label="Comida de personal"
            sub="Registro rápido y coste interno"
            Icon={UtensilsCrossed}
            tone="red"
            blocked={!canAccessModule({ plan, role }, 'comida_personal')}
          />
        ) : null}
        <HubTile
          href="/personal"
          label="Horarios"
          sub="Horarios, cuadrante y fichajes"
          Icon={CalendarDays}
          tone="red"
          blocked={!canAccessModule({ plan, role }, 'personal')}
        />
        {showInventario ? (
          <HubTile
            href="/inventario"
            label="Inventario"
            sub="Stock y valor por local"
            Icon={ClipboardList}
            tone="red"
            blocked={!canAccessModule({ plan, role }, 'inventario')}
          />
        ) : null}
        {showChat ? (
          <HubTile
            href="/chat"
            label="Chat"
            sub="Habla con tu equipo del mismo local"
            Icon={MessageCircle}
            tone="red"
            blocked={!canAccessModule({ plan, role }, 'chat')}
          />
        ) : null}
        {showEscandallos ? (
          <HubTile
            href="/escandallos"
            label="Escandallos"
            sub="Recetas, food cost y centro de mando con gráficas"
            Icon={Calculator}
            tone="red"
            blocked={!canAccessModule({ plan, role }, 'escandallos')}
          />
        ) : null}
        {showCocinaCentral ? (
          <HubTile
            href="/cocina-central"
            label="Cocina central"
            sub="Producción, lotes, entregas y QR"
            Icon={ChefHat}
            tone="red"
            blocked={!canAccessModule({ plan, role }, 'cocina_central')}
          />
        ) : null}
        {showFinanzas ? (
          <HubTile
            href="/finanzas"
            label="Finanzas"
            sub="Gasto, salud del negocio y compras vs albaranes"
            Icon={BarChart3}
            tone="red"
            blocked={!canAccessModule({ plan, role }, 'finanzas')}
          />
        ) : null}
      </div>
    </div>
  );
}
