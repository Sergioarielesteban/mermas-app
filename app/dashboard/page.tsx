'use client';

import React from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CalendarDays, TrendingDown, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useMermasStore } from '@/components/MermasStoreProvider';
import { toBusinessDate } from '@/lib/business-day';
import {
  anomalyAlerts,
  highWasteAlerts,
  monthComparison,
  monthTrend,
  topMotives,
  topByQuantity,
  topByValue,
  totals,
  weekBars,
} from '@/lib/analytics';

const eur = (value: number) => `${Number(value).toFixed(2)} €`;
const MONTHLY_TARGET_KEY = 'mermas_monthly_target_eur';
const WEEKLY_TARGET_KEY = 'mermas_weekly_target_eur';
const qty = (value: number) =>
  Number(value).toLocaleString('es-ES', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const motiveLabelMap: Record<string, string> = {
  'se-quemo': 'SE QUEMÓ',
  'mal-estado': 'MAL ESTADO',
  'cliente-cambio': 'EL CLIENTE CAMBIÓ',
  'error-cocina': 'ERROR DEL EQUIPO',
  'sobras-marcaje': 'SOBRAS DE MARCAJE',
  cancelado: 'CANCELADO',
};

function Card({
  title,
  value,
  Icon,
  tone = 'default',
  onClick,
  extra,
}: {
  title: string;
  value: number;
  Icon?: React.ComponentType<{ className?: string }>;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  onClick?: () => void;
  extra?: React.ReactNode;
}) {
  const toneStyles =
    tone === 'success'
      ? {
          border: 'from-emerald-500/20 via-white to-white',
          badge: 'bg-emerald-500/12 text-emerald-700 ring-emerald-500/25',
          icon: 'text-emerald-600',
        }
      : tone === 'warning'
        ? {
            border: 'from-amber-500/20 via-white to-white',
            badge: 'bg-amber-500/12 text-amber-700 ring-amber-500/25',
            icon: 'text-amber-600',
          }
        : tone === 'danger'
          ? {
              border: 'from-red-600/22 via-white to-white',
              badge: 'bg-red-600/12 text-red-700 ring-red-600/25',
              icon: 'text-red-600',
            }
          : {
              border: 'from-[#B91C1C]/15 via-white to-white',
              badge: 'bg-[#D32F2F]/10 text-[#B91C1C] ring-[#D32F2F]/20',
              icon: 'text-[#D32F2F]',
            };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl bg-gradient-to-br p-[1px] text-left shadow-sm transition-transform hover:scale-[1.01] ${toneStyles.border}`}
    >
      <div className="rounded-2xl bg-white px-4 py-5 text-center ring-1 ring-zinc-200/80">
        <div className="flex items-center justify-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">
          {Icon ? <Icon className={`h-3.5 w-3.5 ${toneStyles.icon}`} /> : null}
          <span>{title}</span>
        </div>
        <p className={`mt-3 inline-flex items-center justify-center rounded-xl px-3 py-1.5 text-2xl font-black ring-1 ${toneStyles.badge}`}>
          {eur(value)}
        </p>
        {extra ? <div className="mt-2 flex items-center justify-center">{extra}</div> : null}
      </div>
    </button>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
      <h2 className="text-sm font-extrabold uppercase tracking-wide text-zinc-700">{title}</h2>
      <div className="mt-3 h-64 min-w-0">{children}</div>
    </section>
  );
}

function SafeChart({ children }: { children: React.ReactNode }) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const update = () => {
      const rect = host.getBoundingClientRect();
      setReady(rect.width > 8 && rect.height > 8);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={hostRef} className="h-full w-full min-w-0">
      {ready ? children : <div className="h-full w-full rounded-xl bg-zinc-50 ring-1 ring-zinc-200" />}
    </div>
  );
}

function readStoredTarget(key: string, fallback: number) {
  try {
    if (typeof window === 'undefined') return fallback;
    const raw = window.localStorage.getItem(key);
    const parsed = Number(raw ?? fallback);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export default function DashboardPage() {
  const { products, mermas } = useMermasStore();
  const t = totals(mermas);
  const dataWeek = weekBars(mermas);
  const dataTrend = monthTrend(mermas);
  const dataTopQty = topByQuantity(mermas, products);
  const dataTopValue = topByValue(mermas, products);
  const monthly = monthComparison(mermas);
  const alerts = highWasteAlerts(mermas, products);
  const motives = topMotives(mermas);
  const anomalies = anomalyAlerts(mermas, products);
  const [monthlyTarget, setMonthlyTarget] = React.useState<number>(() => readStoredTarget(MONTHLY_TARGET_KEY, 500));
  const [weeklyTarget, setWeeklyTarget] = React.useState<number>(() => readStoredTarget(WEEKLY_TARGET_KEY, 125));
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [detailTitle, setDetailTitle] = React.useState('');
  const [detailRows, setDetailRows] = React.useState<Array<{ id: string; occurredAt: string; productName: string; quantity: number; costEur: number; motiveKey: string }>>([]);

  React.useEffect(() => {
    try {
      localStorage.setItem(MONTHLY_TARGET_KEY, String(monthlyTarget));
    } catch {
      // ignore
    }
  }, [monthlyTarget]);

  React.useEffect(() => {
    try {
      localStorage.setItem(WEEKLY_TARGET_KEY, String(weeklyTarget));
    } catch {
      // ignore
    }
  }, [weeklyTarget]);

  const monthNow = toBusinessDate(new Date());
  const monthlyMermas = mermas.filter((m) => {
    const d = toBusinessDate(m.occurredAt);
    return d.getFullYear() === monthNow.getFullYear() && d.getMonth() === monthNow.getMonth();
  });
  const monthlyTopValue = topByValue(monthlyMermas, products, 5);
  const monthlyMotives = topMotives(monthlyMermas, 5);
  const monthlyAnomalies = anomalyAlerts(monthlyMermas, products, 5);
  const daysInMonth = new Date(monthNow.getFullYear(), monthNow.getMonth() + 1, 0).getDate();
  const currentDayOfMonth = monthNow.getDate();
  const projectedMonth =
    currentDayOfMonth > 0 ? Math.round(((t.month / currentDayOfMonth) * daysInMonth) * 100) / 100 : t.month;
  const projectedRatio = monthlyTarget > 0 ? projectedMonth / monthlyTarget : 0;
  const projectedTone = projectedRatio <= 0.85 ? 'success' : projectedRatio <= 1 ? 'warning' : 'danger';
  const weeklyRatio = weeklyTarget > 0 ? t.week / weeklyTarget : 0;
  const weeklySeverity = weeklyRatio <= 0.85 ? 'verde' : weeklyRatio <= 1 ? 'amarillo' : 'rojo';
  const targetRatio = monthlyTarget > 0 ? t.month / monthlyTarget : 0;
  const targetSeverity = targetRatio <= 0.85 ? 'verde' : targetRatio <= 1 ? 'amarillo' : 'rojo';
  const weekCardTone = weeklyRatio <= 0.85 ? 'success' : weeklyRatio <= 1 ? 'warning' : 'danger';
  const monthCardTone = targetRatio <= 0.85 ? 'success' : targetRatio <= 1 ? 'warning' : 'danger';
  const weeklyColor =
    weeklySeverity === 'verde' ? 'bg-emerald-500' : weeklySeverity === 'amarillo' ? 'bg-amber-500' : 'bg-red-500';
  const targetColor =
    targetSeverity === 'verde' ? 'bg-emerald-500' : targetSeverity === 'amarillo' ? 'bg-amber-500' : 'bg-red-500';

  const openDetail = React.useCallback(
    (title: string, rows: typeof detailRows) => {
      const ordered = [...rows].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
      setDetailTitle(title);
      setDetailRows(ordered);
      setDetailOpen(true);
    },
    [],
  );

  const mermasWithProduct = React.useMemo(
    () =>
      mermas.map((m) => ({
        id: m.id,
        occurredAt: m.occurredAt,
        productName: products.find((p) => p.id === m.productId)?.name ?? 'Producto',
        productId: m.productId,
        quantity: m.quantity,
        costEur: m.costEur,
        motiveKey: m.motiveKey,
      })),
    [mermas, products],
  );

  const openProductDetail = React.useCallback(
    (productId: string, productName: string) => {
      openDetail(
        `Detalle por producto: ${productName}`,
        mermasWithProduct.filter((m) => m.productId === productId),
      );
    },
    [mermasWithProduct, openDetail],
  );

  const now = toBusinessDate(new Date());
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);
  const previousWeekStart = new Date(weekStart);
  previousWeekStart.setDate(weekStart.getDate() - 7);
  const previousWeekEnd = new Date(weekStart);
  previousWeekEnd.setMilliseconds(-1);
  const previousWeekTotal = mermas.reduce((acc, m) => {
    const d = toBusinessDate(m.occurredAt);
    if (d >= previousWeekStart && d <= previousWeekEnd) return acc + m.costEur;
    return acc;
  }, 0);
  const weeklyDelta = Math.round((t.week - previousWeekTotal) * 100) / 100;
  const weeklyTrendUp = weeklyDelta > 0;
  const weeklyTrendFlat = weeklyDelta === 0;

  const exportMonthlyExecutivePdf = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const monthLabel = monthNow.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    doc.setFontSize(16);
    doc.text('Informe Ejecutivo de Mermas', 40, 40);
    doc.setFontSize(11);
    doc.text(`Mes: ${monthLabel}`, 40, 62);
    doc.text(`Merma mensual: ${eur(t.month)}`, 40, 80);
    doc.text(`Objetivo mensual: ${eur(monthlyTarget)} | Estado: ${targetSeverity.toUpperCase()}`, 40, 96);

    autoTable(doc, {
      startY: 116,
      head: [['Top productos (valor)', 'Valor']],
      body:
        monthlyTopValue.length > 0
          ? monthlyTopValue.map((item) => [item.name, eur(item.value)])
          : [['Sin datos', '-']],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [211, 47, 47] },
    });

    autoTable(doc, {
      startY: (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY
        ? ((doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 130) + 18
        : 240,
      head: [['Top motivos', 'Artículos', 'Impacto']],
      body:
        monthlyMotives.length > 0
          ? monthlyMotives.map((item) => [item.label, String(item.quantity), eur(item.totalCost)])
          : [['Sin datos', '-', '-']],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [211, 47, 47] },
    });

    autoTable(doc, {
      startY: (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY
        ? ((doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 360) + 18
        : 420,
      head: [['Anomalias', 'Semana actual', 'Semana previa', 'Incremento']],
      body:
        monthlyAnomalies.length > 0
          ? monthlyAnomalies.map((item) => [item.productName, eur(item.current), eur(item.previous), `+${eur(item.delta)}`])
          : [['Sin anomalías', '-', '-', '-']],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [211, 47, 47] },
    });

    doc.save(`informe-ejecutivo-${monthNow.toISOString().slice(0, 7)}.pdf`);
  };

  return (
    <div className="space-y-4">
      {detailOpen ? (
        <div className="fixed inset-0 z-[95] bg-black/35 p-4" onClick={() => setDetailOpen(false)}>
          <div
            className="mx-auto mt-8 max-h-[82vh] w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <h3 className="text-sm font-extrabold uppercase tracking-wide text-zinc-800">{detailTitle}</h3>
              <button type="button" onClick={() => setDetailOpen(false)} className="rounded-lg px-2 py-1 text-xs font-bold text-zinc-600 hover:bg-zinc-100">
                Cerrar
              </button>
            </div>
            <div className="max-h-[68vh] space-y-2 overflow-y-auto p-3">
              {detailRows.length === 0 ? (
                <p className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-500 ring-1 ring-zinc-200">Sin registros para este filtro.</p>
              ) : (
                detailRows.map((row) => (
                  <div key={row.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <p className="text-sm font-bold text-zinc-900">{row.productName}</p>
                    <p className="pt-1 text-xs text-zinc-700">
                      Fecha: {new Date(row.occurredAt).toLocaleString('es-ES')}
                    </p>
                    <p className="pt-1 text-xs text-zinc-700">
                      Cantidad: {qty(row.quantity)} | Coste: {eur(row.costEur)}
                    </p>
                    <p className="pt-1 text-[11px] font-semibold text-zinc-600">
                      Motivo: {motiveLabelMap[row.motiveKey] ?? row.motiveKey}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Business Intelligence</p>
        <p className="pt-1 text-center text-sm font-semibold text-zinc-700">
          Seguimiento en tiempo real del coste de merma.
        </p>
      </div>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-zinc-700">
            Alertas de Merma Alta (Mes actual)
          </h2>
        </div>
        {alerts.length === 0 ? (
          <p className="text-sm text-zinc-500">Sin alertas relevantes este mes.</p>
        ) : (
          <div className="space-y-2">
            {alerts.map((item) => (
              <div key={item.productId} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-bold text-zinc-900">{item.productName}</p>
                  <span
                    className={[
                      'rounded-full px-2 py-1 text-[11px] font-bold uppercase',
                      item.severity === 'alta'
                        ? 'bg-red-100 text-red-700'
                        : item.severity === 'media'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700',
                    ].join(' ')}
                  >
                    {item.severity}
                  </span>
                </div>
                <p className="pt-1 text-xs text-zinc-700">
                  Coste acumulado: <strong>{eur(item.totalCost)}</strong> | artículos: {item.quantity}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-zinc-700">Aviso de Anomalias (7d vs 7d)</h2>
        {anomalies.length === 0 ? (
          <p className="pt-2 text-sm text-zinc-500">Sin anomalías relevantes detectadas.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {anomalies.map((item) => (
              <div
                key={item.productId}
                className={[
                  'rounded-xl border p-3',
                  item.severity === 'alta' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-zinc-900">
                    {item.severity === 'alta' ? '🚨 ' : '⚠️ '}
                    {item.productName}
                  </p>
                  <span
                    className={[
                      'rounded-full px-2 py-1 text-[11px] font-bold uppercase',
                      item.severity === 'alta' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700',
                    ].join(' ')}
                  >
                    {item.severity}
                  </span>
                </div>
                <p className="pt-1 text-xs text-zinc-700">
                  Semana actual: <strong>{eur(item.current)}</strong> | semana previa: <strong>{eur(item.previous)}</strong>
                </p>
                <p className={['pt-1 text-xs font-semibold', item.severity === 'alta' ? 'text-red-800' : 'text-amber-800'].join(' ')}>
                  Incremento: +{eur(item.delta)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-3">
        <Card
          title="Merma de Hoy"
          value={t.today}
          onClick={() =>
            openDetail(
              'Detalle Merma de Hoy',
              mermasWithProduct.filter((m) => {
                const d = toBusinessDate(m.occurredAt);
                return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
              }),
            )
          }
        />
        <Card
          title="Merma de la Semana"
          value={t.week}
          Icon={CalendarDays}
          tone={weekCardTone}
          extra={
            <span
              className={[
                'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold',
                weeklyTrendFlat
                  ? 'bg-zinc-100 text-zinc-600'
                  : weeklyTrendUp
                    ? 'bg-red-100 text-red-700'
                    : 'bg-emerald-100 text-emerald-700',
              ].join(' ')}
            >
              {weeklyTrendFlat ? null : weeklyTrendUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {weeklyTrendFlat ? 'Sin cambio vs semana anterior' : `${weeklyTrendUp ? '↑' : '↓'} ${eur(Math.abs(weeklyDelta))} vs semana anterior`}
            </span>
          }
          onClick={() => openDetail('Detalle Merma de la Semana', mermasWithProduct.filter((m) => toBusinessDate(m.occurredAt) >= weekStart))}
        />
        <Card
          title="Merma del Mes"
          value={t.month}
          tone={monthCardTone}
          onClick={() =>
            openDetail(
              'Detalle Merma del Mes',
              mermasWithProduct.filter((m) => {
                const d = toBusinessDate(m.occurredAt);
                return d.getFullYear() === monthNow.getFullYear() && d.getMonth() === monthNow.getMonth();
              }),
            )
          }
        />
        <Card
          title="Proyección Fin de Mes"
          value={projectedMonth}
          tone={projectedTone}
          onClick={() =>
            openDetail(
              'Base de Proyección Mensual',
              mermasWithProduct.filter((m) => {
                const d = toBusinessDate(m.occurredAt);
                return d.getFullYear() === monthNow.getFullYear() && d.getMonth() === monthNow.getMonth();
              }),
            )
          }
        />
      </div>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-zinc-700">Objetivo Semanal</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
          <input
            type="number"
            min={1}
            value={weeklyTarget}
            onChange={(e) => setWeeklyTarget(Math.max(1, Number(e.target.value || 1)))}
            className="h-10 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none"
          />
          <p className="self-center text-sm font-semibold text-zinc-700">
            Actual: {eur(t.week)} / Objetivo: {eur(weeklyTarget)}
          </p>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {[75, 100, 125, 150].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setWeeklyTarget(value)}
              className={[
                'h-9 rounded-lg border text-xs font-bold',
                weeklyTarget === value
                  ? 'border-[#D32F2F] bg-[#D32F2F] text-white'
                  : 'border-zinc-300 bg-white text-zinc-700',
              ].join(' ')}
            >
              {value}€
            </button>
          ))}
        </div>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-zinc-200">
          <div className={['h-full transition-all', weeklyColor].join(' ')} style={{ width: `${Math.min(weeklyRatio * 100, 100)}%` }} />
        </div>
        <p className="mt-2 text-xs font-semibold uppercase text-zinc-600">Semáforo: {weeklySeverity}</p>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-zinc-700">Objetivo Mensual</h2>
          <button
            type="button"
            onClick={exportMonthlyExecutivePdf}
            className="h-9 rounded-lg bg-[#D32F2F] px-3 text-xs font-bold text-white"
          >
            PDF Ejecutivo Mensual
          </button>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
          <input
            type="number"
            min={1}
            value={monthlyTarget}
            onChange={(e) => setMonthlyTarget(Math.max(1, Number(e.target.value || 1)))}
            className="h-10 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none"
          />
          <p className="self-center text-sm font-semibold text-zinc-700">
            Actual: {eur(t.month)} / Objetivo: {eur(monthlyTarget)}
          </p>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {[500, 750, 1000, 1500].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMonthlyTarget(value)}
              className={[
                'h-9 rounded-lg border text-xs font-bold',
                monthlyTarget === value
                  ? 'border-[#D32F2F] bg-[#D32F2F] text-white'
                  : 'border-zinc-300 bg-white text-zinc-700',
              ].join(' ')}
            >
              {value}€
            </button>
          ))}
        </div>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-zinc-200">
          <div className={['h-full transition-all', targetColor].join(' ')} style={{ width: `${Math.min(targetRatio * 100, 100)}%` }} />
        </div>
        <p className="mt-2 text-xs font-semibold uppercase text-zinc-600">Semáforo: {targetSeverity}</p>
      </section>

      <Block title="Merma de la Semana (€)">
        <SafeChart><ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
          <BarChart data={dataWeek} margin={{ top: 18, right: 10, left: -8, bottom: 2 }}>
            <defs>
              <linearGradient id="barWeek" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#EF4444" />
                <stop offset="100%" stopColor="#B91C1C" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
            <XAxis dataKey="day" tick={{ fill: '#52525b', fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(value) => [eur(Number(value ?? 0)), 'Valor']}
              contentStyle={{ borderRadius: 12, border: '1px solid #e4e4e7', boxShadow: '0 6px 20px rgba(0,0,0,0.08)' }}
            />
            <Bar dataKey="cost" fill="url(#barWeek)" radius={[10, 10, 0, 0]} barSize={30}>
              <LabelList dataKey="cost" position="top" formatter={(v) => `${Number(v ?? 0).toFixed(0)}€`} className="fill-zinc-600 text-[11px] font-semibold" />
            </Bar>
          </BarChart>
        </ResponsiveContainer></SafeChart>
      </Block>

      <Block title="Tendencia de Merma Mensual">
        <SafeChart><ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
          <LineChart data={dataTrend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip formatter={(value) => [eur(Number(value ?? 0)), 'VALOR']} />
            <Line type="monotone" dataKey="cost" stroke="#D32F2F" strokeWidth={3} dot={false} />
          </LineChart>
        </ResponsiveContainer></SafeChart>
      </Block>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-zinc-700">
          Comparación Mensual
        </h2>
        <p className="pt-1 text-xs text-zinc-600">
          Diferencia vs mes anterior:{' '}
          <span className={monthly.diff <= 0 ? 'font-bold text-emerald-700' : 'font-bold text-red-700'}>
            {monthly.diff >= 0 ? '+' : ''}
            {eur(monthly.diff)} ({monthly.pct.toFixed(1)}%)
          </span>
        </p>
        <div className="mt-3 h-56 min-w-0">
          <SafeChart><ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
            <BarChart data={monthly.chart} margin={{ top: 18, right: 10, left: -8, bottom: 2 }}>
              <defs>
                <linearGradient id="barMonthComp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F87171" />
                  <stop offset="100%" stopColor="#DC2626" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#52525b', fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(value) => [eur(Number(value ?? 0)), 'Valor']}
                contentStyle={{ borderRadius: 12, border: '1px solid #e4e4e7', boxShadow: '0 6px 20px rgba(0,0,0,0.08)' }}
              />
              <Bar dataKey="value" fill="url(#barMonthComp)" radius={[10, 10, 0, 0]} barSize={36}>
                <LabelList dataKey="value" position="top" formatter={(v) => `${Number(v ?? 0).toFixed(0)}€`} className="fill-zinc-600 text-[11px] font-semibold" />
              </Bar>
            </BarChart>
          </ResponsiveContainer></SafeChart>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-zinc-700">Top Motivos de Merma</h2>
        {motives.length === 0 ? (
          <p className="pt-2 text-sm text-zinc-500">Sin datos de motivos.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {motives.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() =>
                  openDetail(
                    `Detalle motivo: ${item.label}`,
                    mermasWithProduct.filter((m) => m.motiveKey === item.key),
                  )
                }
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-left"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-zinc-900">{item.label}</p>
                  <p className="text-xs font-semibold text-zinc-700">{item.quantity} artículos</p>
                </div>
                <p className="pt-1 text-xs text-zinc-700">Impacto: {eur(item.totalCost)}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      <Block title="Top 5 Productos por Cantidad Tirada">
        <SafeChart><ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
          <BarChart data={dataTopQty} layout="vertical" margin={{ top: 8, right: 52, left: 10, bottom: 2 }}>
            <defs>
              <linearGradient id="barTopQty" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#60A5FA" />
                <stop offset="100%" stopColor="#2563EB" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
            <XAxis type="number" tickFormatter={(value) => qty(Number(value ?? 0))} tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={132} tick={{ fill: '#52525b', fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(value) => [qty(Number(value ?? 0)), 'Cantidad']}
              contentStyle={{ borderRadius: 12, border: '1px solid #e4e4e7', boxShadow: '0 6px 20px rgba(0,0,0,0.08)' }}
            />
            <Bar
              dataKey="value"
              fill="url(#barTopQty)"
              radius={[0, 10, 10, 0]}
              barSize={18}
              onClick={(entry) => {
                if (!entry || typeof entry !== 'object') return;
                const row = entry as { productId?: string; name?: string };
                if (!row.productId || !row.name) return;
                openProductDetail(row.productId, row.name);
              }}
            >
              <LabelList dataKey="value" position="right" formatter={(v) => qty(Number(v ?? 0))} className="fill-zinc-600 text-[11px] font-semibold" />
            </Bar>
          </BarChart>
        </ResponsiveContainer></SafeChart>
        <div className="mt-2 space-y-1">
          {dataTopQty.map((item) => (
            <button
              key={item.productId}
              type="button"
              onClick={() => openProductDetail(item.productId, item.name)}
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              Ver detalle: {item.name}
            </button>
          ))}
        </div>
      </Block>

      <Block title="Top 5 Productos por Valor Economico">
        <SafeChart><ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
          <BarChart data={dataTopValue} layout="vertical" margin={{ top: 8, right: 58, left: 10, bottom: 2 }}>
            <defs>
              <linearGradient id="barTopValue" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#FB7185" />
                <stop offset="100%" stopColor="#D32F2F" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
            <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={145} tick={{ fill: '#52525b', fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(value) => [eur(Number(value ?? 0)), 'Valor']}
              contentStyle={{ borderRadius: 12, border: '1px solid #e4e4e7', boxShadow: '0 6px 20px rgba(0,0,0,0.08)' }}
            />
            <Bar
              dataKey="value"
              fill="url(#barTopValue)"
              radius={[0, 10, 10, 0]}
              barSize={18}
              onClick={(entry) => {
                if (!entry || typeof entry !== 'object') return;
                const row = entry as { productId?: string; name?: string };
                if (!row.productId || !row.name) return;
                openProductDetail(row.productId, row.name);
              }}
            >
              <LabelList dataKey="value" position="right" formatter={(v) => `${Number(v ?? 0).toFixed(0)}€`} className="fill-zinc-600 text-[11px] font-semibold" />
            </Bar>
          </BarChart>
        </ResponsiveContainer></SafeChart>
        <div className="mt-2 space-y-1">
          {dataTopValue.map((item) => (
            <button
              key={item.productId}
              type="button"
              onClick={() => openProductDetail(item.productId, item.name)}
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              Ver detalle: {item.name}
            </button>
          ))}
        </div>
      </Block>
    </div>
  );
}

