'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { appConfirm } from '@/lib/app-dialog-bridge';
import { confirmDestructiveOperation } from '@/lib/ops-role-confirm';
import {
  APPCC_UNIT_TYPE_LABEL,
  APPCC_ZONE_LABEL,
  type AppccColdUnitRow,
  type AppccUnitType,
  type AppccZone,
  deleteAppccColdUnit,
  fetchAppccColdUnits,
  insertAppccColdUnit,
} from '@/lib/appcc-supabase';

function emptyToNull(raw: string): number | null {
  const t = raw.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export default function AppccEquiposPage() {
  const { localId, profileReady, profileRole } = useAuth();
  const [units, setUnits] = useState<AppccColdUnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [zone, setZone] = useState<AppccZone>('cocina');
  const [unitType, setUnitType] = useState<AppccUnitType>('nevera');
  const [sortOrder, setSortOrder] = useState('0');
  const [tempMin, setTempMin] = useState('');
  const [tempMax, setTempMax] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!localId || !supabaseOk) {
      setUnits([]);
      if (!silent) setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    if (!silent) setLoading(true);
    if (!silent) setBanner(null);
    try {
      const u = await fetchAppccColdUnits(supabase, localId, false);
      setUnits(u);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al cargar.';
      if (!silent) {
        if (msg.toLowerCase().includes('relation') || msg.includes('does not exist')) {
          setBanner('Ejecuta supabase-appcc-schema.sql en Supabase antes de usar esta pantalla.');
        } else {
          setBanner(msg);
        }
        setUnits([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [localId, supabaseOk]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ping = () => {
      if (document.visibilityState === 'visible') void loadRef.current({ silent: true });
    };
    document.addEventListener('visibilitychange', ping);
    window.addEventListener('focus', ping);
    const onPageShow = (ev: PageTransitionEvent) => {
      if (ev.persisted) ping();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', ping);
      window.removeEventListener('focus', ping);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  useEffect(() => {
    if (!localId || !supabaseOk) return;
    const supabase = getSupabaseClient()!;
    const channel = supabase
      .channel(`appcc-cold-equipos-${localId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appcc_cold_units',
          filter: `local_id=eq.${localId}`,
        },
        () => void load({ silent: true }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [localId, supabaseOk, load]);

  const addUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localId || !supabaseOk) return;
    const supabase = getSupabaseClient()!;
    const trimmed = name.trim();
    if (!trimmed) {
      setBanner('Indica un nombre para el equipo.');
      return;
    }
    const so = Number(sortOrder);
    const order = Number.isFinite(so) ? Math.trunc(so) : 0;
    const rawLo = emptyToNull(tempMin);
    const rawHi = emptyToNull(tempMax);
    let minC: number | null = null;
    let maxC: number | null = null;
    if (rawLo != null && rawHi != null) {
      minC = Math.min(rawLo, rawHi);
      maxC = Math.max(rawLo, rawHi);
    } else {
      minC = rawLo;
      maxC = rawHi;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      setBanner('No se pudo identificar al usuario.');
      return;
    }
    setSubmitting(true);
    setBanner(null);
    try {
      const created = await insertAppccColdUnit(supabase, {
        localId,
        name: trimmed,
        zone,
        unitType,
        sortOrder: order,
        tempMinC: minC,
        tempMaxC: maxC,
        userId: user.id,
      });
      setName('');
      setSortOrder('0');
      setTempMin('');
      setTempMax('');
      setUnits((prev) =>
        [...prev, created].sort((a, b) =>
          a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.name.localeCompare(b.name),
        ),
      );
    } catch (err) {
      setBanner(err instanceof Error ? err.message : 'No se pudo crear el equipo.');
    } finally {
      setSubmitting(false);
    }
  };

  const removeUnit = async (u: AppccColdUnitRow) => {
    if (
      !(await appConfirm(
        `¿Eliminar «${u.name}»? Se borrará también el historial de temperaturas de este equipo. No se puede deshacer.`,
      ))
    ) {
      return;
    }
    if (!(await confirmDestructiveOperation(profileRole, '¿Confirmar eliminación de este equipo?'))) {
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase || !localId) return;
    setDeletingId(u.id);
    setBanner(null);
    try {
      await deleteAppccColdUnit(supabase, u.id);
      setUnits((prev) => prev.filter((x) => x.id !== u.id));
    } catch (err) {
      setBanner(err instanceof Error ? err.message : 'No se pudo eliminar el equipo.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <MermasStyleHero
        eyebrow="APPCC"
        title="Equipos de frío"
        description="Neveras y congeladores de cocina y barra. El rango °C es opcional: indica el límite más frío y el más templado. En Celsius el número más bajo es el más frío (ej. congelador entre -13 y -18 → -18 y -13)."
      />

      {!isSupabaseEnabled() || !getSupabaseClient() ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Configura las variables de entorno de Supabase para usar este módulo.
        </div>
      ) : null}

      {!localId && profileReady ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Tu usuario necesita perfil con local en Supabase.
        </div>
      ) : null}

      {banner ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{banner}</div>
      ) : null}

      <form
        onSubmit={addUnit}
        className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 ring-1 ring-zinc-100"
      >
        <p className="text-sm font-bold text-zinc-900">Añadir equipo</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs font-bold uppercase text-zinc-500">Nombre</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
              placeholder="Ej. Nevera barra 1"
              disabled={!localId || submitting}
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-zinc-500">Zona</label>
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value as AppccZone)}
              className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
              disabled={!localId || submitting}
            >
              <option value="cocina">{APPCC_ZONE_LABEL.cocina}</option>
              <option value="barra">{APPCC_ZONE_LABEL.barra}</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-zinc-500">Tipo</label>
            <select
              value={unitType}
              onChange={(e) => setUnitType(e.target.value as AppccUnitType)}
              className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
              disabled={!localId || submitting}
            >
              <option value="nevera">{APPCC_UNIT_TYPE_LABEL.nevera}</option>
              <option value="congelador">{APPCC_UNIT_TYPE_LABEL.congelador}</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-zinc-500">Orden</label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
              disabled={!localId || submitting}
            />
          </div>
          <div className="sm:col-span-2">
            <p className="text-[11px] leading-snug text-zinc-500">
              Rango permitido en °C: el <strong className="text-zinc-700">más frío</strong> es el número{' '}
              <strong className="text-zinc-700">más bajo</strong> (p. ej. -18 en congelador). Si pones los
              dos límites, da igual en qué casilla escribas cada uno: se ordenan al guardar.
            </p>
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-zinc-500">Límite más frío °C (opc.)</label>
            <input
              value={tempMin}
              onChange={(e) => setTempMin(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
              placeholder="Ej. -18 o 2"
              disabled={!localId || submitting}
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-zinc-500">Límite más templado °C (opc.)</label>
            <input
              value={tempMax}
              onChange={(e) => setTempMax(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
              placeholder="Ej. -13 o 6"
              disabled={!localId || submitting}
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={!localId || submitting || !profileReady}
          className="h-11 w-full rounded-xl bg-[#D32F2F] text-sm font-bold uppercase tracking-wide text-white disabled:opacity-50 sm:w-auto sm:px-6"
        >
          {submitting ? 'Guardando…' : 'Dar de alta'}
        </button>
      </form>

      <div>
        <p className="mb-3 text-sm font-bold text-zinc-900">Equipos del local</p>
        {loading ? (
          <p className="text-sm text-zinc-500">Cargando…</p>
        ) : units.length === 0 ? (
          <p className="text-sm text-zinc-600">Aún no hay equipos. Usa el formulario de arriba.</p>
        ) : (
          <ul className="space-y-2">
            {units.map((u) => (
              <li
                key={u.id}
                className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-bold text-zinc-900">
                    {u.name}
                    {!u.is_active ? (
                      <span className="ml-2 text-xs font-semibold text-amber-700">(inactivo)</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {APPCC_ZONE_LABEL[u.zone]} · {APPCC_UNIT_TYPE_LABEL[u.unit_type]}
                    {u.temp_min_c != null || u.temp_max_c != null
                      ? ` · ${u.temp_min_c ?? '—'}–${u.temp_max_c ?? '—'} °C`
                      : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void removeUnit(u)}
                  disabled={!localId || deletingId === u.id}
                  className="h-9 shrink-0 rounded-lg bg-[#D32F2F] px-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-[#b71c1c] disabled:opacity-50"
                >
                  {deletingId === u.id ? '…' : 'Eliminar'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
