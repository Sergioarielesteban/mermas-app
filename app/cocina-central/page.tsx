'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  Package,
  Truck,
  QrCode,
  Inbox,
  Factory,
  ShoppingBag,
  ListOrdered,
  Warehouse,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { canCocinaCentralOperate, canManageDeliveries } from '@/lib/cocina-central-permissions';

function Tile({
  href,
  label,
  sub,
  icon: Icon,
}: {
  href: string;
  label: string;
  sub: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[72px] flex-col justify-center rounded-2xl bg-zinc-50 px-3 py-3 ring-1 ring-zinc-200 transition hover:bg-white hover:ring-zinc-300 active:scale-[0.99]"
    >
      <Icon className="mb-1.5 h-6 w-6 text-[#D32F2F]" strokeWidth={2} />
      <span className="text-sm font-extrabold uppercase tracking-wide text-zinc-900">{label}</span>
      <span className="mt-0.5 text-[10px] font-medium leading-snug text-zinc-600">{sub}</span>
    </Link>
  );
}

export default function CocinaCentralHubPage() {
  const { isCentralKitchen, profileReady, profileRole } = useAuth();
  const supabaseOk = isSupabaseEnabled() && !!getSupabaseClient();
  const operate = canCocinaCentralOperate(isCentralKitchen, profileRole);
  const deliveries = canManageDeliveries(isCentralKitchen, profileRole);

  if (!profileReady) {
    return <p className="text-center text-sm text-zinc-500">Cargando perfil…</p>;
  }

  if (!supabaseOk) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Supabase no está configurado en este entorno.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {operate ? (
          <>
            <Tile
              href="/cocina-central/produccion"
              label="Producción"
              sub="Órdenes y registro de lotes"
              icon={Factory}
            />
            <Tile href="/cocina-central/lotes" label="Lotes y stock" sub="Por sede y estado" icon={Package} />
            <Tile href="/cocina-central/escanear" label="Escanear QR" sub="Ficha rápida del lote" icon={QrCode} />
            <Tile
              href="/cocina-central/inventario-interno"
              label="Inventario interno"
              sub="Referencia interna (locales no ven)"
              icon={Warehouse}
            />
          </>
        ) : null}

        {deliveries ? (
          <>
            <Tile
              href="/cocina-central/entregas"
              label="Entregas"
              sub="Preparar, confirmar salida y PDF"
              icon={Truck}
            />
            <Tile
              href="/cocina-central/pedidos-sedes"
              label="Pedidos de sedes"
              sub="Entrantes, totales e informe PDF"
              icon={ShoppingBag}
            />
            <Tile
              href="/cocina-central/catalogo-sedes"
              label="Catálogo para sedes"
              sub="Productos y precios (sin stock)"
              icon={ListOrdered}
            />
          </>
        ) : null}

        {!isCentralKitchen ? (
          <Tile
            href="/cocina-central/recepciones"
            label="Recepciones"
            sub="Entregas entrantes y firma"
            icon={Inbox}
          />
        ) : null}

        {operate ? (
          <Tile href="/cocina-central/recepciones" label="Mis recepciones" sub="Si también recibes stock" icon={Inbox} />
        ) : null}
      </div>
    </div>
  );
}
