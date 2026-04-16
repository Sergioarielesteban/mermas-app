'use client';

import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, ChevronDown, FileDown, Plus, Search, Trash2, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useMermasStore } from '@/components/MermasStoreProvider';
import {
  createStaffMealWorker,
  createStaffMealRecord,
  deactivateStaffMealWorker,
  fetchStaffMealRecords,
  fetchStaffMealWorkers,
  isStaffMealOwnFood,
  STAFF_MEAL_OWN_PRODUCT_NAME,
  type StaffMealRecord,
  type StaffMealWorker,
  type StaffMealService,
  voidStaffMealRecord,
} from '@/lib/comida-personal-supabase';
import { requestDeleteSecurityPin } from '@/lib/delete-security';
import { downloadStaffMealReportPdf } from '@/lib/comida-personal-report-pdf';
import { formatLocalHeaderName } from '@/lib/local-display-name';
import { getSupabaseClient } from '@/lib/supabase-client';
import MermasStyleHero from '@/components/MermasStyleHero';

const SERVICE_LABEL: Record<StaffMealService, string> = {
  desayuno: 'Desayuno',
  comida: 'Comida',
  cena: 'Cena',
  snack: 'Snack',
  otro: 'Otro',
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
  const { products } = useMermasStore();
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [messageTone, setMessageTone] = React.useState<'error' | 'success'>('error');
  const [showComidaRegisteredBanner, setShowComidaRegisteredBanner] = React.useState(false);
  const comidaBannerTimerRef = React.useRef<number | null>(null);
  const [records, setRecords] = React.useState<StaffMealRecord[]>([]);
  const [workers, setWorkers] = React.useState<StaffMealWorker[]>([]);
  const [reportMonthYm, setReportMonthYm] = React.useState(() => ymFromDate(new Date()));
  const [mealDate, setMealDate] = React.useState(() => ymd(new Date()));
  const [workerId, setWorkerId] = React.useState('');
  const [newWorkerName, setNewWorkerName] = React.useState('');
  const [productPickerOpen, setProductPickerOpen] = React.useState(false);
  const [workerManageOpen, setWorkerManageOpen] = React.useState(false);
  const [pickerSearch, setPickerSearch] = React.useState('');
  const [qtyByProductId, setQtyByProductId] = React.useState<Record<string, number>>({});
  const [notes, setNotes] = React.useState('');
  const [ownMealQty, setOwnMealQty] = React.useState(0);
  const [recentRecordsOpen, setRecentRecordsOpen] = React.useState(false);
  const [statsUnlocked, setStatsUnlocked] = React.useState(false);

  const unlockStats = React.useCallback(async () => {
    const ok = await requestDeleteSecurityPin();
    if (ok) setStatsUnlocked(true);
  }, []);

  const loadData = React.useCallback(async () => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setLoading(true);
    setMessage(null);
    const today = new Date();
    const from = addDays(today, -460);
    try {
      const [rows, workerRows] = await Promise.all([
        fetchStaffMealRecords(supabase, localId, ymd(from), ymd(today)),
        fetchStaffMealWorkers(supabase, localId),
      ]);
      setRecords(rows);
      setWorkers(workerRows);
      setWorkerId((prev) => prev || workerRows[0]?.id || '');
    } catch (err) {
      setMessageTone('error');
      setMessage(err instanceof Error ? err.message : 'No se pudo cargar comida de personal.');
    } finally {
      setLoading(false);
    }
  }, [localId]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  React.useEffect(() => {
    return () => {
      if (comidaBannerTimerRef.current != null) {
        window.clearTimeout(comidaBannerTimerRef.current);
      }
    };
  }, []);

  const selectedWorker = workers.find((w) => w.id === workerId) ?? null;
  const pickerProducts = React.useMemo(() => {
    const s = pickerSearch.trim().toLowerCase();
    return products
      .filter((p) => (s ? p.name.toLowerCase().includes(s) : true))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
      .slice(0, 80);
  }, [pickerSearch, products]);

  React.useEffect(() => {
    if (productPickerOpen) setPickerSearch('');
  }, [productPickerOpen]);

  /** Teclado móvil (iOS/Android): espacio visible por encima del teclado para que el catálogo sea usable. */
  const [keyboardInsetPx, setKeyboardInsetPx] = React.useState(0);
  React.useEffect(() => {
    if (!productPickerOpen || typeof window === 'undefined') {
      setKeyboardInsetPx(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setKeyboardInsetPx(inset);
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      setKeyboardInsetPx(0);
    };
  }, [productPickerOpen]);
  const selectedLines = React.useMemo(
    () =>
      Object.entries(qtyByProductId)
        .map(([productId, quantity]) => {
          const product = products.find((p) => p.id === productId);
          if (!product || quantity <= 0) return null;
          return { product, quantity };
        })
        .filter((x): x is { product: (typeof products)[number]; quantity: number } => Boolean(x)),
    [products, qtyByProductId],
  );

  const setProductQty = React.useCallback((productId: string, qty: number) => {
    setQtyByProductId((prev) => {
      const next = Math.max(0, Math.floor(qty));
      if (next <= 0) {
        const clone = { ...prev };
        delete clone[productId];
        return clone;
      }
      return { ...prev, [productId]: next };
    });
  }, []);

  const [addFlashId, setAddFlashId] = React.useState<string | null>(null);
  const addFlashTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseProductAdded = React.useCallback((productId: string) => {
    setAddFlashId(productId);
    if (addFlashTimerRef.current) clearTimeout(addFlashTimerRef.current);
    addFlashTimerRef.current = setTimeout(() => {
      setAddFlashId((cur) => (cur === productId ? null : cur));
    }, 480);
  }, []);

  const addOneToBasket = React.useCallback(
    (productId: string) => {
      setQtyByProductId((prev) => {
        const next = (prev[productId] ?? 0) + 1;
        return { ...prev, [productId]: next };
      });
      pulseProductAdded(productId);
    },
    [pulseProductAdded],
  );

  const createWorker = React.useCallback(async () => {
    if (!localId) return;
    const name = newWorkerName.trim();
    if (!name) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    try {
      const w = await createStaffMealWorker(supabase, localId, name);
      setWorkers((prev) => [...prev, w].sort((a, b) => a.name.localeCompare(b.name, 'es')));
      setWorkerId(w.id);
      setNewWorkerName('');
      setMessageTone('success');
      setMessage('Trabajador creado.');
    } catch (err) {
      setMessageTone('error');
      setMessage(err instanceof Error ? err.message : 'No se pudo crear trabajador.');
    }
  }, [localId, newWorkerName]);

  const removeWorker = React.useCallback(
    async (w: StaffMealWorker) => {
      if (!localId) return;
      const okConfirm = window.confirm(
        `¿Quitar la ficha «${w.name}» de la lista?\n\nLos consumos ya guardados no se borran; solo deja de aparecer como opción.`,
      );
      if (!okConfirm) return;
      const okPin = await requestDeleteSecurityPin();
      if (!okPin) return;
      const supabase = getSupabaseClient();
      if (!supabase) return;
      try {
        await deactivateStaffMealWorker(supabase, localId, w.id);
        const next = workers.filter((x) => x.id !== w.id);
        setWorkers(next);
        setWorkerId((cur) => (cur === w.id ? next[0]?.id ?? '' : cur));
        setMessageTone('success');
        setMessage(`Ficha «${w.name}» eliminada de la lista.`);
      } catch (err) {
        setMessageTone('error');
        setMessage(err instanceof Error ? err.message : 'No se pudo quitar la ficha.');
      }
    },
    [localId, workers],
  );

  const registerConsumption = React.useCallback(async () => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!selectedWorker) {
      setMessageTone('error');
      setMessage('Selecciona trabajador.');
      return;
    }
    if (selectedLines.length === 0 && ownMealQty <= 0) {
      setMessageTone('error');
      setMessage('Añade un artículo, busca en el catálogo o pulsa «Trajo su comida».');
      return;
    }
    try {
      const consumptionGroupId = crypto.randomUUID();
      const payloads: Array<Promise<StaffMealRecord>> = [];
      for (const line of selectedLines) {
        payloads.push(
          createStaffMealRecord(supabase, localId, {
            service: 'comida',
            mealDate,
            peopleCount: line.quantity,
            unitCostEur: line.product.pricePerUnit,
            notes: notes.trim(),
            workerId: selectedWorker.id,
            workerName: selectedWorker.name,
            sourceProductId: line.product.id,
            sourceProductName: line.product.name,
            consumptionGroupId,
          }),
        );
      }
      if (ownMealQty > 0) {
        payloads.push(
          createStaffMealRecord(supabase, localId, {
            service: 'comida',
            mealDate,
            peopleCount: ownMealQty,
            unitCostEur: 0,
            notes: notes.trim(),
            workerId: selectedWorker.id,
            workerName: selectedWorker.name,
            sourceProductId: null,
            sourceProductName: STAFF_MEAL_OWN_PRODUCT_NAME,
            consumptionGroupId,
          }),
        );
      }
      const inserted = await Promise.all(payloads);
      setRecords((prev) => [...inserted, ...prev]);
      setQtyByProductId({});
      setOwnMealQty(0);
      setNotes('');
      setMessage(null);
      setShowComidaRegisteredBanner(true);
      if (comidaBannerTimerRef.current != null) window.clearTimeout(comidaBannerTimerRef.current);
      comidaBannerTimerRef.current = window.setTimeout(() => {
        setShowComidaRegisteredBanner(false);
        comidaBannerTimerRef.current = null;
      }, 1000);
    } catch (err) {
      setMessageTone('error');
      setMessage(err instanceof Error ? err.message : 'No se pudo registrar el consumo.');
    }
  }, [localId, mealDate, notes, ownMealQty, selectedLines, selectedWorker]);

  const voidOneRecord = React.useCallback(
    async (r: StaffMealRecord) => {
      if (!localId) return;
      const okPin = await requestDeleteSecurityPin();
      if (!okPin) return;
      const supabase = getSupabaseClient();
      if (!supabase) return;
      try {
        await voidStaffMealRecord(supabase, localId, r.id);
        const now = new Date().toISOString();
        setRecords((prev) => prev.map((x) => (x.id === r.id ? { ...x, voidedAt: now } : x)));
        setMessageTone('success');
        setMessage('Registro anulado (deja de contar en totales e informes).');
      } catch (err) {
        setMessageTone('error');
        setMessage(err instanceof Error ? err.message : 'No se pudo anular el registro.');
      }
    },
    [localId],
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
      setMessage('Informe listo. Revisa descargas.');
    } catch (err) {
      setMessageTone('error');
      setMessage(err instanceof Error ? err.message : 'No se pudo generar el informe.');
    }
  }, [displayName, email, localCode, localName, loginUsername, records, reportMonthYm]);

  const activeRecords = React.useMemo(() => records.filter((r) => r.voidedAt == null), [records]);
  const recentActiveRecords = React.useMemo(() => {
    return [...activeRecords].sort((a, b) => {
      if (b.mealDate !== a.mealDate) return b.mealDate.localeCompare(a.mealDate);
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [activeRecords]);
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
  const monthUnits = monthRecords.reduce((acc, r) => acc + r.peopleCount, 0);
  const monthTotal = monthRecords.reduce((acc, r) => acc + r.totalCostEur, 0);

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

  const monthWorkerRanking = React.useMemo(() => {
    const map = new Map<
      string,
      {
        rowKey: string;
        name: string;
        totalEur: number;
        units: number;
        groupIds: Set<string>;
        looseMeals: number;
        ownMealDates: Set<string>;
        ownMealRegs: number;
      }
    >();
    for (const r of monthRecords) {
      const rowKey = r.workerId ?? '__no_worker__';
      const name = r.workerName ?? 'Sin trabajador';
      const cur = map.get(rowKey) ?? {
        rowKey,
        name,
        totalEur: 0,
        units: 0,
        groupIds: new Set<string>(),
        looseMeals: 0,
        ownMealDates: new Set<string>(),
        ownMealRegs: 0,
      };
      cur.totalEur += r.totalCostEur;
      cur.units += r.peopleCount;
      if (isStaffMealOwnFood(r)) {
        cur.ownMealRegs += 1;
        cur.ownMealDates.add(r.mealDate);
      }
      if (r.consumptionGroupId) cur.groupIds.add(r.consumptionGroupId);
      else cur.looseMeals += 1;
      map.set(rowKey, cur);
    }
    return Array.from(map.values())
      .map((v) => ({
        rowKey: v.rowKey,
        name: v.name,
        totalEur: v.totalEur,
        units: v.units,
        mealsRegistered: v.groupIds.size + v.looseMeals,
        ownMealDays: v.ownMealDates.size,
        ownMealRegs: v.ownMealRegs,
      }))
      .sort((a, b) => b.totalEur - a.totalEur);
  }, [monthRecords]);

  const topConsumedProducts = React.useMemo(() => {
    const map = new Map<string, { productId: string | null; label: string; units: number }>();
    for (const r of activeRecords) {
      const pid = r.sourceProductId;
      const label = r.sourceProductName?.trim();
      if (!pid && !label) continue;
      const key = pid ?? `name:${label}`;
      const cur = map.get(key) ?? { productId: pid, label: label ?? 'Artículo', units: 0 };
      cur.units += r.peopleCount;
      if (label) cur.label = label;
      map.set(key, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => b.units - a.units)
      .slice(0, 20)
      .map((row) => {
        const catalog =
          (row.productId ? products.find((p) => p.id === row.productId) : undefined) ??
          products.find((p) => p.name.trim().toLowerCase() === row.label.trim().toLowerCase());
        return { ...row, addableId: catalog?.id ?? null };
      });
  }, [activeRecords, products]);

  return (
    <div className="space-y-4">
      {showComidaRegisteredBanner ? (
        <div className="pointer-events-none fixed inset-0 z-[92] grid place-items-center bg-black/25 px-6">
          <div className="saved-banner-pop rounded-2xl bg-[#D32F2F] px-7 py-5 text-center shadow-2xl ring-2 ring-white/75">
            <p className="text-xl font-black tracking-wide text-white">Comida registrada</p>
          </div>
        </div>
      ) : null}
      <MermasStyleHero
        eyebrow="Comida de personal"
        title="Registro de consumo"
        description="Aquí solo ves el artículo y la cantidad. Importes e informes están en Estadísticas (clave de gestión)."
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {loading ? <span className="text-xs text-zinc-500">Cargando datos…</span> : null}
        <button
          type="button"
          onClick={() => void loadData()}
          className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-bold text-[#D32F2F] shadow-sm"
        >
          Actualizar
        </button>
      </div>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <div className="flex w-full flex-col items-center">
          <label className="text-center text-xs font-semibold uppercase tracking-wide text-zinc-700">Fecha</label>
          <input
            type="date"
            value={mealDate}
            onChange={(e) => setMealDate(e.target.value)}
            className="mt-2 box-border h-11 w-full max-w-[17.5rem] rounded-xl border-2 border-black bg-zinc-950 px-3 text-center text-sm font-semibold text-white shadow-[inset_0_0_0_1px_rgba(211,47,47,0.85)] outline-none [color-scheme:dark] focus:border-[#D32F2F] focus:shadow-[inset_0_0_0_2px_#D32F2F]"
          />
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Trabajador</p>
        <select
          value={workerId}
          onChange={(e) => setWorkerId(e.target.value)}
          className="mt-2 h-12 min-h-[3rem] w-full rounded-xl border border-zinc-300 bg-white px-3 text-base font-medium text-zinc-900 outline-none focus:border-[#D32F2F]/60"
        >
          <option value="">Selecciona trabajador</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <input
          value={newWorkerName}
          onChange={(e) => setNewWorkerName(e.target.value)}
          placeholder="Nombre del trabajador"
          className="mt-2 h-12 w-full rounded-xl border border-zinc-300 bg-white px-3 text-base text-zinc-900 outline-none focus:border-[#D32F2F]/60"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void createWorker();
            }
          }}
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void createWorker()}
            className="h-11 rounded-xl border border-zinc-300 bg-white px-2 text-xs font-bold text-zinc-800 sm:text-sm"
          >
            Crear trabajador
          </button>
          <button
            type="button"
            onClick={() => setWorkerManageOpen(true)}
            className="h-11 rounded-xl border border-red-200 bg-white px-2 text-xs font-bold text-red-800 hover:bg-red-50 sm:text-sm"
          >
            Borrar trabajador
          </button>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Atajos frecuentes</p>
        <p className="mt-1 text-xs text-zinc-500">Pulsa + para añadir el artículo al consumo de hoy.</p>
        {topConsumedProducts.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Cuando haya registros con artículo, aparecerán aquí como atajos.</p>
        ) : (
          <ul className="mt-2 grid grid-cols-2 gap-x-1 gap-y-1 sm:gap-x-2">
            {topConsumedProducts.map((row, idx) => {
              const canAdd = Boolean(row.addableId);
              return (
                <li
                  key={`${row.addableId ?? row.label}-${idx}`}
                  className={`flex min-h-0 items-center gap-1.5 rounded-lg px-1.5 py-1 ring-1 transition-colors duration-300 ${
                    row.addableId && addFlashId === row.addableId
                      ? 'bg-emerald-50 ring-emerald-400/80'
                      : 'bg-zinc-50 ring-zinc-200'
                  }`}
                >
                  <span className="w-4 shrink-0 text-center text-[10px] font-black text-zinc-400">{idx + 1}</span>
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-[11px] font-semibold text-zinc-900">{row.label}</p>
                  </div>
                  <button
                    type="button"
                    disabled={!canAdd}
                    title={canAdd ? 'Añadir 1 al consumo' : 'No enlazado al catálogo actual'}
                    onClick={() => row.addableId && addOneToBasket(row.addableId)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#D32F2F] text-white shadow-sm disabled:cursor-not-allowed disabled:bg-zinc-300"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <button
          type="button"
          onClick={() => setProductPickerOpen(true)}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-[#D32F2F] bg-white text-sm font-bold text-zinc-900 shadow-sm outline-none transition hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-[#D32F2F]/40"
        >
          <Search className="h-4 w-4 shrink-0 text-[#D32F2F]" aria-hidden />
          Buscar otro artículo
        </button>
        <button
          type="button"
          onClick={() => setOwnMealQty((q) => q + 1)}
          className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-zinc-50 text-sm font-bold text-zinc-800 shadow-sm outline-none transition hover:bg-white focus-visible:ring-2 focus-visible:ring-[#D32F2F]/30"
        >
          Trajo su comida
        </button>
        <p className="mt-1.5 text-center text-[10px] leading-snug text-zinc-500">
          Queda en el historial como «{STAFF_MEAL_OWN_PRODUCT_NAME}». Pulsa Registrar cuando termines.
        </p>
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Consumo seleccionado</p>
        {selectedLines.length === 0 && ownMealQty <= 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Aún no hay nada para registrar.</p>
        ) : (
          <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50/90">
            <ul className="divide-y divide-zinc-200/90">
              {selectedLines.map((line) => (
                <li
                  key={line.product.id}
                  className={`flex items-center gap-2 px-2 py-1.5 transition-colors ${
                    addFlashId === line.product.id ? 'bg-emerald-50' : ''
                  }`}
                >
                  <p className="min-w-0 flex-1 truncate text-[11px] font-semibold leading-tight text-zinc-800">{line.product.name}</p>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => setProductQty(line.product.id, line.quantity - 1)}
                      className="grid h-7 w-7 place-items-center rounded-full border border-zinc-200 bg-white text-sm font-semibold text-zinc-500"
                    >
                      {'\u2212'}
                    </button>
                    <span className="w-6 text-center text-[11px] font-black text-zinc-900">{line.quantity}</span>
                    <button
                      type="button"
                      onClick={() => addOneToBasket(line.product.id)}
                      className="grid h-7 w-7 place-items-center rounded-full bg-[#D32F2F] text-sm font-semibold text-white"
                    >
                      +
                    </button>
                  </div>
                </li>
              ))}
              {ownMealQty > 0 ? (
                <li className="flex items-center gap-2 px-2 py-1.5">
                  <p className="min-w-0 flex-1 truncate text-[11px] font-semibold leading-tight text-zinc-800">
                    {STAFF_MEAL_OWN_PRODUCT_NAME}
                    <span className="mt-0.5 block text-[10px] font-normal text-zinc-500">Traída de casa</span>
                  </p>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => setOwnMealQty((q) => Math.max(0, q - 1))}
                      className="grid h-7 w-7 place-items-center rounded-full border border-zinc-200 bg-white text-sm font-semibold text-zinc-500"
                    >
                      {'\u2212'}
                    </button>
                    <span className="w-6 text-center text-[11px] font-black text-zinc-900">{ownMealQty}</span>
                    <button
                      type="button"
                      onClick={() => setOwnMealQty((q) => q + 1)}
                      className="grid h-7 w-7 place-items-center rounded-full bg-[#D32F2F] text-sm font-semibold text-white"
                    >
                      +
                    </button>
                  </div>
                </li>
              ) : null}
            </ul>
          </div>
        )}
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Nota (opcional)"
          className="mt-2 h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none"
        />
        <button
          type="button"
          onClick={() => void registerConsumption()}
          className="mt-2 h-11 w-full rounded-xl bg-[#D32F2F] text-sm font-bold text-white"
        >
          Registrar consumo
        </button>
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

      <section className="rounded-2xl border border-zinc-200/90 bg-gradient-to-b from-zinc-50 to-white p-4 ring-1 ring-zinc-100">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-200/80 text-zinc-700">
            <BarChart3 className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-zinc-900">Estadísticas</p>
            <p className="mt-1 text-xs leading-snug text-zinc-600">
              Importes en €, informe PDF, resúmenes y anular registros. Misma clave de seguridad que otros borrados.
            </p>
          </div>
        </div>

        {!statsUnlocked ? (
          <button
            type="button"
            onClick={() => void unlockStats()}
            className="mt-4 h-11 w-full rounded-xl bg-zinc-900 text-sm font-bold text-white shadow-sm ring-1 ring-black/10 hover:bg-zinc-800"
          >
            Introducir clave para ver estadísticas
          </button>
        ) : (
          <div className="mt-4 space-y-4 border-t border-zinc-200/80 pt-4">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setStatsUnlocked(false);
                  setRecentRecordsOpen(false);
                }}
                className="text-xs font-bold text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800"
              >
                Ocultar estadísticas
              </button>
            </div>

            <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
              <p className="text-center text-sm font-bold text-zinc-800">Informe mensual</p>
              <div className="mt-3 flex flex-col items-center">
                <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Mes del informe</label>
                <input
                  type="month"
                  value={reportMonthYm}
                  onChange={(e) => setReportMonthYm(e.target.value)}
                  className="mt-1.5 box-border h-9 w-full max-w-[11.5rem] rounded-lg border border-zinc-300 bg-white px-2 text-center text-sm text-zinc-900 outline-none focus:border-[#D32F2F]/50"
                />
              </div>
              <button
                type="button"
                onClick={exportMonthPdf}
                className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-3 text-sm font-bold text-white shadow-[inset_0_0_0_1px_rgba(211,47,47,0.85)] outline-none ring-1 ring-black/10 hover:bg-zinc-900 focus-visible:ring-2 focus-visible:ring-[#D32F2F]/50"
              >
                <FileDown className="h-4 w-4 shrink-0" aria-hidden />
                Descargar informe
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
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Uds mes</p>
                <p className="mt-1 text-lg font-black text-zinc-900">{monthUnits.toLocaleString('es-ES')}</p>
              </div>
            </section>

            <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
              <p className="text-sm font-bold text-zinc-800">Mes actual — por trabajador</p>
              {monthWorkerRanking.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">Sin datos en el mes.</p>
              ) : (
                <ol className="mt-3 space-y-2">
                  {monthWorkerRanking.map((row, idx) => (
                    <li
                      key={row.rowKey}
                      className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black ${
                            idx === 0
                              ? 'bg-amber-100 text-amber-900'
                              : idx === 1
                                ? 'bg-zinc-200 text-zinc-800'
                                : idx === 2
                                  ? 'bg-orange-100 text-orange-900'
                                  : 'bg-white text-zinc-500 ring-1 ring-zinc-200'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-zinc-900">{row.name}</p>
                          <p className="text-xs text-zinc-500">
                            {row.mealsRegistered}{' '}
                            {row.mealsRegistered === 1 ? 'comida registrada' : 'comidas registradas'}
                            {row.ownMealRegs > 0 ? (
                              <>
                                {' '}
                                · Trajo su comida:{' '}
                                {row.ownMealRegs === row.ownMealDays
                                  ? `${row.ownMealDays} día${row.ownMealDays === 1 ? '' : 's'}`
                                  : `${row.ownMealDays} día${row.ownMealDays === 1 ? '' : 's'} (${row.ownMealRegs} reg.)`}
                              </>
                            ) : null}
                          </p>
                        </div>
                      </div>
                      <p className="shrink-0 text-sm font-black text-zinc-900">{money(row.totalEur)}</p>
                    </li>
                  ))}
                </ol>
              )}
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

            <div className="rounded-xl border border-zinc-200/90 bg-zinc-50/60 p-2 ring-1 ring-zinc-100">
              <button
                type="button"
                onClick={() => setRecentRecordsOpen((o) => !o)}
                aria-expanded={recentRecordsOpen}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#D32F2F]/30"
              >
                <span className="text-[11px] font-medium text-zinc-500">
                  Anular registros
                  <span className="font-normal text-zinc-400"> · {recentActiveRecords.length} activos</span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${recentRecordsOpen ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </button>
              {recentRecordsOpen ? (
                <div className="mt-1 border-t border-zinc-200/80 pt-2">
                  <p className="px-1 pb-1 text-[10px] leading-snug text-zinc-400">
                    La papelera pide la clave otra vez; el registro deja de contar en totales e informes.
                  </p>
                  {recentActiveRecords.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-zinc-400">Sin registros en el periodo cargado.</p>
                  ) : (
                    <ul className="max-h-52 divide-y divide-zinc-200/90 overflow-y-auto rounded-md border border-zinc-200/80 bg-white/80">
                      {recentActiveRecords.map((r) => {
                        const title =
                          r.sourceProductName?.trim() ||
                          (r.workerName ? `${SERVICE_LABEL[r.service]} · ${r.workerName}` : SERVICE_LABEL[r.service]);
                        const sub =
                          r.sourceProductName && r.workerName
                            ? `${SERVICE_LABEL[r.service]} · ${r.workerName}`
                            : r.notes.trim() || null;
                        const dateLabel = (() => {
                          try {
                            return new Date(`${r.mealDate}T12:00:00`).toLocaleDateString('es-ES', {
                              day: '2-digit',
                              month: 'short',
                            });
                          } catch {
                            return r.mealDate;
                          }
                        })();
                        return (
                          <li key={r.id} className="flex items-center gap-2 px-2 py-1.5">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[11px] font-semibold text-zinc-900">{title}</p>
                              <p className="truncate text-[10px] text-zinc-500">
                                {dateLabel}
                                {sub ? ` · ${sub}` : ''}
                              </p>
                            </div>
                            <span className="shrink-0 text-[11px] font-bold tabular-nums text-zinc-800">
                              {money(r.totalCostEur)}
                            </span>
                            <button
                              type="button"
                              onClick={() => void voidOneRecord(r)}
                              className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-zinc-200 bg-white text-zinc-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                              title="Anular registro"
                              aria-label={`Anular registro del ${r.mealDate}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </section>

      {workerManageOpen ? (
        <div
          className="fixed inset-0 z-[101] flex flex-col sm:items-center sm:justify-center sm:bg-black/45 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Quitar fichas de trabajador"
        >
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 hidden bg-black/45 sm:block"
            onClick={() => setWorkerManageOpen(false)}
          />
          <div className="relative z-[1] flex min-h-0 w-full max-w-lg flex-1 flex-col overflow-hidden bg-white shadow-2xl ring-zinc-200 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none max-sm:pt-[env(safe-area-inset-top,0px)] sm:max-h-[min(85vh,44rem)] sm:flex-none sm:rounded-3xl sm:ring-1">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
              <p className="text-sm font-black text-zinc-900">Quitar fichas</p>
              <button
                type="button"
                onClick={() => setWorkerManageOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-700"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="shrink-0 px-4 pt-2 text-xs leading-snug text-zinc-500">
              Pulsa la papelera y confirma con tu PIN. Los consumos ya guardados no se borran.
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
              {workers.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-500">No hay fichas creadas.</p>
              ) : (
                <ul className="space-y-2">
                  {workers.map((w) => (
                    <li
                      key={w.id}
                      className="flex items-center justify-between gap-2 rounded-xl bg-zinc-50 px-3 py-2.5 ring-1 ring-zinc-200"
                    >
                      <span className="min-w-0 truncate text-sm font-semibold text-zinc-900">{w.name}</span>
                      <button
                        type="button"
                        onClick={() => void removeWorker(w)}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                        aria-label={`Quitar ficha ${w.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {productPickerOpen ? (
        <div
          className="fixed inset-0 z-[100] flex flex-col sm:items-center sm:justify-center sm:bg-black/45 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Buscar artículo"
        >
          <button
            type="button"
            aria-label="Cerrar buscador"
            className="absolute inset-0 hidden bg-black/45 sm:block"
            onClick={() => setProductPickerOpen(false)}
          />
          <div className="relative z-[1] flex min-h-0 w-full max-w-lg flex-1 flex-col overflow-hidden bg-white shadow-2xl ring-zinc-200 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none max-sm:pt-[env(safe-area-inset-top,0px)] sm:max-h-[min(85vh,44rem)] sm:flex-none sm:rounded-3xl sm:ring-1">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
              <p className="text-sm font-black text-zinc-900">Buscar artículo</p>
              <button
                type="button"
                onClick={() => setProductPickerOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-700"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="shrink-0 px-4 pt-3">
              <div className="flex items-center gap-2 rounded-xl border border-zinc-300 bg-zinc-50 px-3 ring-1 ring-zinc-200">
                <Search className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                <input
                  autoFocus
                  enterKeyHint="search"
                  autoComplete="off"
                  autoCorrect="off"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="Escribe para filtrar…"
                  className="h-11 min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-900 outline-none placeholder:text-zinc-400"
                />
              </div>
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3"
              style={
                keyboardInsetPx > 0
                  ? { paddingBottom: `${keyboardInsetPx + 12}px` }
                  : undefined
              }
            >
              {pickerProducts.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-500">Sin coincidencias.</p>
              ) : (
                <ul className="space-y-2">
                  {pickerProducts.map((p) => (
                    <li key={p.id}>
                      <div
                        className={`flex items-center justify-between gap-2 rounded-xl p-2.5 ring-1 transition-colors duration-300 ${
                          addFlashId === p.id
                            ? 'bg-emerald-50 ring-emerald-400/80'
                            : 'bg-zinc-50 ring-zinc-200'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <p className="truncate text-sm font-semibold text-zinc-900">{p.name}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => addOneToBasket(p.id)}
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#D32F2F] text-white shadow-sm"
                          aria-label={`Añadir ${p.name}`}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
