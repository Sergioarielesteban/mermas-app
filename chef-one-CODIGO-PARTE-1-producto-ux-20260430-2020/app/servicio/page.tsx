'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Plus, Settings2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import ServicioDishCard from '@/components/servicio/ServicioDishCard';
import { getServicioBundle } from '@/lib/servicio/mock-data';
import type { ServicioCourse } from '@/lib/servicio/types';
import { addDaysLocal, dateKeyLocal, parseDateKeyLocal } from '@/lib/servicio/date-key';
import { getSupabaseClient } from '@/lib/supabase-client';
import { canManageServicioOperaciones } from '@/lib/servicio/permissions';
import type { ServicioDbCategoria } from '@/lib/servicio/constants';
import {
  addPlatoToPlanDia,
  fetchAlergenosForPlatos,
  fetchPlanDiaRows,
  listPlatosActivosPick,
  planRowsToDisplayDishes,
  removePlatoFromPlanDia,
  type ServicioPlatoRow,
} from '@/lib/servicio/servicio-supabase';

const TABS: { id: ServicioCourse; label: string }[] = [
  { id: 'entrantes', label: 'Entrantes' },
  { id: 'principales', label: 'Principales' },
  { id: 'postres', label: 'Postres' },
];

function ServicioHomeInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const { localId, profileReady, profileRole } = useAuth();
  const canManage = canManageServicioOperaciones(profileRole);
  const supabase = useMemo(() => getSupabaseClient(), []);

  const qDate = sp.get('fecha');
  const day = useMemo(() => {
    const p = qDate ? parseDateKeyLocal(qDate) : null;
    return p ?? new Date();
  }, [qDate]);

  const dateKey = dateKeyLocal(day);
  const [tab, setTab] = useState<ServicioCourse>('entrantes');
  const [dbDishes, setDbDishes] = useState<ReturnType<typeof planRowsToDisplayDishes>>([]);
  const [usingMock, setUsingMock] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState<ServicioDbCategoria | null>(null);
  const [pickList, setPickList] = useState<ServicioPlatoRow[]>([]);
  const [pickPlatoId, setPickPlatoId] = useState('');
  const [pickRaciones, setPickRaciones] = useState(1);
  const [pickBusy, setPickBusy] = useState(false);

  const reloadDb = useCallback(async () => {
    if (!supabase || !localId) return;
    setLoadErr(null);
    const { plan, platos, error } = await fetchPlanDiaRows(supabase, localId, dateKey);
    if (error) {
      setLoadErr(error);
      setDbDishes([]);
      return;
    }
    const ids = [...platos.keys()];
    const alMap = await fetchAlergenosForPlatos(supabase, ids);
    setDbDishes(planRowsToDisplayDishes(plan, platos, alMap, tab));
  }, [supabase, localId, dateKey, tab]);

  useEffect(() => {
    if (!profileReady) return;
    if (!supabase || !localId) {
      setUsingMock(true);
      setDbDishes([]);
      return;
    }
    setUsingMock(false);
    void reloadDb();
  }, [profileReady, supabase, localId, dateKey, tab, reloadDb]);

  const mockFiltered = useMemo(() => {
    const bundle = getServicioBundle(dateKey);
    return bundle.dishes.filter((d) => d.course === tab);
  }, [dateKey, tab]);

  const filtered = usingMock || !supabase || !localId ? mockFiltered : dbDishes;

  const syncQuery = useCallback(
    (d: Date) => {
      const k = dateKeyLocal(d);
      router.replace(`/servicio?fecha=${k}`, { scroll: false });
    },
    [router],
  );

  const shiftDay = (delta: number) => {
    const n = addDaysLocal(day, delta);
    syncQuery(n);
  };

  const formatted = useMemo(
    () =>
      new Intl.DateTimeFormat('es', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
      }).format(day),
    [day],
  );

  const openPicker = async (cat: ServicioDbCategoria) => {
    if (!supabase || !localId) return;
    setPickerOpen(cat);
    setPickPlatoId('');
    setPickRaciones(1);
    const { plan } = await fetchPlanDiaRows(supabase, localId, dateKey);
    const inPlan = new Set(plan.map((p) => p.plato_id));
    const all = await listPlatosActivosPick(supabase, localId);
    setPickList(all.filter((p) => !inPlan.has(p.id)));
  };

  const confirmAddToPlan = async () => {
    if (!supabase || !localId || !pickerOpen || !pickPlatoId) return;
    setPickBusy(true);
    const pl = pickList.find((p) => p.id === pickPlatoId);
    const r = await addPlatoToPlanDia({
      supabase,
      localId,
      fecha: dateKey,
      platoId: pickPlatoId,
      categoria: pickerOpen,
      raciones: pickRaciones,
    });
    setPickBusy(false);
    if (!r.ok) {
      setLoadErr(r.message);
      return;
    }
    setPickerOpen(null);
    void reloadDb();
  };

  const removeFromDay = async (lineId: string) => {
    if (!supabase || !localId) return;
    if (!window.confirm('¿Quitar este plato del servicio del día?')) return;
    const r = await removePlatoFromPlanDia(supabase, localId, lineId);
    if (!r.ok) {
      setLoadErr(r.message);
      return;
    }
    void reloadDb();
  };

  return (
    <div className="mx-auto max-w-lg space-y-4 px-3 pb-28 pt-2 sm:px-4">
      {loadErr ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950 ring-1 ring-amber-200">{loadErr}</p>
      ) : null}
      {usingMock ? (
        <p className="rounded-xl bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-200">
          Modo sin base de datos: vista demo. Conecta Supabase y ejecuta la migración <code className="font-mono">supabase-servicio-module.sql</code>.
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2 rounded-2xl bg-zinc-50 px-3 py-3 ring-1 ring-zinc-200">
        <button
          type="button"
          onClick={() => shiftDay(-1)}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-zinc-700 ring-1 ring-zinc-200 active:scale-[0.98]"
          aria-label="Día anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 text-center">
          <p className="flex items-center justify-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-zinc-500">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            Servicio
          </p>
          <p className="mt-0.5 capitalize text-sm font-extrabold leading-tight text-zinc-900">{formatted}</p>
        </div>
        <button
          type="button"
          onClick={() => shiftDay(1)}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-zinc-700 ring-1 ring-zinc-200 active:scale-[0.98]"
          aria-label="Día siguiente"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {canManage ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/servicio/platos/nuevo"
            className="flex min-h-[52px] flex-1 items-center justify-center gap-2.5 rounded-2xl border-2 border-zinc-900 bg-white px-4 text-base font-extrabold uppercase tracking-wide text-zinc-900 shadow-md shadow-zinc-900/10 ring-1 ring-zinc-200/80 transition hover:bg-zinc-50 active:scale-[0.99]"
          >
            <Plus className="h-6 w-6 shrink-0 text-[#D32F2F]" strokeWidth={2.5} />
            Nuevo plato
          </Link>
          <Link
            href={`/servicio/produccion?fecha=${dateKey}`}
            className="flex min-h-[52px] flex-1 items-center justify-center gap-2.5 rounded-2xl bg-[#D32F2F] px-4 text-base font-extrabold uppercase tracking-wide text-white shadow-lg shadow-[#D32F2F]/35 ring-2 ring-[#D32F2F]/40 transition hover:brightness-105 active:scale-[0.99]"
          >
            <Settings2 className="h-6 w-6 shrink-0 opacity-95" strokeWidth={2.5} />
            Producción
          </Link>
        </div>
      ) : (
        <Link
          href={`/servicio/produccion?fecha=${dateKey}`}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#D32F2F] text-base font-extrabold text-white shadow-md active:scale-[0.99]"
        >
          <ClipboardList className="h-5 w-5" aria-hidden />
          Producción (mise en place)
        </Link>
      )}

      {canManage ? (
        <div className="grid grid-cols-3 gap-2">
          {(['entrante', 'principal', 'postre'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => void openPicker(c)}
              className="h-12 rounded-xl bg-white text-[10px] font-extrabold uppercase leading-tight text-[#B91C1C] ring-1 ring-zinc-200 active:scale-[0.99]"
            >
              + {c === 'entrante' ? 'Entrante' : c === 'principal' ? 'Principal' : 'Postre'}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex gap-1 rounded-2xl bg-zinc-100 p-1 ring-1 ring-zinc-200/80">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              'h-12 min-w-0 flex-1 rounded-xl text-xs font-extrabold uppercase tracking-wide transition',
              tab === t.id ? 'bg-white text-[#B91C1C] shadow-sm ring-1 ring-zinc-200' : 'text-zinc-600',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-2.5">
        {!usingMock && supabase && localId && !filtered.length ? (
          <p className="rounded-2xl bg-zinc-50 px-4 py-6 text-center text-sm font-semibold text-zinc-600 ring-1 ring-zinc-200">
            No hay platos en esta categoría para el día. Añade desde los botones de arriba o usa “Nuevo plato”.
          </p>
        ) : null}
        {filtered.map((dish, i) => (
          <div key={dish.planLineId ?? dish.id} className="space-y-1.5">
            <ServicioDishCard dish={dish} fecha={dateKey} priority={i === 0 && tab === 'entrantes'} />
            {canManage && dish.planLineId ? (
              <div className="flex flex-wrap gap-2 px-1">
                <button
                  type="button"
                  onClick={() => removeFromDay(dish.planLineId!)}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-extrabold text-rose-800"
                >
                  Quitar del día
                </button>
                <Link
                  href={`/servicio/platos/${dish.platoId}/editar`}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-extrabold text-zinc-800"
                >
                  Editar plato
                </Link>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {pickerOpen ? (
        <>
          <button
            type="button"
            aria-hidden
            className="fixed inset-0 z-[70] bg-black/40"
            onClick={() => setPickerOpen(null)}
          />
          <div className="fixed inset-x-3 bottom-8 z-[80] mx-auto max-w-md rounded-2xl bg-white p-4 shadow-xl ring-1 ring-zinc-200">
            <p className="text-sm font-extrabold text-zinc-900">Añadir al servicio</p>
            <p className="mt-1 text-xs text-zinc-500">Categoría en carta: {pickerOpen}</p>
            <label className="mt-3 block text-[11px] font-bold text-zinc-500">Plato</label>
            <select
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-semibold"
              value={pickPlatoId}
              onChange={(e) => {
                const id = e.target.value;
                setPickPlatoId(id);
                const p = pickList.find((x) => x.id === id);
                if (p) setPickRaciones(Math.max(1, p.raciones_base));
              }}
            >
              <option value="">— Elige —</option>
              {pickList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <label className="mt-3 block text-[11px] font-bold text-zinc-500">Raciones previstas</label>
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-semibold"
              value={pickRaciones}
              onChange={(e) => setPickRaciones(Math.max(1, Number(e.target.value) || 1))}
            />
            <div className="mt-4 flex gap-2">
              <button type="button" className="h-11 flex-1 rounded-xl border border-zinc-200 font-extrabold" onClick={() => setPickerOpen(null)}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={pickBusy || !pickPlatoId}
                className="h-11 flex-[2] rounded-xl bg-[#D32F2F] font-extrabold text-white disabled:opacity-50"
                onClick={() => void confirmAddToPlan()}
              >
                Añadir
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function ServicioPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-4 py-10 text-center text-sm font-medium text-zinc-500">Cargando servicio…</div>
      }
    >
      <ServicioHomeInner />
    </Suspense>
  );
}
