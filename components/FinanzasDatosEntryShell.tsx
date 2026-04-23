'use client';

import type { ReactNode } from 'react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { isSupabaseEnabled, getSupabaseClient } from '@/lib/supabase-client';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';

type Props = {
  title: string;
  description: string;
  children: (ctx: { localId: string }) => ReactNode;
};

export default function FinanzasDatosEntryShell({
  title,
  description,
  children,
}: Props) {
  const { localCode, localName, localId, email, profileReady } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  if (!profileReady) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">Cargando…</p>
      </section>
    );
  }

  if (!hasPedidosEntry) return <PedidosPremiaLockedScreen />;

  if (!canUse || !localId || !supabaseOk) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">Finanzas no disponible en esta sesión.</p>
      </section>
    );
  }

  return (
    <div className="space-y-4 pb-10">
      <MermasStyleHero slim eyebrow="Finanzas · Datos" title={title} description={description} />

      {children({ localId })}
    </div>
  );
}
