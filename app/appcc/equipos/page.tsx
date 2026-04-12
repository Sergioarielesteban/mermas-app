'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  APPCC_UNIT_TYPE_LABEL,
  APPCC_ZONE_LABEL,
  type AppccColdUnitRow,
  type AppccUnitType,
  type AppccZone,
  fetchAppccColdUnits,
  insertAppccColdUnit,
  updateAppccColdUnit,
} from '@/lib/appcc-supabase';

function emptyToNull(raw: string): number | null {
  const t = raw.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export default function AppccEquiposPage() {
  const { localId, profileReady } = useAuth();
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

  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setUnits([]);
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    setLoading(true);
    setBanner(null);
    try {
      const u = await fetchAppccColdUnits(supabase, localId, false);
      setUnits(u);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al cargar.';
      if (msg.toLowerCase().includes('relation') || msg.includes('does not exist')) {
        setBanner('Ejecuta supabase-appcc-schema.sql en Supabase antes de usar esta pantalla.');
      } else {
        setBanner(msg);
      }
      setUnits([]);
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk]);

  useEffect(() => {
    void load();
  }, [load]);

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
    const minC = emptyToNull(tempMin);
    const maxC = emptyToNull(tempMax);
    if (minC != null && maxC != null && minC > maxC) {
      setBanner('La temperatura mínima no puede ser mayor que la máxima.');
      return;
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
      await insertAppccColdUnit(supabase, {
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
      await load();
    } catch (err) {
      setBanner(err instanceof Error ? err.message : 'No se pudo crear el equipo.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (u: AppccColdUnitRow) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    try {
      await updateAppccColdUnit(supabase, u.id, { is_active: !u.is_active });
      await load();
    } catch (err) {
      setBanner(err instanceof Error ? err.message : 'Error al actualizar.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/panel"
          className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-[#D32F2F]"
        >
          <ChevronLeft className="h-4 w-4" />
          Panel
        </Link>
        <span className="text-zinc-300">·</span>
        <Link
          href="/appcc/temperaturas"
          className="text-sm font-semibold text-zinc-600 hover:text-[#D32F2F]"
        >
          Temperaturas
        </Link>
      </div>

      <MermasStyleHero
        eyebrow="APPCC"
        title="Equipos de frío"
        description="Neveras y congeladores de cocina y barra. Los rangos °C son opcionales; sirven para avisar si una lectura sale de lo previsto."
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
          <div>
            <label className="text-xs font-bold uppercase text-zinc-500">Mín °C (opc.)</label>
            <input
              value={tempMin}
              onChange={(e) => setTempMin(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
              placeholder="Ej. 0"
              disabled={!localId || submitting}
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-zinc-500">Máx °C (opc.)</label>
            <input
              value={tempMax}
              onChange={(e) => setTempMax(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
              placeholder="Ej. 4"
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
                  <p className={`text-sm font-bold ${u.is_active ? 'text-zinc-900' : 'text-zinc-400 line-through'}`}>
                    {u.name}
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
                  onClick={() => void toggleActive(u)}
                  disabled={!localId}
                  className="h-9 shrink-0 rounded-lg border border-zinc-300 bg-zinc-50 px-3 text-xs font-bold text-zinc-800 hover:bg-zinc-100 disabled:opacity-50"
                >
                  {u.is_active ? 'Desactivar' : 'Reactivar'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
