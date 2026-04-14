'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  ChefHat,
  LayoutDashboard,
  PieChart as PieChartIcon,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { CHEF_ONE_TAPER_LINE_CLASS } from '@/components/ChefOneGlowLine';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  buildEscandalloDashboardRows,
  bucketLabel,
  type EscandalloRecipeDashboardRow,
} from '@/lib/escandallos-analytics';
import {
  fetchEscandalloLines,
  fetchEscandalloRecipes,
  fetchProcessedProductsForEscandallo,
  fetchProductsForEscandallo,
  type EscandalloLine,
  type EscandalloProcessedProduct,
  type EscandalloRawProduct,
  type EscandalloRecipe,
} from '@/lib/escandallos-supabase';

const TAPER = `mx-auto w-20 ${CHEF_ONE_TAPER_LINE_CLASS}`;

const BUCKET_COLOR: Record<string, string> = {
  optimal: '#059669',
  watch: '#D97706',
  high: '#DC2626',
  no_pvp: '#71717a',
  no_lines: '#a1a1aa',
  sub: '#6366f1',
};

function KpiCard({
  title,
  value,
  hint,
  Icon,
  accent = 'red',
}: {
  title: string;
  value: string;
  hint?: string;
  Icon: LucideIcon;
  accent?: 'red' | 'emerald' | 'amber' | 'zinc' | 'violet';
}) {
  const ring =
    accent === 'emerald'
      ? 'from-emerald-500/20 via-white to-white'
      : accent === 'amber'
        ? 'from-amber-500/20 via-white to-white'
        : accent === 'violet'
          ? 'from-violet-500/20 via-white to-white'
          : accent === 'zinc'
            ? 'from-zinc-400/15 via-white to-white'
            : 'from-[#B91C1C]/18 via-white to-white';
  const iconC =
    accent === 'emerald'
      ? 'text-emerald-600'
      : accent === 'amber'
        ? 'text-amber-600'
        : accent === 'violet'
          ? 'text-violet-600'
          : accent === 'zinc'
            ? 'text-zinc-500'
            : 'text-[#D32F2F]';

  return (
    <div className={`rounded-2xl bg-gradient-to-br p-[1px] shadow-sm ${ring}`}>
      <div className="rounded-2xl bg-white px-4 py-4 ring-1 ring-zinc-200/80">
        <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">
          <Icon className={`h-3.5 w-3.5 ${iconC}`} />
          {title}
        </div>
        <p className="mt-2 text-2xl font-black tabular-nums tracking-tight text-zinc-900">{value}</p>
        {hint ? <p className="mt-1 text-[11px] font-medium leading-snug text-zinc-500">{hint}</p> : null}
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl bg-gradient-to-b from-zinc-50/90 to-white p-4 shadow-sm ring-1 ring-zinc-200/90 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#D32F2F]/10 text-[#B91C1C] ring-1 ring-[#D32F2F]/20">
          <Icon className="h-5 w-5" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold tracking-tight text-zinc-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm text-zinc-600">{subtitle}</p> : null}
        </div>
      </div>
      <div className={`${TAPER} mt-4`} aria-hidden />
      <div className="mt-4">{children}</div>
    </section>
  );
}

type SortKey = 'name' | 'foodCost' | 'cost' | 'net' | 'gross';

export default function EscandallosCentroPage() {
  const { localId, profileReady } = useAuth();
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();
  const [recipes, setRecipes] = useState<EscandalloRecipe[]>([]);
  const [linesByRecipe, setLinesByRecipe] = useState<Record<string, EscandalloLine[]>>({});
  const [rawProducts, setRawProducts] = useState<EscandalloRawProduct[]>([]);
  const [processedProducts, setProcessedProducts] = useState<EscandalloProcessedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('foodCost');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setRecipes([]);
      setLinesByRecipe({});
      setRawProducts([]);
      setProcessedProducts([]);
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    setLoading(true);
    setBanner(null);
    try {
      const [r, raw, processed] = await Promise.all([
        fetchEscandalloRecipes(supabase, localId),
        fetchProductsForEscandallo(supabase, localId),
        fetchProcessedProductsForEscandallo(supabase, localId),
      ]);
      setRecipes(r);
      setRawProducts(raw);
      setProcessedProducts(processed);
      const linesEntries = await Promise.all(
        r.map(async (recipe) => {
          const lines = await fetchEscandalloLines(supabase, localId, recipe.id);
          return [recipe.id, lines] as const;
        }),
      );
      setLinesByRecipe(Object.fromEntries(linesEntries));
    } catch (e: unknown) {
      setBanner(
        e instanceof Error ? e.message : 'No se pudieron cargar datos. Revisa conexión y migraciones de escandallos.',
      );
      setRecipes([]);
      setLinesByRecipe({});
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk]);

  useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  const rawById = useMemo(() => new Map(rawProducts.map((p) => [p.id, p])), [rawProducts]);
  const processedById = useMemo(() => new Map(processedProducts.map((p) => [p.id, p])), [processedProducts]);

  const rows = useMemo(
    () => buildEscandalloDashboardRows(recipes, linesByRecipe, rawById, processedById),
    [recipes, linesByRecipe, rawById, processedById],
  );

  const mainRows = useMemo(() => rows.filter((r) => !r.isSubRecipe), [rows]);
  const subRows = useMemo(() => rows.filter((r) => r.isSubRecipe), [rows]);

  const kpis = useMemo(() => {
    const withFc = mainRows.filter((r) => r.foodCostPct != null);
    const avgFc =
      withFc.length > 0
        ? Math.round((withFc.reduce((a, r) => a + (r.foodCostPct ?? 0), 0) / withFc.length) * 10) / 10
        : null;
    const noPvp = mainRows.filter((r) => r.bucket === 'no_pvp').length;
    const noLines = mainRows.filter((r) => r.bucket === 'no_lines').length;
    const withCost = mainRows.filter((r) => r.lineCount > 0);
    const avgCost =
      withCost.length > 0
        ? Math.round((withCost.reduce((a, r) => a + r.costPerYieldEur, 0) / withCost.length) * 100) / 100
        : null;
    const optimal = mainRows.filter((r) => r.bucket === 'optimal').length;
    const high = mainRows.filter((r) => r.bucket === 'high').length;
    return {
      mainCount: mainRows.length,
      subCount: subRows.length,
      avgFc,
      noPvp,
      noLines,
      avgCost,
      optimal,
      high,
      withFcCount: withFc.length,
    };
  }, [mainRows, subRows]);

  const barChartData = useMemo(() => {
    const data = mainRows
      .filter((r) => r.foodCostPct != null)
      .map((r) => ({
        name: r.name.length > 22 ? `${r.name.slice(0, 20)}…` : r.name,
        fullName: r.name,
        pct: Math.round((r.foodCostPct ?? 0) * 10) / 10,
        fill:
          (r.foodCostPct ?? 0) < 28 ? BUCKET_COLOR.optimal : (r.foodCostPct ?? 0) <= 35 ? BUCKET_COLOR.watch : BUCKET_COLOR.high,
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 16);
    return data;
  }, [mainRows]);

  const pieData = useMemo(() => {
    const keys: EscandalloRecipeDashboardRow['bucket'][] = ['optimal', 'watch', 'high', 'no_pvp', 'no_lines'];
    return keys
      .map((k) => {
        const n = mainRows.filter((r) => r.bucket === k).length;
        return { name: bucketLabel(k), key: k, value: n, fill: BUCKET_COLOR[k] };
      })
      .filter((d) => d.value > 0);
  }, [mainRows]);

  const sortedTable = useMemo(() => {
    const list = [...mainRows];
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return dir * a.name.localeCompare(b.name, 'es');
        case 'foodCost': {
          const av = a.foodCostPct ?? -1;
          const bv = b.foodCostPct ?? -1;
          return dir * (av - bv);
        }
        case 'cost':
          return dir * (a.costPerYieldEur - b.costPerYieldEur);
        case 'net':
          return dir * ((a.saleNetEur ?? -1) - (b.saleNetEur ?? -1));
        case 'gross':
          return dir * ((a.saleGrossEur ?? -1) - (b.saleGrossEur ?? -1));
        default:
          return 0;
      }
    });
    return list;
  }, [mainRows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  if (!profileReady) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">Cargando sesión…</p>
      </section>
    );
  }

  if (!localId || !supabaseOk) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm font-semibold text-zinc-900">Centro de escandallos no disponible</p>
        <p className="pt-1 text-sm text-zinc-600">Inicia sesión con un local configurado en Supabase.</p>
      </section>
    );
  }

  return (
    <div className="space-y-5 pb-10">
      <MermasStyleHero
        eyebrow="Inteligencia de carta"
        title="Centro de escandallos"
        description="Visión única de costes, PVP y food cost de todos los platos. Misma estética Chef-One, datos al día."
        compact
      />

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/escandallos"
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 shadow-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Editar recetas
        </Link>
        <Link
          href="/panel"
          className="inline-flex h-9 items-center rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm font-semibold text-zinc-700"
        >
          Panel
        </Link>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-zinc-900 px-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {banner ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-100">
          {banner}
        </div>
      ) : null}

      {loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando escandallos…</p>
      ) : mainRows.length === 0 && subRows.length === 0 ? (
        <div className="rounded-3xl bg-zinc-50 py-12 text-center ring-1 ring-zinc-200">
          <p className="text-sm font-semibold text-zinc-800">Aún no hay recetas</p>
          <p className="mt-1 text-sm text-zinc-600">Crea platos y bases desde Escandallos.</p>
          <Link href="/escandallos" className="mt-4 inline-block text-sm font-bold text-[#B91C1C] underline">
            Ir a escandallos
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              title="Platos en carta"
              value={String(kpis.mainCount)}
              hint={`${kpis.optimal} óptimo · ${kpis.high} food cost alto`}
              Icon={ChefHat}
              accent="red"
            />
            <KpiCard
              title="Food cost medio"
              value={kpis.avgFc != null ? `${kpis.avgFc} %` : '—'}
              hint={
                kpis.withFcCount > 0
                  ? `Sobre ${kpis.withFcCount} platos con PVP`
                  : 'Indica PVP en cada plato'
              }
              Icon={kpis.avgFc != null && kpis.avgFc <= 30 ? TrendingDown : TrendingUp}
              accent={kpis.avgFc != null && kpis.avgFc <= 30 ? 'emerald' : 'amber'}
            />
            <KpiCard
              title="Coste medio / ración"
              value={kpis.avgCost != null ? `${kpis.avgCost.toFixed(2)} €` : '—'}
              hint="Platos con al menos un ingrediente"
              Icon={Calculator}
              accent="zinc"
            />
            <KpiCard
              title="Bases (sub-recetas)"
              value={String(kpis.subCount)}
              hint={`${kpis.noPvp} platos sin PVP · ${kpis.noLines} sin ingredientes`}
              Icon={LayoutDashboard}
              accent="violet"
            />
          </div>

          {(kpis.noPvp > 0 || kpis.noLines > 0) && (
            <div className="flex items-start gap-2 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-950 ring-1 ring-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                <span className="font-semibold">Atención:</span> {kpis.noPvp} plato{kpis.noPvp !== 1 ? 's' : ''} sin
                precio de venta y {kpis.noLines} sin ingredientes. El food cost y los gráficos quedarán incompletos hasta
                completarlos.
              </p>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <Section
              title="Food cost por plato"
              subtitle="Ordenado de mayor a menor. Colores: óptimo, atención, alto."
              icon={LayoutDashboard}
            >
              {barChartData.length === 0 ? (
                <p className="text-sm text-zinc-500">Añade PVP e ingredientes para ver el ranking.</p>
              ) : (
                <div className="h-[min(28rem,70vh)] w-full min-h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={barChartData} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} unit=" %" domain={[0, 'auto']} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={108}
                        tick={{ fontSize: 10 }}
                        interval={0}
                      />
                      <Tooltip
                        formatter={(value) => [
                          value != null && value !== '' ? `${Number(value)} %` : '—',
                          'Food cost',
                        ]}
                        labelFormatter={(_, payload) =>
                          payload?.[0]?.payload?.fullName ? String(payload[0].payload.fullName) : ''
                        }
                        contentStyle={{ borderRadius: 12, border: '1px solid #e4e4e7' }}
                      />
                      <Bar dataKey="pct" radius={[0, 6, 6, 0]} maxBarSize={22}>
                        {barChartData.map((_, i) => (
                          <Cell key={i} fill={barChartData[i].fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Section>

            <Section
              title="Distribución de platos"
              subtitle="Cómo está la carta respecto al food cost y datos faltantes."
              icon={PieChartIcon}
            >
              {pieData.length === 0 ? (
                <p className="text-sm text-zinc-500">Sin datos para el reparto.</p>
              ) : (
                <div className="h-[min(22rem,55vh)] w-full min-h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={84}
                        paddingAngle={2}
                      >
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} stroke="#fff" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [value != null ? Number(value) : '—', 'Platos']}
                        contentStyle={{ borderRadius: 12, border: '1px solid #e4e4e7' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
              <ul className="mt-2 flex flex-wrap justify-center gap-2 text-[11px] font-semibold">
                {pieData.map((d) => (
                  <li
                    key={d.key}
                    className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 ring-1 ring-zinc-200/80"
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: d.fill }} />
                    {d.name}: {d.value}
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <Section
            title="Tabla maestra de platos"
            subtitle="Coste por unidad de rendimiento, PVP bruto y neto, food cost y margen bruta aproximada (100 % − food cost)."
            icon={Calculator}
          >
            <div className="overflow-x-auto rounded-2xl ring-1 ring-zinc-200">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-100/80 text-[10px] font-extrabold uppercase tracking-wider text-zinc-600">
                    <th className="px-3 py-2.5">
                      <button type="button" onClick={() => toggleSort('name')} className="font-extrabold text-zinc-700">
                        Plato {sortKey === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                    <th className="px-3 py-2.5">
                      <button type="button" onClick={() => toggleSort('cost')} className="font-extrabold text-zinc-700">
                        Coste / ud. {sortKey === 'cost' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                    <th className="px-3 py-2.5">
                      <button type="button" onClick={() => toggleSort('gross')} className="font-extrabold text-zinc-700">
                        PVP IVA inc. {sortKey === 'gross' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                    <th className="px-3 py-2.5">
                      <button type="button" onClick={() => toggleSort('net')} className="font-extrabold text-zinc-700">
                        Neto {sortKey === 'net' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                    <th className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => toggleSort('foodCost')}
                        className="font-extrabold text-zinc-700"
                      >
                        Food cost {sortKey === 'foodCost' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                    <th className="px-3 py-2.5">Margen*</th>
                    <th className="px-3 py-2.5">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTable.map((r) => {
                    const margin =
                      r.foodCostPct != null ? Math.round((100 - r.foodCostPct) * 10) / 10 : null;
                    return (
                      <tr key={r.id} className="border-b border-zinc-100 hover:bg-zinc-50/80">
                        <td className="px-3 py-2.5 font-semibold text-zinc-900">
                          {r.name}
                          <span className="ml-1 text-[10px] font-normal text-zinc-500">
                            ({r.yieldQty} {r.yieldLabel})
                          </span>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-zinc-800">{r.costPerYieldEur.toFixed(2)} €</td>
                        <td className="px-3 py-2.5 tabular-nums text-zinc-800">
                          {r.saleGrossEur != null ? `${r.saleGrossEur.toFixed(2)} €` : '—'}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-zinc-800">
                          {r.saleNetEur != null ? `${r.saleNetEur.toFixed(2)} €` : '—'}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums font-semibold">
                          {r.foodCostPct != null ? (
                            <span
                              className={
                                r.foodCostPct < 28
                                  ? 'text-emerald-700'
                                  : r.foodCostPct <= 35
                                    ? 'text-amber-700'
                                    : 'text-red-700'
                              }
                            >
                              {r.foodCostPct.toFixed(1)} %
                            </span>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-zinc-700">
                          {margin != null ? `${margin} %` : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                            style={{ background: BUCKET_COLOR[r.bucket] ?? '#71717a' }}
                          >
                            {bucketLabel(r.bucket)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
              * Margen aproximado solo sobre coste de ingredientes (sin mano de obra ni otros costes fijos).
            </p>
          </Section>

          {subRows.length > 0 ? (
            <Section
              title="Bases y sub-recetas"
              subtitle="Coste total del batch y coste por unidad de rendimiento. Usa estas bases como ingrediente en los platos."
              icon={ChefHat}
            >
              <div className="overflow-x-auto rounded-2xl ring-1 ring-zinc-200">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-violet-50/80 text-[10px] font-extrabold uppercase tracking-wider text-violet-900/80">
                      <th className="px-3 py-2.5">Base</th>
                      <th className="px-3 py-2.5">Rendimiento</th>
                      <th className="px-3 py-2.5">Líneas</th>
                      <th className="px-3 py-2.5">Coste batch</th>
                      <th className="px-3 py-2.5">€ / ud.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subRows
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
                      .map((r) => (
                        <tr key={r.id} className="border-b border-zinc-100 hover:bg-violet-50/40">
                          <td className="px-3 py-2.5 font-semibold text-zinc-900">{r.name}</td>
                          <td className="px-3 py-2.5 text-zinc-700">
                            {r.yieldQty} {r.yieldLabel}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-zinc-700">{r.lineCount}</td>
                          <td className="px-3 py-2.5 tabular-nums text-zinc-800">{r.totalCostEur.toFixed(2)} €</td>
                          <td className="px-3 py-2.5 tabular-nums font-semibold text-zinc-900">
                            {r.costPerYieldEur.toFixed(2)} €
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Section>
          ) : null}
        </>
      )}
    </div>
  );
}
