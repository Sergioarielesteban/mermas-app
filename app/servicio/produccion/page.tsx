'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import ServicioProductionOrder from '@/components/servicio/ServicioProductionOrder';
import { estimateServiceMinutes, getServicioBundle } from '@/lib/servicio/mock-data';
import { dateKeyLocal, parseDateKeyLocal } from '@/lib/servicio/date-key';
import { getSupabaseClient } from '@/lib/supabase-client';
import { useAuth } from '@/components/AuthProvider';
import { canManageServicioOperaciones } from '@/lib/servicio/permissions';
import {
  deleteProduccionTask,
  estimateMinutesFromPlan,
  fetchPlanDiaRows,
  fetchProduccionDia,
  generateProduccionFromPlan,
  insertProduccionTask,
  updateProduccionTask,
  type ServicioProduccionRow,
} from '@/lib/servicio/servicio-supabase';

function ProduccionInner() {
  const sp = useSearchParams();
  const { localId, profileReady, profileRole } = useAuth();
  const canManage = canManageServicioOperaciones(profileRole);
  const supabase = useMemo(() => getSupabaseClient(), []);

  const q = sp.get('fecha');
  const dateKey = useMemo(() => {
    const p = q ? parseDateKeyLocal(q) : null;
    return p ? dateKeyLocal(p) : dateKeyLocal(new Date());
  }, [q]);

  const [tasks, setTasks] = useState<ServicioProduccionRow[]>([]);
  const [usingMock, setUsingMock] = useState(false);
  const [totalRaciones, setTotalRaciones] = useState(0);
  const [nPlatos, setNPlatos] = useState(0);
  const [tiempo, setTiempo] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);

  const [nuevaTarea, setNuevaTarea] = useState('');
  const [nuevaCant, setNuevaCant] = useState('');
  const [nuevaUnid, setNuevaUnid] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!supabase || !localId) {
      setUsingMock(true);
      const bundle = getServicioBundle(dateKey);
      setTotalRaciones(bundle.dishes.reduce((a, d) => a + d.portions, 0));
      setNPlatos(bundle.dishes.length);
      setTiempo(estimateServiceMinutes(bundle.dishes));
      setTasks(
        bundle.mise.map((m) => ({
          id: m.id,
          local_id: '',
          fecha: dateKey,
          texto_tarea: m.text,
          cantidad: null,
          unidad: m.qty,
          completado: false,
          orden: 0,
          origen: 'manual',
        })),
      );
      return;
    }
    setUsingMock(false);
    const { plan, platos } = await fetchPlanDiaRows(supabase, localId, dateKey);
    const tr = plan.reduce((a, l) => a + l.raciones_previstas, 0);
    setTotalRaciones(tr);
    setNPlatos(plan.length);
    setTiempo(estimateMinutesFromPlan(platos, plan));
    const prod = await fetchProduccionDia(supabase, localId, dateKey);
    setTasks(prod);
  }, [supabase, localId, dateKey]);

  useEffect(() => {
    if (!profileReady) return;
    void reload();
  }, [profileReady, reload]);

  const toggle = async (row: ServicioProduccionRow) => {
    if (!supabase || !localId || usingMock) {
      setTasks((prev) => prev.map((t) => (t.id === row.id ? { ...t, completado: !t.completado } : t)));
      return;
    }
    const next = !row.completado;
    const r = await updateProduccionTask(supabase, localId, row.id, { completado: next });
    if (!r.ok) setMsg(r.message);
    else void reload();
  };

  const markAll = async () => {
    if (!supabase || !localId || usingMock) {
      setTasks((prev) => prev.map((t) => ({ ...t, completado: true })));
      return;
    }
    setBusy(true);
    await Promise.all(tasks.map((t) => updateProduccionTask(supabase, localId, t.id, { completado: true })));
    setBusy(false);
    void reload();
  };

  const addManual = async () => {
    if (!nuevaTarea.trim()) return;
    if (!supabase || !localId || usingMock) return;
    setBusy(true);
    const cant = nuevaCant.trim() === '' ? null : Number(nuevaCant.replace(',', '.'));
    const r = await insertProduccionTask({
      supabase,
      localId,
      fecha: dateKey,
      texto_tarea: nuevaTarea.trim(),
      cantidad: cant != null && !Number.isNaN(cant) ? cant : null,
      unidad: nuevaUnid.trim(),
    });
    setBusy(false);
    if (!r.ok) setMsg(r.message);
    else {
      setNuevaTarea('');
      setNuevaCant('');
      setNuevaUnid('');
      void reload();
    }
  };

  const removeTask = async (id: string) => {
    if (!window.confirm('¿Eliminar esta tarea?')) return;
    if (!supabase || !localId || usingMock) return;
    const r = await deleteProduccionTask(supabase, localId, id);
    if (!r.ok) setMsg(r.message);
    else void reload();
  };

  const genFromPlatos = async () => {
    if (!supabase || !localId || usingMock) return;
    setBusy(true);
    const r = await generateProduccionFromPlan(supabase, localId, dateKey);
    setBusy(false);
    if (!r.ok) setMsg(r.message);
    else {
      setMsg(`Generadas ${r.inserted} tareas desde ingredientes.`);
      void reload();
    }
  };

  const allChecked = tasks.length > 0 && tasks.every((t) => t.completado);

  return (
    <div className="mx-auto max-w-lg space-y-4 px-3 pb-28 pt-2 sm:px-4">
      <div className="flex items-center gap-2">
        <Link
          href={`/servicio?fecha=${dateKey}`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-800 ring-1 ring-zinc-200 active:scale-[0.98]"
          aria-label="Volver a servicio"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h2 className="text-lg font-extrabold text-zinc-900">Producción</h2>
      </div>

      {msg ? (
        <p className="rounded-xl bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-800 ring-1 ring-zinc-200">{msg}</p>
      ) : null}
      {usingMock ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950 ring-1 ring-amber-100">
          Sin Supabase: checklist local (no se guarda).
        </p>
      ) : null}

      <div className="grid gap-2 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200 sm:grid-cols-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-zinc-500">Raciones</p>
          <p className="text-xl font-extrabold text-zinc-900">{totalRaciones}</p>
        </div>
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-zinc-500">Platos</p>
          <p className="text-xl font-extrabold text-zinc-900">{nPlatos}</p>
        </div>
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-zinc-500">Tiempo aprox.</p>
          <p className="text-xl font-extrabold text-zinc-900">{tiempo} min</p>
        </div>
      </div>

      <ServicioProductionOrder />

      {canManage && !usingMock ? (
        <div className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
          <p className="text-xs font-extrabold uppercase text-zinc-700">Nueva tarea manual</p>
          <input
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-semibold"
            placeholder="Texto claro (ej. lavar brotes)"
            value={nuevaTarea}
            onChange={(e) => setNuevaTarea(e.target.value)}
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-semibold"
              placeholder="Cantidad"
              value={nuevaCant}
              onChange={(e) => setNuevaCant(e.target.value)}
            />
            <input
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-semibold"
              placeholder="Unidad"
              value={nuevaUnid}
              onChange={(e) => setNuevaUnid(e.target.value)}
            />
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={busy}
              onClick={() => void addManual()}
              className="h-12 flex-1 rounded-xl bg-[#D32F2F] text-sm font-extrabold text-white disabled:opacity-50"
            >
              Añadir tarea
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void genFromPlatos()}
              className="h-12 flex-1 rounded-xl border border-zinc-300 bg-white text-sm font-extrabold text-zinc-900 disabled:opacity-50"
            >
              Generar desde platos
            </button>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-700">Checklist mise en place</p>
        <ul className="mt-3 space-y-2">
          {tasks.map((item) => (
            <li key={item.id} className="flex gap-3 rounded-xl bg-zinc-50/80 p-3 ring-1 ring-zinc-200/80">
              <input
                type="checkbox"
                checked={item.completado}
                onChange={() => void toggle(item)}
                className="mt-1 h-5 w-5 shrink-0 accent-[#D32F2F]"
                aria-label={item.texto_tarea}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-zinc-900">{item.texto_tarea}</p>
                <p className="mt-0.5 text-xs font-semibold text-zinc-600">
                  {item.cantidad != null ? `${item.cantidad} ` : ''}
                  {item.unidad}
                </p>
              </div>
              {canManage && !usingMock ? (
                <button
                  type="button"
                  onClick={() => void removeTask(item.id)}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-rose-800 ring-1 ring-rose-100"
                  aria-label="Eliminar tarea"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {!tasks.length ? <p className="mt-2 text-center text-xs text-zinc-500">Sin tareas. Añade manual o genera desde platos.</p> : null}
        <button
          type="button"
          disabled={busy || !tasks.length}
          onClick={() => void markAll()}
          className="mt-4 flex h-14 w-full items-center justify-center rounded-2xl bg-zinc-900 text-sm font-extrabold text-white active:scale-[0.99] disabled:opacity-40"
        >
          Marcar todo como listo
        </button>
        {allChecked ? (
          <p className="mt-3 text-center text-xs font-bold text-emerald-700">Listo para servicio</p>
        ) : null}
      </div>
    </div>
  );
}

export default function ServicioProduccionPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-4 py-10 text-center text-sm text-zinc-500">Cargando producción…</div>
      }
    >
      <ProduccionInner />
    </Suspense>
  );
}
