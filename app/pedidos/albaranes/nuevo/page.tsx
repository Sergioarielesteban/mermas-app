'use client';

import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import AlbaranOcrLauncher from '@/components/pedidos/albaranes/AlbaranOcrLauncher';

/**
 * Pantalla "Importar albarán" — ahora es un wrapper alrededor del launcher OCR unificado.
 * Conservada como ruta para no romper links externos / accesos antiguos.
 */
export default function NuevoAlbaranPage() {
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
        <p className="text-sm text-zinc-600">No disponible.</p>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-10">
      <header className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Albaranes</p>
          <h1 className="text-[22px] font-black leading-tight text-zinc-900">Escanear albarán</h1>
        </div>
        <Link
          href="/pedidos/albaranes"
          className="text-[12px] font-semibold text-zinc-500 hover:text-zinc-900"
        >
          ← Bandeja
        </Link>
      </header>

      <AlbaranOcrLauncher mode="inline" />

      <p className="text-center text-[11px] text-zinc-400">
        Mismo flujo OCR que el botón “Escanear albarán” dentro de cada pedido.
      </p>
    </div>
  );
}
