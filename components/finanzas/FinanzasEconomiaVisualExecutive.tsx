'use client';

import Link from 'next/link';
import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { FinanzasEconomicSummary } from '@/lib/finanzas-economic-summary';
import type { FixedExpenseCategorySlice } from '@/lib/finanzas-fixed-expense-viz';
import { FIXED_EXPENSE_CATEGORY_LABEL } from '@/lib/finanzas-fixed-expense-viz';
import type {
  FinanzasArticleRow,
  FinanzasExecutiveRankings,
  FinanzasMermaRow,
  FinanzasPriceSpikeRow,
  FinanzasSupplierRow,
} from '@/lib/finanzas-supabase';

const PIE_COLORS = ['#D32F2F', '#1976D2', '#388E3C', '#F57C00', '#7B1FA2', '#0097A7', '#C2185B', '#5D4037'];

function eur(n: number): string {
  return `${n.toFixed(2)} €`;
}

function shortDate(d: string): string {
  if (d.length >= 10) return d.slice(5);
  return d;
}

type DetailState =
  | null
  | {
      title: string;
      lines: string[];
      href?: string;
      hrefLabel?: string;
    };

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ring-1 ring-zinc-100/80">
      <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">{title}</p>
      {subtitle ? <p className="mt-0.5 text-[11px] text-zinc-600">{subtitle}</p> : null}
      <div className="mt-3 h-[200px] w-full sm:h-[220px]">{children}</div>
    </div>
  );
}

function RankingCard({
  title,
  actionHint,
  children,
}: {
  title: string;
  actionHint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ring-1 ring-zinc-100/80">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">{title}</p>
        {actionHint ? <span className="text-[10px] font-semibold text-zinc-400">{actionHint}</span> : null}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function VerMasButton({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-3 w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2 text-xs font-bold text-zinc-800"
    >
      {expanded ? 'Ver menos' : 'Ver más'}
    </button>
  );
}

export default function FinanzasEconomiaVisualExecutive({
  summary,
  rankings,
  fixedByCategory,
  preset,
  hasFixedData,
}: {
  summary: FinanzasEconomicSummary;
  rankings: FinanzasExecutiveRankings | null;
  fixedByCategory: FixedExpenseCategorySlice[];
  preset: string;
  hasFixedData: boolean;
}) {
  const [detail, setDetail] = useState<DetailState>(null);
  const [expand, setExpand] = useState({
    suppliers: false,
    articles: false,
    mermas: false,
    prices: false,
    fixed: false,
  });

  const vizData = summary.viz.by_day;
  const staffLine = summary.viz.coste_personal_diario_equiv;

  const ventasVsComprasData = useMemo(
    () =>
      vizData.map((d) => ({
        ...d,
        label: shortDate(d.date),
        personal_equiv: staffLine,
      })),
    [vizData, staffLine],
  );

  const comprasNet = summary.costes_operativos.compras_c;

  const toggle = (k: keyof typeof expand) => setExpand((e) => ({ ...e, [k]: !e[k] }));

  const showCount = (expanded: boolean) => (expanded ? 15 : 5);

  const openSupplier = (r: FinanzasSupplierRow) => {
    setDetail({
      title: r.supplierName,
      lines: [
        `Gasto neto (albaranes validados): ${eur(r.net)}`,
        `Sobre total compras: ${r.pctOfTotal.toFixed(1)}%`,
        `Albaranes en periodo: ${r.count}`,
        r.deltaVsPrev != null ? `Variación vs periodo ant.: ${r.deltaVsPrev > 0 ? '+' : ''}${r.deltaVsPrev.toFixed(1)}%` : 'Variación vs periodo ant.: N/D',
      ],
      href: '/finanzas/compras',
      hrefLabel: 'Ir a compras',
    });
  };

  const openArticle = (r: FinanzasArticleRow) => {
    setDetail({
      title: r.label,
      lines: [
        `Coste neto total: ${eur(r.net)}`,
        `Líneas en albaranes: ${r.lines}`,
        r.mainSupplierName ? `Proveedor principal: ${r.mainSupplierName}` : 'Proveedor principal: —',
      ],
      href: '/finanzas/compras',
      hrefLabel: 'Compras',
    });
  };

  const openMerma = (r: FinanzasMermaRow) => {
    setDetail({
      title: `Merma · ${r.label}`,
      lines: [
        `Coste estimado: ${eur(r.eur)}`,
        comprasNet > 0 ? `Sobre compras del periodo: ${r.pctOfSpend.toFixed(1)}%` : 'Sin compras validadas en el periodo para ratio.',
      ],
      href: '/finanzas/mermas',
      hrefLabel: 'Mermas',
    });
  };

  const openPrice = (r: FinanzasPriceSpikeRow) => {
    setDetail({
      title: r.label,
      lines: [
        `Proveedor: ${r.supplierName}`,
        `PMP anterior: ${r.prevAvg.toFixed(4)} € · Actual: ${r.last.toFixed(4)} €`,
        `Subida: +${r.deltaPct.toFixed(1)}%`,
      ],
      href: '/finanzas/precios',
      hrefLabel: 'Precios',
    });
  };

  const openFixedCat = (r: FixedExpenseCategorySlice) => {
    setDetail({
      title: FIXED_EXPENSE_CATEGORY_LABEL[r.category] ?? r.category,
      lines: [
        `Importe nominal agregado (recurrentes + puntuales listados): ${eur(r.amountEur)}`,
        `Sobre total gastos fijos en gráfico: ${r.pctOfTotal.toFixed(1)}%`,
        'Los conceptos concretos están en la tabla de gastos fijos del local (misma ventana acotada que el resumen).',
      ],
    });
  };

  const suppliers = rankings?.topSuppliers ?? [];
  const articles = rankings?.topArticles ?? [];
  const mermasR = rankings?.topMermas ?? [];
  const prices = rankings?.topPriceIncreases ?? [];

  return (
    <>
      <section className="space-y-4" aria-label="Análisis visual">
        <div>
          <h2 className="text-xs font-black uppercase tracking-wide text-zinc-500">Análisis visual</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Una lectura por gráfico. Las series diarias salen de los mismos agregadores que el resumen (sin histórico
            extra).
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard
            title="Ventas vs compras"
            subtitle="Neto declarado (ventas) vs albaranes validados (compras), por día."
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ventasVsComprasData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} width={44} />
                <Tooltip
                  formatter={(value) => [eur(Number(value ?? 0)), '']}
                  labelFormatter={(_, p) => {
                    const pl = p?.[0]?.payload as { date?: string } | undefined;
                    return pl?.date ?? '';
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="ventas_net" name="Ventas" stroke="#2E7D32" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="compras_net" name="Compras" stroke="#D32F2F" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Resultado diario (aprox.)"
            subtitle="Ventas − compras − mermas − comida personal por día. No incluye coste de personal ni gastos fijos."
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ventasVsComprasData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} width={44} />
                <Tooltip
                  formatter={(value) => [eur(Number(value ?? 0)), '']}
                  labelFormatter={(_, p) => {
                    const pl = p?.[0]?.payload as { date?: string } | undefined;
                    return pl?.date ?? '';
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="resultado_operativo_diario_aprox"
                  name="Resultado aprox."
                  stroke="#1565C0"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Mermas en el tiempo" subtitle="Coste de mermas imputado por día.">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ventasVsComprasData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} width={44} />
                <Tooltip
                  formatter={(value) => [eur(Number(value ?? 0)), '']}
                  labelFormatter={(_, p) => {
                    const pl = p?.[0]?.payload as { date?: string } | undefined;
                    return pl?.date ?? '';
                  }}
                />
                <Line type="monotone" dataKey="mermas" name="Mermas" stroke="#EF6C00" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Personal vs ventas"
            subtitle={`Ventas diarias vs media diaria del coste de personal del periodo (${eur(staffLine)}/día).`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ventasVsComprasData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} width={44} />
                <Tooltip
                  formatter={(value, name) => {
                    const v = Number(value ?? 0);
                    const n = String(name ?? '');
                    return n === 'Personal (media/día)' ? [`${eur(v)} (constante)`, n] : [eur(v), n];
                  }}
                  labelFormatter={(_, p) => {
                    const pl = p?.[0]?.payload as { date?: string } | undefined;
                    return pl?.date ?? '';
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="ventas_net" name="Ventas" stroke="#2E7D32" strokeWidth={2} dot={false} />
                <Line
                  type="monotone"
                  dataKey="personal_equiv"
                  name="Personal (media/día)"
                  stroke="#6A1B9A"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Gastos fijos por categoría"
            subtitle={
              hasFixedData
                ? 'Importes nominales del listado acotado al periodo (recurrentes activos + puntuales en ventana).'
                : 'Sin datos de gastos fijos en este contexto.'
            }
          >
            {fixedByCategory.length === 0 ? (
              <p className="flex h-full items-center justify-center text-center text-sm text-zinc-500">
                No hay partidas para mostrar. Revisa gastos fijos activos o el rango de fechas.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={fixedByCategory}
                    dataKey="amountEur"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={44}
                    outerRadius={72}
                    paddingAngle={2}
                  >
                    {fixedByCategory.map((_, i) => (
                      <Cell key={fixedByCategory[i]!.category} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => eur(Number(value ?? 0))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </section>

      <section className="space-y-4" aria-label="Rankings ejecutivos">
        <div>
          <h2 className="text-xs font-black uppercase tracking-wide text-zinc-500">Rankings</h2>
          <p className="mt-1 text-sm text-zinc-600">Top inicial 5; amplía para ver hasta 15 entradas donde aplique.</p>
        </div>

        {!rankings?.hasDeliveryNotesTable ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Rankings de compras no disponibles (tabla de albaranes no encontrada).
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RankingCard title="Top proveedores por gasto" actionHint="Toca una fila">
            <ul className="space-y-2">
              {suppliers.slice(0, showCount(expand.suppliers)).map((r) => (
                <li key={r.supplierId ?? r.supplierName}>
                  <button
                    type="button"
                    onClick={() => openSupplier(r)}
                    className="flex w-full flex-col gap-0.5 rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2 text-left text-sm transition hover:bg-zinc-100"
                  >
                    <span className="font-bold text-zinc-900">{r.supplierName}</span>
                    <span className="text-xs text-zinc-600">
                      {eur(r.net)} · {r.pctOfTotal.toFixed(1)}% del total
                      {r.deltaVsPrev != null ? ` · ${r.deltaVsPrev > 0 ? '+' : ''}${r.deltaVsPrev.toFixed(1)}% vs ant.` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {suppliers.length > 5 ? <VerMasButton expanded={expand.suppliers} onToggle={() => toggle('suppliers')} /> : null}
          </RankingCard>

          <RankingCard title="Top artículos por coste" actionHint="Toca una fila">
            <ul className="space-y-2">
              {articles.slice(0, showCount(expand.articles)).map((r, idx) => (
                <li key={`${r.key}-${idx}`}>
                  <button
                    type="button"
                    onClick={() => openArticle(r)}
                    className="flex w-full flex-col gap-0.5 rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2 text-left text-sm transition hover:bg-zinc-100"
                  >
                    <span className="font-bold text-zinc-900">{r.label}</span>
                    <span className="text-xs text-zinc-600">
                      {eur(r.net)}
                      {r.mainSupplierName ? ` · ${r.mainSupplierName}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {articles.length > 5 ? <VerMasButton expanded={expand.articles} onToggle={() => toggle('articles')} /> : null}
          </RankingCard>

          <RankingCard title="Top mermas por impacto" actionHint="Motivo / clave">
            <ul className="space-y-2">
              {mermasR.slice(0, showCount(expand.mermas)).map((r, idx) => (
                <li key={`${r.key}-${idx}`}>
                  <button
                    type="button"
                    onClick={() => openMerma(r)}
                    className="flex w-full flex-col gap-0.5 rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2 text-left text-sm transition hover:bg-zinc-100"
                  >
                    <span className="font-bold text-zinc-900">{r.label}</span>
                    <span className="text-xs text-zinc-600">
                      {eur(r.eur)}
                      {comprasNet > 0 ? ` · ${r.pctOfSpend.toFixed(1)}% sobre compras` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {mermasR.length > 5 ? <VerMasButton expanded={expand.mermas} onToggle={() => toggle('mermas')} /> : null}
          </RankingCard>

          <RankingCard title="Top subidas de precio (PMP)" actionHint="vs periodo anterior">
            <ul className="space-y-2">
              {prices.slice(0, showCount(expand.prices)).map((r, i) => (
                <li key={`${r.label}-${i}`}>
                  <button
                    type="button"
                    onClick={() => openPrice(r)}
                    className="flex w-full flex-col gap-0.5 rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2 text-left text-sm transition hover:bg-zinc-100"
                  >
                    <span className="font-bold text-zinc-900">{r.label}</span>
                    <span className="text-xs text-zinc-600">
                      {r.supplierName} · {r.prevAvg.toFixed(2)} → {r.last.toFixed(2)} € (+{r.deltaPct.toFixed(1)}%)
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {prices.length > 5 ? <VerMasButton expanded={expand.prices} onToggle={() => toggle('prices')} /> : null}
          </RankingCard>

          <RankingCard title="Top gastos fijos por categoría" actionHint="Toca categoría">
            {fixedByCategory.length === 0 ? (
              <p className="text-sm text-zinc-600">Sin partidas en el listado del periodo.</p>
            ) : (
              <>
                <ul className="space-y-2">
                  {fixedByCategory.slice(0, showCount(expand.fixed)).map((r) => (
                    <li key={r.category}>
                      <button
                        type="button"
                        onClick={() => openFixedCat(r)}
                        className="flex w-full flex-col gap-0.5 rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2 text-left text-sm transition hover:bg-zinc-100"
                      >
                        <span className="font-bold text-zinc-900">{r.label}</span>
                        <span className="text-xs text-zinc-600">
                          {eur(r.amountEur)} · {r.pctOfTotal.toFixed(1)}% del total fijo (gráfico)
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {fixedByCategory.length > 5 ? (
                  <VerMasButton expanded={expand.fixed} onToggle={() => toggle('fixed')} />
                ) : null}
              </>
            )}
          </RankingCard>
        </div>

        <p className="text-center text-[11px] text-zinc-500 sm:text-left">
          Enlaces rápidos:{' '}
          <Link href={`/finanzas/compras?p=${preset}`} className="font-semibold text-[#D32F2F] underline underline-offset-2">
            Compras
          </Link>
          {' · '}
          <Link href={`/finanzas/mermas?p=${preset}`} className="font-semibold text-[#D32F2F] underline underline-offset-2">
            Mermas
          </Link>
          {' · '}
          <span className="text-zinc-500">Gastos fijos: desglose en gráfico y ranking (datos del periodo).</span>
        </p>
      </section>

      {detail ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fin-detail-title"
          onClick={() => setDetail(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p id="fin-detail-title" className="text-lg font-black text-zinc-900">
              {detail.title}
            </p>
            <ul className="mt-3 space-y-2 text-sm text-zinc-700">
              {detail.lines.map((line) => (
                <li key={line} className="leading-snug">
                  {line}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-bold text-zinc-800"
                onClick={() => setDetail(null)}
              >
                Cerrar
              </button>
              {detail.href ? (
                <Link
                  href={detail.href}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#D32F2F] px-4 text-sm font-bold text-white"
                >
                  {detail.hrefLabel ?? 'Abrir'}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
