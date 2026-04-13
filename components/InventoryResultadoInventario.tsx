'use client';

import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FileDown, Trash2 } from 'lucide-react';
import type { InventoryCatalogCategory, InventoryCatalogItem, InventoryItem, InventoryMonthSnapshot } from '@/lib/inventory-supabase';
import { computeInventoryCategoryBreakdownEuros } from '@/lib/inventory-supabase';

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatYmShort(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return `${MONTHS_ES[m - 1] ?? m} ${String(y).slice(-2)}`;
}

const CHART_RED = '#D32F2F';
const CHART_MUTED = '#52525b';
const CATEGORY_BAR_COLORS = ['#D32F2F', '#e57373', '#ffb74d', '#81c784', '#64b5f6', '#9575cd', '#4dd0e1', '#aed581'];

type Props = {
  snapshots: InventoryMonthSnapshot[];
  totalValor: number;
  lines: InventoryItem[];
  catalogItems: InventoryCatalogItem[];
  categories: InventoryCatalogCategory[];
  yearMonth: string;
  onDownloadPdf: () => void | Promise<void>;
  pdfBusy: boolean;
  onDeleteMonthlySnapshot: () => void | Promise<void>;
  deleteMonthBusy: boolean;
  disabled: boolean;
};

export default function InventoryResultadoInventario({
  snapshots,
  totalValor,
  lines,
  catalogItems,
  categories,
  yearMonth,
  onDownloadPdf,
  pdfBusy,
  onDeleteMonthlySnapshot,
  deleteMonthBusy,
  disabled,
}: Props) {
  const barData = useMemo(() => {
    const fromSnaps = snapshots.map((s) => ({
      label: formatYmShort(s.year_month),
      value: s.total_value,
      full: s.year_month,
      projected: false,
    }));
    const hasCurrentSnap = snapshots.some((s) => s.year_month === yearMonth);
    if (!hasCurrentSnap) {
      return [
        ...fromSnaps,
        {
          label: `${formatYmShort(yearMonth)} · hoy`,
          value: totalValor,
          full: yearMonth,
          projected: true,
        },
      ];
    }
    return fromSnaps;
  }, [snapshots, totalValor, yearMonth]);

  const momPct = useMemo(() => {
    if (snapshots.length < 2) return null;
    const s = [...snapshots].sort((a, b) => a.year_month.localeCompare(b.year_month));
    const prev = s[s.length - 2]!.total_value;
    const last = s[s.length - 1]!.total_value;
    if (prev === 0) return null;
    return ((last - prev) / prev) * 100;
  }, [snapshots]);

  /** Todas las categorías con valor &gt; 0, ordenadas (mayor primero) para barras horizontales. */
  const categoryBarData = useMemo(() => {
    const breakdown = computeInventoryCategoryBreakdownEuros(lines, catalogItems);
    return Object.entries(breakdown)
      .map(([id, value]) => ({
        name:
          id === '__sin_catalogo__'
            ? 'Sin catálogo'
            : (categories.find((c) => c.id === id)?.name ?? 'Categoría'),
        value,
        labelEuro: `${Math.round(value)} €`,
      }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [lines, catalogItems, categories]);

  const categoryChartHeight = Math.min(320, Math.max(140, categoryBarData.length * 30 + 24));

  const stockCoverage = useMemo(() => {
    const withStock = lines.filter((l) => l.quantity_on_hand > 0).length;
    const total = lines.length;
    const pct = total > 0 ? Math.round((withStock / total) * 100) : 0;
    return { withStock, total, pct };
  }, [lines]);

  const tooltipStyle = {
    backgroundColor: '#18181b',
    border: '1px solid #3f3f46',
    borderRadius: 8,
    fontSize: 11,
    color: '#fafafa',
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-bold text-zinc-900">Resultado de inventarios</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled || deleteMonthBusy || snapshots.length === 0}
            onClick={() => void onDeleteMonthlySnapshot()}
            className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-900 ring-1 ring-red-100 disabled:opacity-45"
          >
            <Trash2 className="h-4 w-4" />
            {deleteMonthBusy ? 'Borrando…' : 'Borrar cierre'}
          </button>
          <button
            type="button"
            disabled={disabled || pdfBusy || lines.length === 0}
            onClick={() => void onDownloadPdf()}
            className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-lg bg-zinc-950 px-3 text-xs font-bold text-white ring-1 ring-zinc-700 disabled:opacity-45"
          >
            <FileDown className="h-4 w-4" />
            {pdfBusy ? 'Generando…' : 'PDF mensual'}
          </button>
        </div>
      </div>
      <p className="text-[11px] leading-snug text-zinc-500">
        Al descargar el PDF se guarda el cierre del mes en curso ({yearMonth}) para los gráficos de evolución. Ejecuta en Supabase{' '}
        <code className="rounded bg-zinc-100 px-1 text-[10px] text-zinc-800">supabase-inventory-catalog-write-and-snapshots.sql</code>{' '}
        si fallan categorías, artículos o snapshots.
      </p>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-zinc-100 shadow-sm ring-1 ring-black/40">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Valor por mes</p>
          {momPct != null ? (
            <p className="mt-1 text-lg font-extrabold tabular-nums text-white">
              {momPct >= 0 ? '+' : ''}
              {momPct.toFixed(1)} % <span className="text-xs font-semibold text-zinc-400">vs mes ant.</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-zinc-500">Necesitas al menos 2 meses guardados (PDF).</p>
          )}
          <div className="mt-2 h-[140px] w-full">
            {barData.length === 0 ? (
              <p className="pt-8 text-center text-[11px] text-zinc-500">Sin datos. Descarga un PDF para registrar el mes.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="label" tick={{ fill: '#a1a1aa', fontSize: 9 }} interval={0} angle={-25} textAnchor="end" height={48} />
                  <YAxis tick={{ fill: '#a1a1aa', fontSize: 9 }} width={36} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v) => [`${Number(v ?? 0).toFixed(2)} €`, 'Valor']}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={entry.projected ? CHART_MUTED : CHART_RED} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-zinc-100 shadow-sm ring-1 ring-black/40">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Valor por categoría (ahora)</p>
          <p className="mt-1 text-xs text-zinc-400">
            {categoryBarData.length === 0 ? 'Sin líneas con valor' : 'Barras horizontales: nombre de categoría e importe'}
          </p>
          <div className="mt-2 w-full" style={{ height: categoryChartHeight }}>
            {categoryBarData.length === 0 ? (
              <p className="pt-10 text-center text-[11px] text-zinc-500">—</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={categoryBarData}
                  margin={{ top: 2, right: 36, left: 4, bottom: 2 }}
                  barCategoryGap={6}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={118}
                    tick={{ fill: '#e4e4e7', fontSize: 9 }}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v) => [`${Number(v ?? 0).toFixed(2)} €`, 'Valor']}
                    labelFormatter={(label) => String(label)}
                  />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={22}>
                    {categoryBarData.map((_, i) => (
                      <Cell key={i} fill={CATEGORY_BAR_COLORS[i % CATEGORY_BAR_COLORS.length]} />
                    ))}
                    <LabelList dataKey="labelEuro" position="insideRight" fill="#111827" fontSize={9} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-zinc-100 shadow-sm ring-1 ring-black/40">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Cobertura de stock</p>
          <p className="mt-2 text-3xl font-extrabold tabular-nums text-white">{stockCoverage.pct}%</p>
          <p className="mt-1 text-xs text-zinc-400">
            {stockCoverage.withStock} de {stockCoverage.total} referencias con cantidad &gt; 0
          </p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-[#D32F2F] transition-[width] duration-300"
              style={{ width: `${stockCoverage.pct}%` }}
            />
          </div>
          <p className="mt-3 text-[11px] leading-snug text-zinc-500">
            Indica cuántas líneas del inventario local tienen existencias; útil para revisar huecos antes del cierre mensual.
          </p>
        </div>
      </div>
    </section>
  );
}
