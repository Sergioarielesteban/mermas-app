'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Download,
  LineChart as LineChartIcon,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import { downloadFinanzasResumenCsv } from '@/lib/finanzas-resumen-csv';
import {
  FINANZAS_PERIOD_PRESET_OPTIONS,
  FINANZAS_UMBRALES,
  fetchFinanzasDashboard,
  finanzasUmbralesDescripcion,
  type FinanzasDashboardData,
  type FinanzasPeriodPreset,
  type FinanzasReviewItem,
} from '@/lib/finanzas-supabase';

function healthLabel(h: FinanzasDashboardData['health']): string {
  switch (h) {
    case 'improving':
      return 'Mejorando';
    case 'worsening':
      return 'Empeorando';
    case 'stable':
      return 'Estable';
    default:
      return 'Sin datos';
  }
}

function healthStyles(h: FinanzasDashboardData['health']): { ring: string; bg: string; dot: string } {
  switch (h) {
    case 'improving':
      return { ring: 'ring-emerald-200', bg: 'bg-emerald-50', dot: 'bg-emerald-500' };
    case 'worsening':
      return { ring: 'ring-red-200', bg: 'bg-red-50', dot: 'bg-red-500' };
    case 'stable':
      return { ring: 'ring-amber-200', bg: 'bg-amber-50', dot: 'bg-amber-500' };
    default:
      return { ring: 'ring-zinc-200', bg: 'bg-zinc-100', dot: 'bg-zinc-400' };
  }
}

function priorityStyles(p: FinanzasReviewItem['priority']): string {
  if (p === 1) return 'border-l-4 border-l-red-500 bg-red-50/50';
  if (p === 2) return 'border-l-4 border-l-amber-500 bg-amber-50/40';
  return 'border-l-4 border-l-zinc-300 bg-zinc-50/80';
}

function FinanzasHomeBody() {
  const router = useRouter();
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
  const [rankTab, setRankTab] = useState<'proveedores' | 'articulos' | 'mermas' | 'precios'>('proveedores');
  const [healthPanelOpen, setHealthPanelOpen] = useState(false);

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

  useEffect(() => {
    if (!healthPanelOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHealthPanelOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [healthPanelOpen]);

  const topSuppliersChart = useMemo(() => data?.topSuppliers.slice(0, 5).map((r) => ({ name: r.supplierName, net: r.net })) ?? [], [data]);

  const qPreset = `p=${preset}`;

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

  const hs = data ? healthStyles(data.health) : healthStyles('no_data');

  return (
    <div className="space-y-4 pb-10">
      <MermasStyleHero
        slim
        eyebrow="Finanzas"
        title="Resumen ejecutivo"
        description="Gasto por albaranes validados (neto), imputado por fecha de entrega. Pedidos: compromiso y desvíos."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/pedidos"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Pedidos
        </Link>
        <div className="flex flex-wrap gap-1">
          {FINANZAS_PERIOD_PRESET_OPTIONS.map((pr) => (
            <Link
              key={pr.id}
              href={`/finanzas?p=${pr.id}`}
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

      <p className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-950 sm:text-sm">
        <strong>Gasto neto (sin IVA):</strong> suma de <code className="rounded bg-white/70 px-1">subtotal</code> de albaranes{' '}
        <strong>validados</strong>, filtrados por <strong>fecha de entrega</strong> (o fecha de creación si no hay entrega). No
        usa la fecha del clic de validación.
      </p>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div>
      ) : null}

      {data && !data.hasDeliveryNotesTable ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Falta el esquema de albaranes en Supabase. Ejecuta <code className="rounded bg-white/80 px-1">supabase-pedidos-delivery-notes.sql</code>.
        </div>
      ) : null}

      {data && data.pendingCount > 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-bold">Pendiente de validar en el periodo</p>
          <p className="mt-1">
            <strong>{data.pendingCount}</strong> albarán(es) · Estimación{' '}
            <strong>{data.pendingEstimateNet.toFixed(2)} €</strong> neto
            {data.pendingEstimateGross > 0 ? (
              <>
                {' '}
                · <span className="text-amber-800">Con IVA ~{data.pendingEstimateGross.toFixed(2)} €</span>
              </>
            ) : null}
            . <span className="text-amber-800">No incluido en el gasto validado.</span>
          </p>
          <Link href="/finanzas/albaranes?estado=pendiente" className="mt-2 inline-block font-bold text-[#D32F2F] underline">
            Ir a albaranes
          </Link>
        </div>
      ) : null}

      {/* Salud — tap abre panel lateral (especificación UX) */}
      <section className={`rounded-2xl p-4 ring-2 ${hs.ring} ${hs.bg} sm:p-5`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <button
            type="button"
            onClick={() => data && setHealthPanelOpen(true)}
            disabled={!data}
            className="flex min-w-0 flex-1 items-start gap-3 rounded-xl p-1 text-left outline-none transition hover:bg-white/30 focus-visible:ring-2 focus-visible:ring-zinc-900/25 disabled:cursor-default disabled:opacity-60"
          >
            <span className={`h-14 w-14 shrink-0 rounded-full ${hs.dot} shadow-inner ring-4 ring-white/80`} aria-hidden />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wide text-zinc-600">Salud del negocio</p>
              <p className="text-xl font-black text-zinc-900">{data ? healthLabel(data.health) : '—'}</p>
              {data && data.healthReasons[0] ? (
                <p className="mt-1 max-w-xl text-sm text-zinc-700">{data.healthReasons[0]}</p>
              ) : null}
              {data ? <p className="mt-1 text-[11px] font-semibold text-[#B91C1C]">Pulsa para ver señales y criterios</p> : null}
            </div>
          </button>
          {data ? (
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-full bg-white/80 px-2 py-1 ring-1 ring-zinc-200">
                Gasto Δ vs ant.:{' '}
                {data.spendPrevNet > 0
                  ? `${((data.spendValidatedNet / data.spendPrevNet - 1) * 100).toFixed(0)}%`
                  : '—'}
              </span>
              <span className="rounded-full bg-white/80 px-2 py-1 ring-1 ring-zinc-200">
                Mermas Δ:{' '}
                {data.mermaPrevEur > 0
                  ? `${((data.mermaEur / data.mermaPrevEur - 1) * 100).toFixed(0)}%`
                  : '—'}
              </span>
              <span className="rounded-full bg-white/80 px-2 py-1 ring-1 ring-zinc-200">
                Alertas: {data.reviewItems.length}
              </span>
            </div>
          ) : null}
        </div>
        {data ? (
          <button
            type="button"
            onClick={() => setHealthPanelOpen(true)}
            className="mt-3 flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-zinc-200/80 bg-white/70 text-xs font-bold text-zinc-800 sm:w-auto sm:px-4"
          >
            Ver detalle de señales (panel)
          </button>
        ) : null}
      </section>

      {/* Qué revisar hoy */}
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 sm:p-5">
        <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-zinc-500">
          <Sparkles className="h-4 w-4 text-[#D32F2F]" aria-hidden />
          Qué revisar hoy
          {data && data.reviewItems.length > 0 ? (
            <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] text-white">{data.reviewItems.length}</span>
          ) : null}
        </h2>
        {loading ? (
          <p className="mt-3 text-sm text-zinc-500">Cargando…</p>
        ) : !data || data.reviewItems.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">Nada urgente según umbrales actuales. Revisa rankings abajo.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.reviewItems.slice(0, 7).map((item, idx) => (
              <li key={`${item.kind}-${idx}`} className={`rounded-xl p-3 ${priorityStyles(item.priority)}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-black text-zinc-500">P{item.priority}</span>
                    <p className="font-bold text-zinc-900">{item.title}</p>
                    <p className="text-sm text-zinc-600">{item.impactLabel}</p>
                  </div>
                  <Link
                    href={item.href}
                    className="shrink-0 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-bold text-white"
                  >
                    Abrir
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* KPIs — enlace a pantallas relacionadas */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Link
          href={`/finanzas/compras?${qPreset}`}
          scroll={false}
          className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 transition hover:ring-2 hover:ring-[#D32F2F]/25"
        >
          <p className="text-[10px] font-bold uppercase text-zinc-500">Gasto validado</p>
          <p className="mt-1 text-lg font-black tabular-nums text-zinc-900 sm:text-xl">
            {data ? `${data.spendValidatedNet.toFixed(2)} €` : '—'}
          </p>
          <p className="text-[10px] text-zinc-500">Neto (sin IVA) · Compras</p>
          {data && data.spendValidatedGross > 0 ? (
            <p className="mt-1 text-[10px] text-zinc-400">Con IVA ~{data.spendValidatedGross.toFixed(2)} €</p>
          ) : null}
        </Link>
        <Link
          href={`/finanzas/compras?${qPreset}`}
          scroll={false}
          className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 transition hover:ring-2 hover:ring-[#D32F2F]/25"
        >
          <p className="text-[10px] font-bold uppercase text-zinc-500">Pedidos vs alb.</p>
          <p className="mt-1 text-lg font-black tabular-nums text-zinc-900 sm:text-xl">
            {data ? `${data.deviationOrdersVsDn >= 0 ? '+' : ''}${data.deviationOrdersVsDn.toFixed(0)} €` : '—'}
          </p>
          <p className="text-[10px] text-zinc-500">Desvío · Compras</p>
        </Link>
        <Link
          href={`/finanzas/mermas?${qPreset}`}
          scroll={false}
          className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 transition hover:ring-2 hover:ring-[#D32F2F]/25"
        >
          <p className="text-[10px] font-bold uppercase text-zinc-500">Mermas</p>
          <p className="mt-1 text-lg font-black tabular-nums text-zinc-900 sm:text-xl">
            {data ? `${data.mermaEur.toFixed(2)} €` : '—'}
          </p>
          <p className="text-[10px] text-zinc-500">
            {data ? `${data.mermaPctOfSpend.toFixed(1)}% s/ compra neta` : '—'}
          </p>
        </Link>
        <Link
          href={`/finanzas/precios?${qPreset}`}
          scroll={false}
          className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 transition hover:ring-2 hover:ring-[#D32F2F]/25"
        >
          <p className="text-[10px] font-bold uppercase text-zinc-500">Precios</p>
          <p className="mt-1 text-lg font-black tabular-nums text-zinc-900 sm:text-xl">
            {data ? `${data.priceSpikeCount}` : '—'}
          </p>
          <p className="text-[10px] text-zinc-500">
            Subidas PMP ≥{Math.round((FINANZAS_UMBRALES.preciosPmp.spikeRatio - 1) * 100)}% vs periodo ant.
          </p>
        </Link>
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
          <h3 className="flex items-center gap-2 text-xs font-black uppercase text-zinc-500">
            <LineChartIcon className="h-4 w-4" aria-hidden />
            Evolución gasto neto
          </h3>
          {loading || !data ? (
            <p className="mt-8 text-center text-sm text-zinc-500">Cargando…</p>
          ) : data.dailySpend.every((x) => x.net === 0) ? (
            <p className="mt-8 text-center text-sm text-zinc-500">Sin albaranes validados en fechas del periodo.</p>
          ) : (
            <div className="mt-4 h-56 w-full">
              <p className="mb-1 text-[10px] text-zinc-500">Pasa el cursor: fecha e importe neto del día.</p>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.dailySpend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} width={40} />
                  <Tooltip
                    formatter={(v) => [`${Number(v ?? 0).toFixed(2)} €`, 'Neto']}
                    labelFormatter={(l) => String(l)}
                  />
                  <Line type="monotone" dataKey="net" stroke="#D32F2F" strokeWidth={2} dot={{ r: 3 }} name="Gasto neto" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
          <h3 className="flex items-center gap-2 text-xs font-black uppercase text-zinc-500">
            <BarChart3 className="h-4 w-4" aria-hidden />
            Top 5 proveedores (neto)
          </h3>
          {loading || !data ? (
            <p className="mt-8 text-center text-sm text-zinc-500">Cargando…</p>
          ) : topSuppliersChart.length === 0 ? (
            <p className="mt-8 text-center text-sm text-zinc-500">Sin datos.</p>
          ) : (
            <div className="mt-4 h-56 w-full">
              <p className="mb-1 text-[10px] text-zinc-500">Toca una barra para abrir el proveedor en su ranking.</p>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topSuppliersChart} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => [`${Number(v ?? 0).toFixed(2)} €`, 'Neto']} />
                  <Bar dataKey="net" radius={[0, 4, 4, 0]} name="Gasto neto">
                    {topSuppliersChart.map((entry, index) => (
                      <Cell
                        key={`bar-${entry.name}-${index}`}
                        fill="#D32F2F"
                        className="cursor-pointer outline-none"
                        onClick={() =>
                          router.push(
                            `/finanzas/proveedores?${qPreset}&proveedor=${encodeURIComponent(entry.name)}`,
                          )
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* Rankings tabs */}
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 sm:p-5">
        <div className="flex flex-wrap gap-2 border-b border-zinc-100 pb-3">
          {(
            [
              ['proveedores', 'Proveedores'],
              ['articulos', 'Artículos'],
              ['mermas', 'Mermas'],
              ['precios', 'Subidas precio'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setRankTab(id)}
              className={[
                'rounded-lg px-3 py-2 text-xs font-black uppercase sm:text-sm',
                rankTab === id ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-4 overflow-x-auto">
          {!data || loading ? (
            <p className="text-sm text-zinc-500">Cargando…</p>
          ) : rankTab === 'proveedores' ? (
            <table className="min-w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-zinc-200 text-[10px] font-black uppercase text-zinc-500">
                <tr>
                  <th className="py-2 pr-2">Proveedor</th>
                  <th className="py-2 pr-2 text-right">Neto €</th>
                  <th className="py-2 pr-2 text-right">% total</th>
                  <th className="py-2 pr-2 text-right">Δ ant.</th>
                  <th className="py-2 text-right">Alb.</th>
                </tr>
              </thead>
              <tbody>
                {data.topSuppliers.slice(0, 5).map((r) => (
                  <tr key={r.supplierName + r.net} className="border-t border-zinc-100">
                    <td className="py-2 pr-2 font-semibold text-zinc-900">
                      <Link
                        href={`/finanzas/proveedores?${qPreset}&proveedor=${encodeURIComponent(r.supplierName)}`}
                        className="text-[#B91C1C] underline-offset-2 hover:underline"
                        scroll={false}
                      >
                        {r.supplierName}
                      </Link>
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{r.net.toFixed(2)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{r.pctOfTotal.toFixed(1)}%</td>
                    <td className="py-2 pr-2 text-right tabular-nums">
                      {r.deltaVsPrev != null ? `${r.deltaVsPrev >= 0 ? '+' : ''}${r.deltaVsPrev.toFixed(0)}%` : '—'}
                    </td>
                    <td className="py-2 text-right tabular-nums">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : rankTab === 'articulos' ? (
            <table className="min-w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-zinc-200 text-[10px] font-black uppercase text-zinc-500">
                <tr>
                  <th className="py-2 pr-2">Artículo / línea</th>
                  <th className="py-2 pr-2 text-right">Neto €</th>
                  <th className="py-2 text-right">Líneas</th>
                </tr>
              </thead>
              <tbody>
                {data.topArticles.slice(0, 5).map((r) => (
                  <tr key={r.key} className="border-t border-zinc-100">
                    <td className="max-w-[200px] truncate py-2 pr-2 font-medium text-zinc-900" title={r.label}>
                      <Link
                        href={`/finanzas/articulos?${qPreset}`}
                        className="text-[#B91C1C] underline-offset-2 hover:underline"
                        scroll={false}
                      >
                        {r.label}
                      </Link>
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{r.net.toFixed(2)}</td>
                    <td className="py-2 text-right tabular-nums">{r.lines}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : rankTab === 'mermas' ? (
            <table className="min-w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-zinc-200 text-[10px] font-black uppercase text-zinc-500">
                <tr>
                  <th className="py-2 pr-2">Motivo</th>
                  <th className="py-2 pr-2 text-right">€</th>
                  <th className="py-2 text-right">% compra</th>
                </tr>
              </thead>
              <tbody>
                {data.topMermas.slice(0, 5).map((r) => (
                  <tr key={r.key} className="border-t border-zinc-100">
                    <td className="py-2 pr-2 font-medium text-zinc-900">
                      <Link
                        href={`/finanzas/mermas?${qPreset}`}
                        className="text-[#B91C1C] underline-offset-2 hover:underline"
                        scroll={false}
                      >
                        {r.label}
                      </Link>
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{r.eur.toFixed(2)}</td>
                    <td className="py-2 text-right tabular-nums">{r.pctOfSpend.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <>
              {data.topPriceIncreases.length === 0 ? (
                <p className="text-sm text-zinc-600">
                  Sin subidas relevantes (umbral {Math.round((FINANZAS_UMBRALES.preciosPmp.spikeRatio - 1) * 100)}% sobre PMP
                  ponderada del periodo anterior, mín. {FINANZAS_UMBRALES.preciosPmp.minPrevAvgEur} €/ud.).{' '}
                  <Link href="/finanzas/precios" className="font-bold text-[#D32F2F] underline">
                    Ver detalle
                  </Link>
                  {' · '}
                  <Link href="/pedidos/precios" className="font-bold text-zinc-700 underline">
                    Catálogo precios
                  </Link>
                </p>
              ) : (
                <table className="min-w-full text-left text-xs sm:text-sm">
                  <thead className="border-b border-zinc-200 text-[10px] font-black uppercase text-zinc-500">
                    <tr>
                      <th className="py-2 pr-2">Artículo</th>
                      <th className="py-2 pr-2">Proveedor</th>
                      <th className="py-2 pr-2 text-right">PMP ant.</th>
                      <th className="py-2 pr-2 text-right">PMP hoy</th>
                      <th className="py-2 text-right">Δ %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topPriceIncreases.slice(0, 5).map((r, idx) => (
                      <tr key={`${idx}-${r.supplierName}-${r.label}-${r.prevAvg}`} className="border-t border-zinc-100">
                        <td className="max-w-[140px] truncate py-2 pr-2 font-medium text-zinc-900" title={r.label}>
                          <Link
                            href={`/finanzas/precios?${qPreset}`}
                            className="text-[#B91C1C] underline-offset-2 hover:underline"
                            scroll={false}
                          >
                            {r.label}
                          </Link>
                        </td>
                        <td className="max-w-[120px] truncate py-2 pr-2 text-zinc-600" title={r.supplierName}>
                          <Link
                            href={`/finanzas/proveedores?${qPreset}&proveedor=${encodeURIComponent(r.supplierName)}`}
                            className="text-zinc-700 underline-offset-2 hover:underline"
                            scroll={false}
                          >
                            {r.supplierName}
                          </Link>
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums">{r.prevAvg.toFixed(4)}</td>
                        <td className="py-2 pr-2 text-right tabular-nums font-semibold">{r.last.toFixed(4)}</td>
                        <td className="py-2 text-right tabular-nums text-amber-800">+{r.deltaPct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/finanzas/proveedores" className="text-xs font-bold text-[#D32F2F] underline">
            Ver todo proveedores
          </Link>
          <Link href="/finanzas/articulos" className="text-xs font-bold text-[#D32F2F] underline">
            Artículos
          </Link>
          <Link href="/finanzas/mermas" className="text-xs font-bold text-[#D32F2F] underline">
            Mermas
          </Link>
          <Link href="/finanzas/precios" className="text-xs font-bold text-[#D32F2F] underline">
            Subidas precio
          </Link>
        </div>
      </section>

      <footer className="mt-6 flex flex-col gap-3 border-t border-zinc-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          disabled={!data}
          onClick={() => data && downloadFinanzasResumenCsv(data, preset)}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-zinc-900/15 bg-zinc-900 px-4 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" aria-hidden />
          Exportar CSV (resumen)
        </button>
        <p className="text-center text-[11px] text-zinc-500 sm:max-w-md sm:text-left">
          Cifras gerenciales. No sustituyen cierre contable sin revisión del asesor. Comparativa:{' '}
          {data ? `${data.prevFrom} → ${data.prevTo}` : '—'} vs {data ? `${data.periodFrom} → ${data.periodTo}` : '—'}.
        </p>
      </footer>

      {/* Panel lateral salud */}
      {healthPanelOpen && data ? (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Cerrar panel"
            onClick={() => setHealthPanelOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="finanzas-salud-titulo"
            className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <h2 id="finanzas-salud-titulo" className="text-sm font-black text-zinc-900">
                Salud — señales
              </h2>
              <button
                type="button"
                onClick={() => setHealthPanelOpen(false)}
                className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <p className="text-xs font-bold uppercase text-zinc-500">Estado</p>
              <p className="text-lg font-black text-zinc-900">{healthLabel(data.health)}</p>
              <p className="mt-3 text-xs font-bold text-zinc-700">Señales (resumen)</p>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-zinc-700">
                {data.healthReasons.slice(0, 4).map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              {data.healthReasons.length > 4 ? (
                <>
                  <p className="mt-4 text-xs font-bold text-zinc-600">Más detalle</p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-zinc-600">
                    {data.healthReasons.slice(4).map((r, i) => (
                      <li key={`extra-${i}`}>{r}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 text-xs leading-relaxed text-zinc-600">
                <p className="font-bold text-zinc-800">Criterios y umbrales</p>
                <ul className="mt-2 list-disc space-y-1.5 pl-4">
                  {finanzasUmbralesDescripcion().map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function FinanzasHomePage() {
  return (
    <Suspense
      fallback={
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <p className="text-sm text-zinc-600">Cargando…</p>
        </section>
      }
    >
      <FinanzasHomeBody />
    </Suspense>
  );
}
