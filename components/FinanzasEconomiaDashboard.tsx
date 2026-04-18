'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Minus, RefreshCw } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import FinanzasEconomiaVisualExecutive from '@/components/finanzas/FinanzasEconomiaVisualExecutive';
import type { FinanzasEconomicSummary } from '@/lib/finanzas-economic-summary';
import { getFinanzasEconomicSummary } from '@/lib/finanzas-economic-summary';
import { fetchFixedExpensesForRangeContext } from '@/lib/finanzas-economics-supabase';
import { aggregateFixedExpensesByCategoryForChart } from '@/lib/finanzas-fixed-expense-viz';
import {
  fetchFinanzasExecutiveRankings,
  type FinanzasExecutiveRankings,
} from '@/lib/finanzas-supabase';
import {
  buildFinanzasIntelligentAlerts,
  type AlertItem,
} from '@/lib/finanzas-intelligent-alerts';
import { FINANZAS_DATA_CHANGED_EVENT } from '@/lib/finanzas-data-changed';
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

function DeltaGlyph({
  pct,
  mode,
}: {
  pct: number | null;
  mode: 'higher_better' | 'lower_better';
}) {
  if (pct == null || pct === 0 || !Number.isFinite(pct)) {
    return <Minus className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden />;
  }
  const good = mode === 'higher_better' ? pct > 0 : pct < 0;
  const cls = good ? 'text-emerald-600' : 'text-red-600';
  if (pct > 0) return <ArrowUp className={`h-5 w-5 shrink-0 ${cls}`} aria-hidden />;
  return <ArrowDown className={`h-5 w-5 shrink-0 ${cls}`} aria-hidden />;
}

type KpiDef = {
  title: string;
  valueEur: number;
  deltaPct: number | null;
  mode: 'higher_better' | 'lower_better';
};

function KpiCardExecutive({ kpi }: { kpi: KpiDef }) {
  return (
    <div className="flex min-h-[100px] flex-col justify-between rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">{kpi.title}</p>
        <DeltaGlyph pct={kpi.deltaPct} mode={kpi.mode} />
      </div>
      <p className="mt-2 text-xl font-black tabular-nums text-zinc-900 sm:text-2xl">{eur(kpi.valueEur)}</p>
      <p className="mt-1 text-xs font-bold text-zinc-600">{deltaLabel(kpi.deltaPct)}</p>
    </div>
  );
}

function priorityBadgeClass(p: AlertItem['priority']): string {
  if (p === 'P1') return 'bg-red-600 text-white';
  if (p === 'P2') return 'bg-amber-500 text-white';
  return 'bg-zinc-500 text-white';
}

function formatAlertImpact(a: AlertItem): string | null {
  const parts: string[] = [];
  if (a.impact_eur != null) parts.push(`${a.impact_eur.toFixed(2)} €`);
  if (a.impact_pct != null) {
    if (a.id === 'fin-a2-beneficio-cae') {
      parts.push(`${a.impact_pct > 0 ? '+' : ''}${a.impact_pct.toFixed(1)}% vs ant.`);
    } else if (a.id === 'fin-a6-gf-suben') {
      parts.push(`+${a.impact_pct.toFixed(1)}% vs ant.`);
    } else if (a.id === 'fin-a4-mermas') {
      parts.push(`${a.impact_pct.toFixed(1)}% s/ compras`);
    } else {
      parts.push(`${a.impact_pct.toFixed(1)}% s/ ventas`);
    }
  }
  return parts.length ? parts.join(' · ') : null;
}

/** Fase 8: verde | rojo | amarillo (cerca de cero). */
function resultadoCockpitTone(
  beneficio: number,
  ventas: number,
): { headline: string; sub: string; wrap: string; value: string; valueCls: string } {
  const lowMarginThreshold = ventas > 0 ? ventas * 0.02 : 0;

  if (ventas <= 0) {
    return {
      headline: 'HOY ESTÁS SIN VENTAS REGISTRADAS',
      sub: 'Registra ventas diarias para ver si ganas o pierdes dinero en este periodo.',
      wrap: 'border-amber-200 bg-amber-50 ring-amber-100',
      value: eur(beneficio),
      valueCls: 'text-amber-950',
    };
  }

  if (beneficio < 0) {
    return {
      headline: 'HOY ESTÁS PERDIENDO DINERO',
      sub: 'Beneficio neto estimado negativo en el periodo seleccionado.',
      wrap: 'border-red-200 bg-red-50 ring-red-100',
      value: eur(beneficio),
      valueCls: 'text-red-800',
    };
  }

  if (beneficio >= 0 && beneficio < lowMarginThreshold) {
    return {
      headline: 'HOY ESTÁS CASI SIN MARGEN',
      sub: 'Cerca de cero: revisa costes y ventas antes de que el periodo se cierre.',
      wrap: 'border-amber-200 bg-amber-50 ring-amber-100',
      value: eur(beneficio),
      valueCls: 'text-amber-950',
    };
  }

  return {
    headline: 'HOY ESTÁS GANANDO DINERO',
    sub: 'Beneficio neto estimado positivo en el periodo seleccionado.',
    wrap: 'border-emerald-200 bg-emerald-50 ring-emerald-100',
    value: eur(beneficio),
    valueCls: 'text-emerald-900',
  };
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
  const [rankings, setRankings] = useState<FinanzasExecutiveRankings | null>(null);
  const [fixedByCategory, setFixedByCategory] = useState<ReturnType<
    typeof aggregateFixedExpensesByCategoryForChart
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ranges = useMemo(() => finanzasPeriodRanges(preset), [preset]);

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setSummary(null);
      setRankings(null);
      setFixedByCategory(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const client = getSupabaseClient()!;
      const [s, rnk, fixedRows] = await Promise.all([
        getFinanzasEconomicSummary(client, localId, ranges.current.from, ranges.current.to),
        fetchFinanzasExecutiveRankings(client, localId, preset),
        fetchFixedExpensesForRangeContext(client, localId, ranges.current.from, ranges.current.to, {
          limit: 200,
        }).catch(() => []),
      ]);
      setSummary(s);
      setRankings(rnk);
      setFixedByCategory(aggregateFixedExpensesByCategoryForChart(fixedRows));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar el resumen económico.');
      setSummary(null);
      setRankings(null);
      setFixedByCategory(null);
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk, preset, ranges.current.from, ranges.current.to]);

  useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  useEffect(() => {
    const onDataChanged = () => void load();
    window.addEventListener(FINANZAS_DATA_CHANGED_EVENT, onDataChanged);
    return () => window.removeEventListener(FINANZAS_DATA_CHANGED_EVENT, onDataChanged);
  }, [load]);

  const intelligentAlerts = useMemo(
    () => (summary ? buildFinanzasIntelligentAlerts(summary) : []),
    [summary],
  );

  const cockpit = useMemo(() => {
    if (!summary) return null;
    const v = summary.ingresos.ventas_c;
    const ben = summary.resultados.beneficio_neto_estimado;
    const costesTotales =
      summary.costes_operativos.compras_c +
      summary.costes_operativos.mermas_c +
      summary.costes_operativos.comida_personal_c +
      summary.costes_operativos.coste_personal_c +
      summary.gastos_fijos.gastos_fijos_c;
    const operativos =
      summary.costes_operativos.compras_c +
      summary.costes_operativos.mermas_c +
      summary.costes_operativos.comida_personal_c +
      summary.costes_operativos.coste_personal_c;
    const estructura = summary.gastos_fijos.gastos_fijos_c;
    const tone = resultadoCockpitTone(ben, v);
    return { v, ben, costesTotales, operativos, estructura, tone };
  }, [summary]);

  const kpis: KpiDef[] = summary
    ? [
        {
          title: 'Ventas',
          valueEur: summary.ingresos.ventas_c,
          deltaPct: summary.comparativa.ventas_c.delta_pct,
          mode: 'higher_better',
        },
        {
          title: 'Compras',
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
      ]
    : [];

  const ratioChips = summary
    ? [
        {
          label: 'Compras / ventas',
          value: summary.ratios.compras_sobre_ventas,
          suffix: '%',
        },
        {
          label: 'Personal / ventas',
          value: summary.ratios.coste_personal_sobre_ventas,
          suffix: '%',
        },
        {
          label: 'Beneficio neto / ventas',
          value: summary.ratios.beneficio_neto_sobre_ventas,
          suffix: '%',
        },
      ]
    : [];

  const dataHints = summary
    ? {
        sinCostesOperativos:
          summary.costes_operativos.compras_c +
            summary.costes_operativos.mermas_c +
            summary.costes_operativos.comida_personal_c ===
          0,
        sinPersonal: summary.costes_operativos.coste_personal_c === 0,
      }
    : null;

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
        title="Cockpit diario"
        description="Ganas o pierdes, dónde duele y qué revisar. Sin IVA en magnitudes principales."
      />

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
          <Link
            href="/finanzas/datos"
            className="inline-flex min-h-[44px] items-center rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold text-[#D32F2F]"
          >
            Registrar datos
          </Link>
        </div>
      </div>

      {summary ? (
        <p className="text-center text-[11px] text-zinc-500 sm:text-left">
          Periodo: <strong>{summary.period.from}</strong> → <strong>{summary.period.to}</strong> ({summary.period.days}{' '}
          días)
        </p>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div>
      ) : null}

      {/* 1. Resultado dominante */}
      {loading && !summary ? (
        <p className="text-sm text-zinc-600">Cargando…</p>
      ) : cockpit ? (
        <section
          className={`rounded-3xl border-2 p-5 shadow-md ring-2 sm:p-6 ${cockpit.tone.wrap}`}
          aria-label="Resultado del periodo"
        >
          <p className="text-center text-[10px] font-black uppercase tracking-widest text-zinc-600 sm:text-left">
            Según periodo seleccionado
          </p>
          <h2 className="mt-2 text-center text-xl font-black leading-tight sm:text-left sm:text-2xl">
            {cockpit.tone.headline}
          </h2>
          <p className="mt-2 text-center text-sm text-zinc-700 sm:text-left">{cockpit.tone.sub}</p>
          <p className={`mt-4 text-center text-3xl font-black tabular-nums sm:text-left sm:text-4xl ${cockpit.tone.valueCls}`}>
            {cockpit.tone.value}
          </p>
          <p className="mt-1 text-center text-xs font-semibold text-zinc-600 sm:text-left">
            Beneficio neto estimado (C) · sin IVA en costes operativos mostrados
          </p>
          <p className="mt-4 text-center text-base font-bold text-zinc-900 sm:text-left">
            Ventas: {eur(cockpit.v)} | Costes: {eur(cockpit.costesTotales)}
          </p>
          <p className="mt-1 text-center text-xs text-zinc-600 sm:text-left">
            Costes = compras + mermas + comida personal + personal + gastos fijos (periodo)
          </p>
        </section>
      ) : null}

      {/* 2. Qué revisar hoy — máx. 5 */}
      <section
        className="rounded-3xl border-2 border-[#D32F2F]/25 bg-white p-4 shadow-md ring-1 ring-[#D32F2F]/10 sm:p-5"
        aria-label="Qué revisar hoy"
      >
        <h2 className="text-sm font-black uppercase tracking-wide text-[#D32F2F]">Qué revisar hoy</h2>
        <p className="mt-1 text-xs text-zinc-600">Prioridad 1 primero. Máximo 5 avisos.</p>
        {loading && !summary ? (
          <p className="mt-3 text-sm text-zinc-600">Cargando…</p>
        ) : intelligentAlerts.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm font-semibold text-emerald-950">
            Todo bajo control
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {intelligentAlerts.slice(0, 5).map((item) => {
              const impactLine = formatAlertImpact(item);
              return (
                <li
                  key={item.id}
                  className="rounded-2xl border border-zinc-100 bg-zinc-50/90 p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-black text-white ${priorityBadgeClass(item.priority)}`}
                    >
                      {item.priority}
                    </span>
                    <p className="text-base font-black text-zinc-900">{item.title}</p>
                  </div>
                  {item.description ? (
                    <p className="mt-1 text-xs text-zinc-600">{item.description}</p>
                  ) : null}
                  {impactLine ? (
                    <p className="mt-2 text-sm font-bold text-zinc-800">
                      Impacto: <span className="font-black text-zinc-900">{impactLine}</span>
                    </p>
                  ) : null}
                  <p className="mt-1 text-sm text-zinc-700">
                    Acción: <span className="font-semibold">{item.action}</span>
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 3. Costes agrupados */}
      {summary ? (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Costes agrupados">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Costes operativos</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-zinc-900">
              {eur(
                summary.costes_operativos.compras_c +
                  summary.costes_operativos.mermas_c +
                  summary.costes_operativos.comida_personal_c +
                  summary.costes_operativos.coste_personal_c,
              )}
            </p>
            <p className="mt-1 text-xs text-zinc-600">Compras + mermas + comida personal + personal</p>
            {dataHints?.sinCostesOperativos ? (
              <p className="mt-2 text-xs font-bold text-amber-800">Faltan datos de costes operativos en este periodo.</p>
            ) : null}
            {dataHints?.sinPersonal ? (
              <p className="mt-1 text-xs font-semibold text-zinc-600">No hay costes de personal cargados.</p>
            ) : null}
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Estructura (gastos fijos)</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-zinc-900">
              {eur(summary.gastos_fijos.gastos_fijos_c)}
            </p>
            <p className="mt-1 text-xs text-zinc-600">Recurrentes nominales + puntuales en ventana</p>
          </div>
        </section>
      ) : null}

      {/* 4. KPIs (5) */}
      <section aria-label="KPIs principales">
        <h2 className="sr-only">KPIs principales</h2>
        {!loading || summary ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {kpis.map((k) => (
              <KpiCardExecutive key={k.title} kpi={k} />
            ))}
          </div>
        ) : null}
      </section>

      {/* 5. Ratios simples */}
      {summary ? (
        <section className="flex flex-wrap gap-2" aria-label="Ratios clave">
          {ratioChips.map((r) => (
            <span
              key={r.label}
              className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-bold text-zinc-800"
            >
              {r.label}:{' '}
              <span className="ml-1 tabular-nums text-zinc-900">
                {r.value != null ? `${r.value.toFixed(1)}${r.suffix}` : 'N/D'}
              </span>
            </span>
          ))}
        </section>
      ) : null}

      {/* 6. Tendencia + rankings (2 gráficos) */}
      {summary && fixedByCategory ? (
        <FinanzasEconomiaVisualExecutive
          summary={summary}
          rankings={rankings}
          fixedByCategory={fixedByCategory}
          preset={preset}
        />
      ) : null}

      {/* 7. Detalle plegable */}
      {summary ? (
        <details className="rounded-2xl border border-zinc-200 bg-white shadow-sm ring-1 ring-zinc-100">
          <summary className="cursor-pointer list-none px-4 py-4 text-sm font-black text-zinc-900 sm:px-5">
            Ver desglose (IVA, detalle de costes y enlaces)
          </summary>
          <div className="space-y-3 border-t border-zinc-100 px-4 pb-4 pt-3 sm:px-5">
            <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3">
              <p className="text-[10px] font-bold uppercase text-zinc-500">Costes operativos · detalle</p>
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
              <p className="text-[10px] font-bold uppercase text-zinc-500">Gastos fijos · detalle</p>
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
                  <span>Saldo IVA</span>
                  <span className="tabular-nums font-semibold">{eur(summary.impuestos.saldo_iva_eur)}</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span>Impuesto sociedades</span>
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
          </div>
        </details>
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
