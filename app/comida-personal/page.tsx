'use client';

import React from 'react';
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
import { FileDown } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import {
  createStaffMealRecord,
  fetchStaffMealRecords,
  type StaffMealRecord,
  type StaffMealService,
} from '@/lib/comida-personal-supabase';
import { downloadStaffMealReportPdf } from '@/lib/comida-personal-report-pdf';
import { formatLocalHeaderName } from '@/lib/local-display-name';
import { getSupabaseClient } from '@/lib/supabase-client';

const QUICK_ACTIONS: Array<{ label: string; service: StaffMealService; unitCostEur: number }> = [
  { label: '+1 Desayuno', service: 'desayuno', unitCostEur: 2.2 },
  { label: '+1 Comida', service: 'comida', unitCostEur: 2.8 },
  { label: '+1 Cena', service: 'cena', unitCostEur: 2.8 },
  { label: '+1 Snack', service: 'snack', unitCostEur: 1.5 },
];

const SERVICE_LABEL: Record<StaffMealService, string> = {
  desayuno: 'Desayuno',
  comida: 'Comida',
  cena: 'Cena',
  snack: 'Snack',
  otro: 'Otro',
};

const SERVICE_COLORS: Record<StaffMealService, string> = {
  desayuno: '#0EA5E9',
  comida: '#22C55E',
  cena: '#6366F1',
  snack: '#F59E0B',
  otro: '#A3A3A3',
};

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfWeekMonday(d: Date) {
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = base.getDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  base.setDate(base.getDate() + delta);
  return base;
}

function addDays(d: Date, n: number) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

function money(v: number) {
  return `${(Math.round(v * 100) / 100).toFixed(2)} €`;
}

function ymFromDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function ComidaPersonalPage() {
  const { localId, localName, localCode, displayName, loginUsername, email } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [messageTone, setMessageTone] = React.useState<'error' | 'success'>('error');
  const [records, setRecords] = React.useState<StaffMealRecord[]>([]);
  const [reportMonthYm, setReportMonthYm] = React.useState(() => ymFromDate(new Date()));
  const [mealDate, setMealDate] = React.useState(() => ymd(new Date()));
  const [service, setService] = React.useState<StaffMealService>('comida');
  const [peopleCount, setPeopleCount] = React.useState('1');
  const [unitCostEur, setUnitCostEur] = React.useState('2.80');
  const [notes, setNotes] = React.useState('');

  const loadRecords = React.useCallback(async () => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setLoading(true);
    setMessage(null);
    const today = new Date();
    const from = addDays(today, -460);
    try {
      const rows = await fetchStaffMealRecords(supabase, localId, ymd(from), ymd(today));
      setRecords(rows);
    } catch (err) {
      setMessageTone('error');
      setMessage(err instanceof Error ? err.message : 'No se pudo cargar comida de personal.');
    } finally {
      setLoading(false);
    }
  }, [localId]);

  React.useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const addRecord = React.useCallback(
    async (input: { service: StaffMealService; peopleCount: number; unitCostEur: number; notes?: string }) => {
      if (!localId) return;
      const supabase = getSupabaseClient();
      if (!supabase) return;
      try {
        const inserted = await createStaffMealRecord(supabase, localId, {
          service: input.service,
          mealDate,
          peopleCount: input.peopleCount,
          unitCostEur: input.unitCostEur,
          notes: input.notes,
        });
        setRecords((prev) => [inserted, ...prev]);
        setMessageTone('success');
        setMessage('Registro guardado.');
      } catch (err) {
        setMessageTone('error');
        setMessage(err instanceof Error ? err.message : 'No se pudo guardar el registro.');
      }
    },
    [localId, mealDate],
  );

  const exportMonthPdf = React.useCallback(() => {
    const localLabel =
      formatLocalHeaderName(localName ?? localCode) ?? localName ?? localCode ?? 'Local';
    const generatedBy =
      displayName?.trim() || loginUsername?.trim() || email?.trim() || undefined;
    try {
      downloadStaffMealReportPdf({
        localLabel,
        monthYm: reportMonthYm,
        records,
        generatedByLabel: generatedBy,
      });
      setMessageTone('success');
      setMessage('PDF listo. Revisa descargas.');
    } catch (err) {
      setMessageTone('error');
      setMessage(err instanceof Error ? err.message : 'No se pudo generar el PDF.');
    }
  }, [displayName, email, localCode, localName, loginUsername, records, reportMonthYm]);

  const activeRecords = React.useMemo(() => records.filter((r) => r.voidedAt == null), [records]);
  const todayYmd = React.useMemo(() => ymd(new Date()), []);
  const todayDate = React.useMemo(() => new Date(`${todayYmd}T00:00:00`), [todayYmd]);
  const weekStart = startOfWeekMonday(todayDate);
  const monthStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
  const todayTotal = activeRecords
    .filter((r) => r.mealDate === todayYmd)
    .reduce((acc, r) => acc + r.totalCostEur, 0);
  const weekTotal = activeRecords
    .filter((r) => {
      const dt = new Date(`${r.mealDate}T00:00:00`);
      return dt >= weekStart && dt <= todayDate;
    })
    .reduce((acc, r) => acc + r.totalCostEur, 0);
  const monthRecords = activeRecords.filter((r) => {
    const dt = new Date(`${r.mealDate}T00:00:00`);
    return dt >= monthStart && dt <= todayDate;
  });
  const monthTotal = monthRecords.reduce((acc, r) => acc + r.totalCostEur, 0);
  const monthPeople = monthRecords.reduce((acc, r) => acc + r.peopleCount, 0);
  const monthAvgPerPerson = monthPeople > 0 ? monthTotal / monthPeople : 0;

  const last14DaysChart = React.useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => addDays(todayDate, -13 + i));
    return days.map((d) => {
      const key = ymd(d);
      const total = activeRecords.filter((r) => r.mealDate === key).reduce((acc, r) => acc + r.totalCostEur, 0);
      return {
        day: d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }),
        total: Math.round(total * 100) / 100,
      };
    });
  }, [activeRecords, todayDate]);

  const monthByService = React.useMemo(() => {
    const map = new Map<StaffMealService, number>();
    for (const row of monthRecords) {
      map.set(row.service, (map.get(row.service) ?? 0) + row.totalCostEur);
    }
    return (Object.keys(SERVICE_LABEL) as StaffMealService[])
      .map((k) => ({ service: SERVICE_LABEL[k], value: Math.round((map.get(k) ?? 0) * 100) / 100, color: SERVICE_COLORS[k] }))
      .filter((x) => x.value > 0);
  }, [monthRecords]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-sm font-black text-zinc-900">Comida de personal</p>
        <p className="mt-1 text-xs text-zinc-500">Registro en segundos para imputar consumo interno a coste de personal.</p>
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Fecha</label>
        <input
          type="date"
          value={mealDate}
          onChange={(e) => setMealDate(e.target.value)}
          className="mt-2 h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none"
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          {QUICK_ACTIONS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => void addRecord({ service: item.service, peopleCount: 1, unitCostEur: item.unitCostEur })}
              className="h-11 rounded-xl bg-[#D32F2F] px-3 text-sm font-bold text-white"
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Registro manual rápido</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <select
            value={service}
            onChange={(e) => setService(e.target.value as StaffMealService)}
            className="h-11 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none"
          >
            {(Object.keys(SERVICE_LABEL) as StaffMealService[]).map((s) => (
              <option key={s} value={s}>
                {SERVICE_LABEL[s]}
              </option>
            ))}
          </select>
          <input
            value={peopleCount}
            onChange={(e) => setPeopleCount(e.target.value)}
            inputMode="decimal"
            placeholder="Personas"
            className="h-11 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none"
          />
          <input
            value={unitCostEur}
            onChange={(e) => setUnitCostEur(e.target.value)}
            inputMode="decimal"
            placeholder="€/persona"
            className="h-11 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none"
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Nota (opcional)"
            className="h-11 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() =>
            void addRecord({
              service,
              peopleCount: Math.max(0, Number(peopleCount.replace(',', '.')) || 0),
              unitCostEur: Math.max(0, Number(unitCostEur.replace(',', '.')) || 0),
              notes,
            })
          }
          className="mt-2 h-11 w-full rounded-xl border border-zinc-300 bg-white text-sm font-bold text-zinc-800"
        >
          Registrar
        </button>
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-sm font-bold text-zinc-800">Informe mensual PDF</p>
        <p className="mt-1 text-xs text-zinc-500">
          Documento para dirección: KPIs del mes elegido, comparativa frente al mes anterior (tabla + gráficas), reparto por servicio,
          evolución diaria, detalle completo y anexo con el detalle del mes previo si hay datos. Solo PDF.
        </p>
        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Mes del informe</label>
        <input
          type="month"
          value={reportMonthYm}
          onChange={(e) => setReportMonthYm(e.target.value)}
          className="mt-2 h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none"
        />
        <button
          type="button"
          onClick={exportMonthPdf}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-3 text-sm font-bold text-white shadow-[inset_0_0_0_1px_rgba(211,47,47,0.85)] outline-none ring-1 ring-black/10 hover:bg-zinc-900 focus-visible:ring-2 focus-visible:ring-[#D32F2F]/50"
        >
          <FileDown className="h-4 w-4 shrink-0" aria-hidden />
          Descargar PDF del mes
        </button>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-white p-3 ring-1 ring-zinc-200">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Hoy</p>
          <p className="mt-1 text-lg font-black text-zinc-900">{money(todayTotal)}</p>
        </div>
        <div className="rounded-2xl bg-white p-3 ring-1 ring-zinc-200">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Semana</p>
          <p className="mt-1 text-lg font-black text-zinc-900">{money(weekTotal)}</p>
        </div>
        <div className="rounded-2xl bg-white p-3 ring-1 ring-zinc-200">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Mes</p>
          <p className="mt-1 text-lg font-black text-zinc-900">{money(monthTotal)}</p>
        </div>
        <div className="rounded-2xl bg-white p-3 ring-1 ring-zinc-200">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">€/persona mes</p>
          <p className="mt-1 text-lg font-black text-zinc-900">{money(monthAvgPerPerson)}</p>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-sm font-bold text-zinc-800">Evolución 14 días (€)</p>
        <div className="mt-2 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={last14DaysChart} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value) => money(Number(value ?? 0))} />
              <Bar dataKey="total" fill="#D32F2F" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-sm font-bold text-zinc-800">Reparto mensual por servicio</p>
        <div className="mt-2 h-56">
          {monthByService.length === 0 ? (
            <p className="pt-16 text-center text-sm text-zinc-500">Sin datos en el mes actual.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={monthByService} dataKey="value" nameKey="service" outerRadius={84}>
                  {monthByService.map((entry) => (
                    <Cell key={entry.service} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => money(Number(value ?? 0))} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-zinc-800">Últimos registros</p>
          <button
            type="button"
            onClick={() => void loadRecords()}
            className="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700"
          >
            Actualizar
          </button>
        </div>
        {loading ? <p className="mt-2 text-xs text-zinc-500">Cargando...</p> : null}
        <div className="mt-2 space-y-2">
          {activeRecords.slice(0, 10).map((row) => (
            <div key={row.id} className="rounded-xl bg-zinc-50 p-2 ring-1 ring-zinc-200">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-zinc-800">
                  {SERVICE_LABEL[row.service]} · {row.peopleCount} pers.
                </p>
                <p className="text-sm font-bold text-zinc-900">{money(row.totalCostEur)}</p>
              </div>
              <p className="mt-0.5 text-xs text-zinc-500">
                {new Date(`${row.mealDate}T00:00:00`).toLocaleDateString('es-ES')} · {money(row.unitCostEur)} por persona
              </p>
            </div>
          ))}
          {activeRecords.length === 0 ? <p className="text-sm text-zinc-500">Todavía no hay registros.</p> : null}
        </div>
        {message ? (
          <p
            className={
              messageTone === 'success' ? 'mt-2 text-sm font-semibold text-emerald-800' : 'mt-2 text-sm text-[#B91C1C]'
            }
          >
            {message}
          </p>
        ) : null}
      </section>
    </div>
  );
}
