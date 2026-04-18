'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import { countPendingDeliveryNotesInImputationRange } from '@/lib/delivery-notes-supabase';
import type { FinanzasEconomicSummary } from '@/lib/finanzas-economic-summary';
import { getFinanzasEconomicSummary } from '@/lib/finanzas-economic-summary';
import {
  buildReviewTodayItems,
  evaluateBusinessHealth,
  generateFinanceAlerts,
} from '@/lib/finanzas-health-alerts';
import {
  FINANZAS_PERIOD_PRESET_OPTIONS,
  finanzasPeriodRanges,
  type FinanzasPeriodPreset,
} from '@/lib/finanzas-supabase';

function eur(n: number): string {
  return `${n.toFixed(2)} €`;
}

function deltaLabel(pct: number | null): string {
  if (pct == null) return 'N/D vs ant.';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}% vs ant.`;
}

type DeltaTone = 'up_good' | 'down_good' | 'neutral' | 'up_bad' | 'down_bad';

function deltaToneFromPct(pct: number | null, mode: 'higher_better' | 'lower_better'): DeltaTone {
  if (pct == null) return 'neutral';
  if (pct === 0) return 'neutral';
  if (mode === 'higher_better') {
    if (pct > 0) return 'up_good';
    return 'down_bad';
  }
  if (pct < 0) return 'down_good';
  return 'up_bad';
}

function toneClasses(tone: DeltaTone): { ring: string; bg: string; delta: string } {
  switch (tone) {
    case 'up_good':
      return {
        ring: 'ring-emerald-200',
        bg: 'bg-emerald-50/90',
        delta: 'text-emerald-800',
      };
    case 'down_good':
      return {
        ring: 'ring-emerald-200',
        bg: 'bg-emerald-50/90',
        delta: 'text-emerald-800',
      };
    case 'up_bad':
      return {
        ring: 'ring-red-200',
        bg: 'bg-red-50/90',
        delta: 'text-red-800',
      };
    case 'down_bad':
      return {
        ring: 'ring-red-200',
        bg: 'bg-red-50/90',
        delta: 'text-red-800',
      };
    default:
      return {
        ring: 'ring-amber-100',
        bg: 'bg-amber-50/50',
        delta: 'text-amber-900',
      };
  }
}

function marginChipStyles(label: string): string {
  if (label === 'Rentable') return 'bg-emerald-100 text-emerald-900 ring-emerald-200';
  if (label === 'Margen bajo') return 'bg-amber-100 text-amber-950 ring-amber-200';
  if (label === 'En pérdidas') return 'bg-red-100 text-red-900 ring-red-200';
  return 'bg-zinc-100 text-zinc-800 ring-zinc-200';
}

function priorityBadgeClass(p: 1 | 2 | 3): string {
  if (p === 1) return 'bg-red-600 text-white';
  if (p === 2) return 'bg-amber-500 text-white';
  return 'bg-zinc-500 text-white';
}

type KpiDef = {
  title: string;
  valueEur: number;
  deltaPct: number | null;
  mode: 'higher_better' | 'lower_better';
};

function KpiCard({ kpi }: { kpi: KpiDef }) {
  const tone = deltaToneFromPct(kpi.deltaPct, kpi.mode);
  const cls = toneClasses(tone);
  return (
    <div className={`min-h-[120px] rounded-2xl p-4 shadow-sm ring-2 ${cls.ring} ${cls.bg} sm:min-h-[132px]`}>
      <p className="text-[10px] font-black uppercase tracking-wide text-zinc-600">{kpi.title}</p>
      <p className="mt-2 text-xl font-black tabular-nums text-zinc-900 sm:text-2xl">{eur(kpi.valueEur)}</p>
      <p className={`mt-1 text-xs font-bold ${cls.delta}`}>{deltaLabel(kpi.deltaPct)}</p>
    </div>
  );
}

function FinanzasEconomiaBody() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramPreset = searchParams.get('p') as FinanzasPeriodPreset | null;
  const preset: FinanzasPeriodPreset =
    paramPreset && FINANZAS_PERIOD_PRESET_OPTIONS.some((x) => x.id === paramPreset) ? paramPreset : '7d';

  const { localCode, localName, localId, email, profileReady } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const [summary, setSummary] = useState<FinanzasEconomicSummary | null>(null);
  const [pendingAlbaranesCount, setPendingAlbaranesCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ranges = useMemo(() => finanzasPeriodRanges(preset), [preset]);

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const client = getSupabaseClient()!;
      const [s, pend] = await Promise.all([
        getFinanzasEconomicSummary(client, localId, ranges.current.from, ranges.current.to),
        countPendingDeliveryNotesInImputationRange(client, localId, ranges.current.from, ranges.current.to).catch(
          () => null,
        ),
      ]);
      setSummary(s);
      setPendingAlbaranesCount(pend);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar el resumen económico.');
      setSummary(null);
      setPendingAlbaranesCount(null);
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk, ranges.current.from, ranges.current.to]);

  useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  const healthView = useMemo(() => (summary ? evaluateBusinessHealth(summary) : null), [summary]);
  const financeAlerts = useMemo(() => {
    if (!summary) return [];
    return generateFinanceAlerts(summary, {
      pendingAlbaranesCount: pendingAlbaranesCount ?? undefined,
    });
  }, [summary, pendingAlbaranesCount]);
  const reviewToday = useMemo(() => buildReviewTodayItems(financeAlerts), [financeAlerts]);

  const kpis: KpiDef[] = summary
    ? [
        {
          title: 'Ventas (neto)',
          valueEur: summary.ingresos.ventas_c,
          deltaPct: summary.comparativa.ventas_c.delta_pct,
          mode: 'higher_better',
        },
        {
          title: 'Compras (neto)',
          valueEur: summary.costes_operativos.compras_c,
          deltaPct: summary.comparativa.compras_c.delta_pct,
          mode: 'lower_better',
        },
        {
          title: 'Mermas',
          valueEur: summary.costes_operativos.mermas_c,
          deltaPct: summary.comparativa.mermas_c.delta_pct,
          mode: 'lower_better',
        },
        {
          title: 'Coste personal',
          valueEur: summary.costes_operativos.coste_personal_c,
          deltaPct: summary.comparativa.coste_personal_c.delta_pct,
          mode: 'lower_better',
        },
        {
          title: 'Resultado operativo',
          valueEur: summary.resultados.resultado_operativo,
          deltaPct: summary.comparativa.resultado_operativo.delta_pct,
          mode: 'higher_better',
        },
        {
          title: 'Beneficio neto (estim.)',
          valueEur: summary.resultados.beneficio_neto_estimado,
          deltaPct: summary.comparativa.beneficio_neto_estimado.delta_pct,
          mode: 'higher_better',
        },
      ]
    : [];

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
      <MermasStyleHero
        slim
        eyebrow="Finanzas"
        title="Cuenta de resultados"
        description="Vista rápida del periodo: ingresos y costes sin IVA en los KPIs principales."
      />

      {/* A) Cabecera */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
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
              <button
                key={pr.id}
                type="button"
                onClick={() => router.push(`/finanzas?p=${pr.id}`, { scroll: false })}
                className={[
                  'min-h-[44px] rounded-xl px-3 py-2 text-xs font-bold sm:text-sm',
                  preset === pr.id ? 'bg-[#D32F2F] text-white' : 'border border-zinc-200 bg-white text-zinc-700',
                ].join(' ')}
              >
                {pr.label}
              </button>
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
        <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-center text-xs font-semibold text-zinc-800 sm:max-w-sm sm:text-left">
          Datos sin IVA en KPIs principales
        </p>
      </div>

      {summary ? (
        <p className="text-center text-[11px] text-zinc-500 sm:text-left">
          Periodo: <strong>{summary.period.from}</strong> → <strong>{summary.period.to}</strong> ({summary.period.days}{' '}
          días) · Anterior: <strong>{summary.comparativa.periodo_anterior.from}</strong> →{' '}
          <strong>{summary.comparativa.periodo_anterior.to}</strong>
        </p>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div>
      ) : null}

      {/* B) KPIs */}
      <section aria-label="KPIs principales">
        <h2 className="sr-only">KPIs principales</h2>
        {loading && !summary ? (
          <p className="text-sm text-zinc-600">Cargando…</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {kpis.map((k) => (
              <KpiCard key={k.title} kpi={k} />
            ))}
          </div>
        )}
      </section>

      {/* C) Salud del negocio */}
      {healthView && summary ? (
        <section
          className={`rounded-2xl p-4 ring-2 sm:p-5 ${healthView.trendStyles.ring} ${healthView.trendStyles.bg}`}
          aria-label="Salud del negocio"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <span
              className={`h-14 w-14 shrink-0 rounded-full ${healthView.trendStyles.dot} shadow-inner ring-4 ring-white/80`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-wide text-zinc-600">Salud del negocio</p>
              <p className={`text-xl font-black sm:text-2xl ${healthView.trendStyles.text}`}>{healthView.trendLabel}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${marginChipStyles(healthView.marginLabel)}`}
                >
                  {healthView.marginLabel}
                  {healthView.marginPct != null ? ` · ${healthView.marginPct.toFixed(1)}%` : ''}
                </span>
                {healthView.chips.slice(0, 4).map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-zinc-800 ring-1 ring-zinc-200/80"
                  >
                    {chip}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-sm leading-snug text-zinc-800">{healthView.explanation}</p>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
                Tendencia: deltas de resultado, compras, mermas y ventas vs periodo anterior. Margen: beneficio neto
                estimado / ventas (&gt;10% rentable, 0–10% margen bajo, &lt;0% pérdidas).
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {/* D) Qué revisar hoy */}
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 sm:p-5" aria-label="Qué revisar hoy">
        <h2 className="text-xs font-black uppercase tracking-wide text-zinc-500">Qué revisar hoy</h2>
        {loading && !summary ? (
          <p className="mt-3 text-sm text-zinc-600">Cargando…</p>
        ) : reviewToday.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">Nada crítico por umbrales. Buen momento para revisar datos de rutina.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {reviewToday.slice(0, 8).map((item) => (
              <li
                key={item.alert_id}
                className="rounded-2xl border border-zinc-100 bg-zinc-50/80 p-3 sm:flex sm:items-start sm:justify-between sm:gap-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-black text-white ${priorityBadgeClass(item.prioridad)}`}
                    >
                      P{item.prioridad}
                    </span>
                    <p className="font-bold text-zinc-900">{item.titulo}</p>
                  </div>
                  <p className="mt-1 text-sm text-zinc-700">{item.descripcion}</p>
                  <p className="mt-1 text-xs font-semibold text-zinc-600">Impacto: {item.impacto_estimado}</p>
                  <p className="mt-0.5 text-xs text-zinc-600">{item.accion_sugerida}</p>
                </div>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="mt-3 inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl bg-[#D32F2F] px-4 text-xs font-bold text-white sm:mt-0"
                  >
                    Abrir
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Resumen alertas (compacto) */}
      {summary && financeAlerts.length > 0 ? (
        <section className="rounded-xl border border-zinc-200 bg-zinc-50/60 px-3 py-2 text-xs text-zinc-700" aria-label="Resumen de alertas">
          <span className="font-bold text-zinc-800">Alertas activas:</span>{' '}
          {financeAlerts.filter((a) => a.severidad === 'alta').length} alta ·{' '}
          {financeAlerts.filter((a) => a.severidad === 'media').length} media ·{' '}
          {financeAlerts.filter((a) => a.severidad === 'baja').length} baja
        </section>
      ) : null}

      {/* E) Detalle */}
      {summary ? (
        <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 sm:p-5" aria-label="Detalle">
          <h2 className="text-xs font-black uppercase tracking-wide text-zinc-500">Detalle del periodo</h2>

          <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3">
            <p className="text-[10px] font-bold uppercase text-zinc-500">Costes operativos</p>
            <ul className="mt-2 space-y-1.5 text-sm text-zinc-800">
              <li className="flex justify-between gap-2">
                <span>Compras (neto)</span>
                <span className="tabular-nums font-semibold">{eur(summary.costes_operativos.compras_c)}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span>Mermas</span>
                <span className="tabular-nums font-semibold">{eur(summary.costes_operativos.mermas_c)}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span>Comida personal</span>
                <span className="tabular-nums font-semibold">{eur(summary.costes_operativos.comida_personal_c)}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span>Coste personal</span>
                <span className="tabular-nums font-semibold">{eur(summary.costes_operativos.coste_personal_c)}</span>
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3">
            <p className="text-[10px] font-bold uppercase text-zinc-500">Gastos fijos</p>
            <p className="mt-1 text-lg font-black tabular-nums text-zinc-900">{eur(summary.gastos_fijos.gastos_fijos_c)}</p>
            <p className="mt-1 text-xs text-zinc-600">
              Puntuales en ventana: {eur(summary.gastos_fijos.detalle.one_off_en_ventana_eur)} · Recurrentes (nominal):{' '}
              {eur(summary.gastos_fijos.detalle.recurrentes_nominales_eur)}
            </p>
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
            <p className="text-[10px] font-bold uppercase text-indigo-800">Impuestos (informativo)</p>
            <ul className="mt-2 space-y-1.5 text-sm text-indigo-950">
              <li className="flex justify-between gap-2">
                <span>IVA repercutido</span>
                <span className="tabular-nums font-semibold">{eur(summary.impuestos.iva_repercutido_eur)}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span>IVA soportado</span>
                <span className="tabular-nums font-semibold">{eur(summary.impuestos.iva_soportado_eur)}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span>Saldo IVA (rep. − soport.)</span>
                <span className="tabular-nums font-semibold">{eur(summary.impuestos.saldo_iva_eur)}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span>Impuesto sociedades (periodo)</span>
                <span className="tabular-nums font-semibold">{eur(summary.impuestos.impuesto_sociedades_eur)}</span>
              </li>
            </ul>
            <p className="mt-2 text-xs text-indigo-900/90">{summary.impuestos.nota}</p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <Link href={`/finanzas/compras?p=${preset}`} className="text-[#D32F2F] underline underline-offset-2">
              Compras
            </Link>
            <Link href={`/finanzas/mermas?p=${preset}`} className="text-[#D32F2F] underline underline-offset-2">
              Mermas
            </Link>
            <Link href="/comida-personal" className="text-[#D32F2F] underline underline-offset-2">
              Comida personal
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default function FinanzasEconomiaDashboard() {
  return (
    <Suspense
      fallback={
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <p className="text-sm text-zinc-600">Cargando…</p>
        </section>
      }
    >
      <FinanzasEconomiaBody />
    </Suspense>
  );
}
