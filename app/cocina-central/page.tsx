'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ChefHat, Package, Truck, QrCode, Inbox, Factory } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  canCocinaCentralOperate,
  canManageDeliveries,
} from '@/lib/cocina-central-permissions';

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
      className="flex min-h-[112px] flex-col justify-center rounded-2xl bg-zinc-50 px-4 py-4 ring-1 ring-zinc-200 transition hover:bg-white hover:ring-zinc-300 active:scale-[0.99]"
    >
      <Icon className="mb-2 h-8 w-8 text-[#D32F2F]" strokeWidth={2} />
      <span className="text-base font-extrabold text-zinc-900">{label}</span>
      <span className="mt-1 text-xs font-medium leading-snug text-zinc-600">{sub}</span>
    </Link>
  );
}

export default function CocinaCentralHubPage() {
  const { isCentralKitchen, profileReady, profileRole } = useAuth();
  const supabaseOk = isSupabaseEnabled() && !!getSupabaseClient();
  const operate = canCocinaCentralOperate(isCentralKitchen);
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
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-zinc-900">Cocina central</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Producción, lotes, entregas entre sedes y trazabilidad. Los datos están acotados a tu local en
          Supabase.
        </p>
      </div>

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
          </>
        ) : null}

        {deliveries ? (
          <Tile
            href="/cocina-central/entregas"
            label="Entregas"
            sub="Preparar, confirmar salida y PDF"
            icon={Truck}
          />
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

      <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-xs text-zinc-600">
        <div className="flex items-center gap-2 font-bold text-zinc-800">
          <ChefHat className="h-4 w-4 text-[#D32F2F]" />
          Modo actual
        </div>
        <p className="mt-1">
          {isCentralKitchen
            ? 'Tu local está marcado como cocina central: puedes producir y gestionar entregas salientes (según tu rol).'
            : 'Local satélite: aquí solo gestionas recepciones entrantes y la firma de entregas.'}
        </p>
      </div>
    </div>
  );
}
