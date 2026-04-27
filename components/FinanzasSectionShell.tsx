'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import ModuleHeader from '@/components/ModuleHeader';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import {
  FINANZAS_PERIOD_PRESET_OPTIONS,
  fetchFinanzasDashboard,
  type FinanzasDashboardData,
  type FinanzasPeriodPreset,
} from '@/lib/finanzas-supabase';

export type FinanzasSectionShellRenderContext = {
  data: FinanzasDashboardData | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  localId: string;
  preset: FinanzasPeriodPreset;
};

type Props = {
  title: string;
  description: string;
  periodBasePath: string;
  /** Query adicional al cambiar periodo (debe empezar por `&`), p.ej. `&proveedor=X`. */
  periodExtraQuery?: string;
  children: (ctx: FinanzasSectionShellRenderContext) => React.ReactNode;
};

export default function FinanzasSectionShell({
  title,
  description,
  periodBasePath,
  periodExtraQuery = '',
  children,
}: Props) {
  const searchParams = useSearchParams();
  const paramPreset = searchParams.get('p') as FinanzasPeriodPreset | null;
  const preset: FinanzasPeriodPreset =
    paramPreset && FINANZAS_PERIOD_PRESET_OPTIONS.some((x) => x.id === paramPreset) ? paramPreset : '7d';

  const { localCode, localName, localId, email, profileReady } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const [data, setData] = useState<FinanzasDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const d = await fetchFinanzasDashboard(getSupabaseClient()!, localId, preset);
      setData(d);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar Finanzas.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk, preset]);

  useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

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
      <ModuleHeader title={`Finanzas · ${title}`} />
      {description ? <p className="max-w-2xl text-sm text-zinc-600">{description}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {FINANZAS_PERIOD_PRESET_OPTIONS.map((pr) => (
            <Link
              key={pr.id}
              href={`${periodBasePath}?p=${pr.id}${periodExtraQuery}`}
              scroll={false}
              className={[
                'rounded-lg px-3 py-2 text-xs font-bold sm:text-sm',
                preset === pr.id ? 'bg-[#D32F2F] text-white' : 'border border-zinc-200 bg-white text-zinc-700',
              ].join(' ')}
            >
              {pr.label}
            </Link>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm font-semibold text-zinc-800"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          Actualizar
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div>
      ) : null}

      {data && !data.hasDeliveryNotesTable ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Falta el esquema de albaranes en Supabase. Ejecuta{' '}
          <code className="rounded bg-white/80 px-1">supabase-pedidos-delivery-notes.sql</code>.
        </div>
      ) : null}

      {children({ data, loading, error, reload: load, localId, preset })}
    </div>
  );
}
