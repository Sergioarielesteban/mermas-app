'use client';

import Link from 'next/link';
import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
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
  UtensilsCrossed,
} from 'lucide-react';
import { CHEF_ONE_TAPER_LINE_CLASS } from '@/components/ChefOneGlowLine';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { canAccessPedidos } from '@/lib/pedidos-access';

const LINE = `mx-auto mt-4 w-24 ${CHEF_ONE_TAPER_LINE_CLASS}`;

const COMING_SOON_SUB = 'Próximamente';

type TileProps = {
  href?: string;
  onClick?: () => void;
  label: string;
  sub?: string;
  Icon: LucideIcon;
  tone?: 'red' | 'zinc';
};

function HubTile({ href, onClick, label, sub, Icon, tone = 'zinc' }: TileProps) {
  const inner = (
    <>
      <div
        className={[
          'mb-4 grid h-14 w-14 place-items-center rounded-2xl shadow-inner',
          tone === 'red' ? 'bg-[#D32F2F]/15 text-[#D32F2F]' : 'bg-zinc-200/80 text-zinc-700',
        ].join(' ')}
      >
        <Icon className="h-7 w-7" strokeWidth={2.1} />
      </div>
      <span className="text-center text-xl font-semibold leading-tight tracking-tight text-zinc-900 sm:text-[1.35rem]">
        {label}
      </span>
      {sub ? (
        <span className="mt-2 block max-w-[16.5rem] px-1 text-center text-xs font-medium leading-snug text-zinc-500 sm:max-w-none">
          {sub}
        </span>
      ) : null}
      <span className={`mt-4 ${LINE}`} aria-hidden />
    </>
  );

  const className = [
    'flex w-full flex-col items-center rounded-3xl px-6 py-8 text-center outline-none transition-all duration-300 ease-out',
    'bg-zinc-50/80 ring-1 ring-zinc-200/90 hover:bg-white hover:ring-zinc-300',
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
  const { localCode, localName, localId, email } = useAuth();
  const showPedidos = canAccessPedidos(localCode, email, localName, localId);
  const [stubMessage, setStubMessage] = React.useState<string | null>(null);

  const onComingSoonModule = (name: string) => {
    setStubMessage(`${name}: próximamente.`);
    window.setTimeout(() => setStubMessage(null), 3200);
  };

  return (
    <div className="space-y-6">
      <MermasStyleHero
        eyebrow="CHEF-ONE"
        title="Panel de control"
        tagline="Toda tu cocina en la palma de tu mano."
        compact
      />

      {stubMessage ? (
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-950 ring-1 ring-amber-100">
          {stubMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4">
        <HubTile href="/dashboard" label="Mermas" sub="Registro y seguimiento" Icon={BookOpen} tone="red" />
        {showPedidos ? (
          <HubTile href="/pedidos" label="Pedidos" sub="Proveedores y recepción" Icon={ShoppingCart} tone="red" />
        ) : null}
        <HubTile
          href="/appcc"
          label="APPCC"
          sub="Limpieza, temperaturas, aceite y trazabilidad"
          Icon={ShieldCheck}
          tone="red"
        />
        <HubTile
          href="/checklist"
          label="Check list"
          sub="Apertura, turno, cierre e higiene con tus ítems"
          Icon={ListChecks}
          tone="red"
        />
        <HubTile
          href="/produccion"
          label="Producción"
          sub="Planes diarios o semanales por zonas y tareas"
          Icon={Factory}
          tone="red"
        />
        <HubTile href="/inventario" label="Inventario" sub="Stock y valor por local" Icon={ClipboardList} tone="red" />
        <HubTile
          href="/chat"
          label="Chat"
          sub="Habla con tu equipo del mismo local"
          Icon={MessageCircle}
          tone="red"
        />
        <HubTile
          href="/escandallos"
          label="Escandallos"
          sub="Recetas, food cost y centro de mando con gráficas"
          Icon={Calculator}
          tone="red"
        />
        <HubTile
          onClick={() => onComingSoonModule('Cocina central')}
          label="Cocina central"
          sub={COMING_SOON_SUB}
          Icon={ChefHat}
        />
        <HubTile
          onClick={() => onComingSoonModule('Horarios y fichaje')}
          label="Horarios y fichaje"
          sub={COMING_SOON_SUB}
          Icon={CalendarDays}
        />
        <HubTile
          href="/comida-personal"
          label="Comida de personal"
          sub="Registro rápido y coste interno"
          Icon={UtensilsCrossed}
          tone="red"
        />
      </div>
    </div>
  );
}
