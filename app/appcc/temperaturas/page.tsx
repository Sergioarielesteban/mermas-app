'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Thermometer, Trash2 } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  APPCC_SLOT_LABEL,
  APPCC_UNIT_TYPE_LABEL,
  APPCC_ZONE_LABEL,
  type AppccColdUnitRow,
  type AppccReadingRow,
  type AppccSlot,
  type AppccZone,
  deleteAppccReading,
  fetchAppccColdUnits,
  fetchAppccReadingsForDate,
  isTempOutOfRange,
  madridDateKey,
  readingsByUnitAndSlot,
  upsertAppccReading,
} from '@/lib/appcc-supabase';

function parseTempInput(raw: string): number | null {
  const n = Number(String(raw).trim().replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function SlotEditor({
  unit,
  slot,
  dateKey,
  reading,
  optional,
  showForm,
  onShowForm,
  onSaved,
  onDeleted,
  disabled,
}: {
  unit: AppccColdUnitRow;
  slot: AppccSlot;
  dateKey: string;
  reading: AppccReadingRow | undefined;
  optional: boolean;
  showForm: boolean;
  onShowForm: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  disabled: boolean;
}) {
  const { localId } = useAuth();
  const [value, setValue] = useState(reading ? String(reading.temperature_c) : '');
  const [notes, setNotes] = useState(reading?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setValue(reading ? String(reading.temperature_c) : '');
    setNotes(reading?.notes ?? '');
  }, [reading]);

  const out = reading
    ? isTempOutOfRange(reading.temperature_c, unit.temp_min_c, unit.temp_max_c)
    : false;

  const save = async () => {
    setErr(null);
    const supabase = getSupabaseClient();
    if (!supabase || !localId) {
      setErr('Sesión o Supabase no disponible.');
      return;
    }
    const t = parseTempInput(value);
    if (t === null) {
      setErr('Indica una temperatura válida (°C).');
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      setErr('No se pudo identificar al usuario.');
      return;
    }
    setSaving(true);
    try {
      await upsertAppccReading(supabase, {
        localId,
        coldUnitId: unit.id,
        readingDate: dateKey,
        slot,
        temperatureC: t,
        notes: notes.trim(),
        userId: user.id,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  const removeTarde = async () => {
    if (!reading || slot !== 'tarde') return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSaving(true);
    setErr(null);
    try {
      await deleteAppccReading(supabase, reading.id);
      setValue('');
      setNotes('');
      onDeleted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al eliminar.');
    } finally {
      setSaving(false);
    }
  };

  if (optional && !reading && !showForm) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-2">
        <span className="text-xs font-semibold text-zinc-500">{APPCC_SLOT_LABEL[slot]}</span>
        <button
          type="button"
          onClick={onShowForm}
          disabled={disabled}
          className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-2 py-1 text-xs font-bold text-zinc-600 hover:bg-white disabled:opacity-50"
        >
          + Añadir lectura de tarde
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 border-t border-zinc-100 pt-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[5.5rem]">
          <label className="text-[0.65rem] font-bold uppercase tracking-wide text-zinc-400">
            {APPCC_SLOT_LABEL[slot]}
          </label>
          <div className="mt-0.5 flex items-center gap-1">
            <input
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={disabled || saving}
              placeholder="°C"
              className="h-9 w-20 rounded-lg border border-zinc-200 bg-white px-2 text-sm font-semibold text-zinc-900 outline-none ring-[#D32F2F]/0 focus:ring-2"
            />
            <span className="text-xs text-zinc-500">°C</span>
          </div>
        </div>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={disabled || saving}
          placeholder="Notas (opcional)"
          className="h-9 min-w-[8rem] flex-1 rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-700 outline-none focus:ring-2 focus:ring-[#D32F2F]/25"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={disabled || saving}
          className="h-9 rounded-lg bg-[#D32F2F] px-3 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-50"
        >
          {saving ? '…' : 'Guardar'}
        </button>
        {optional && reading ? (
          <button
            type="button"
            onClick={() => void removeTarde()}
            disabled={disabled || saving}
            className="grid h-9 w-9 place-items-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
            title="Quitar lectura de tarde"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {reading && (unit.temp_min_c != null || unit.temp_max_c != null) ? (
        <p className={`mt-1 text-[0.65rem] ${out ? 'font-semibold text-red-600' : 'text-emerald-700'}`}>
          {out ? 'Fuera del rango configurado para este equipo.' : 'Dentro del rango.'}
        </p>
      ) : null}
      {err ? <p className="mt-1 text-xs font-medium text-red-600">{err}</p> : null}
    </div>
  );
}

function UnitCard({
  unit,
  dateKey,
  map,
  disabled,
  onRefresh,
}: {
  unit: AppccColdUnitRow;
  dateKey: string;
  map: Map<string, AppccReadingRow>;
  disabled: boolean;
  onRefresh: () => void;
}) {
  const [showTarde, setShowTarde] = useState(() => Boolean(map.get(`${unit.id}:tarde`)));

  useEffect(() => {
    if (map.get(`${unit.id}:tarde`)) setShowTarde(true);
  }, [map, unit.id]);

  const rM = map.get(`${unit.id}:manana`);
  const rT = map.get(`${unit.id}:tarde`);
  const rN = map.get(`${unit.id}:noche`);

  return (
    <div className="rounded-2xl border border-zinc-200/90 bg-zinc-50/80 p-4 ring-1 ring-zinc-100">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-zinc-900">{unit.name}</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {APPCC_UNIT_TYPE_LABEL[unit.unit_type]}
            {unit.temp_min_c != null || unit.temp_max_c != null
              ? ` · ${unit.temp_min_c ?? '—'}…${unit.temp_max_c ?? '—'} °C`
              : ''}
          </p>
        </div>
        <Thermometer className="h-5 w-5 shrink-0 text-[#D32F2F]/70" aria-hidden />
      </div>
      <SlotEditor
        unit={unit}
        slot="manana"
        dateKey={dateKey}
        reading={rM}
        optional={false}
        showForm
        onShowForm={() => {}}
        onSaved={onRefresh}
        onDeleted={onRefresh}
        disabled={disabled}
      />
      <SlotEditor
        unit={unit}
        slot="tarde"
        dateKey={dateKey}
        reading={rT}
        optional
        showForm={showTarde}
        onShowForm={() => setShowTarde(true)}
        onSaved={onRefresh}
        onDeleted={() => {
          setShowTarde(false);
          onRefresh();
        }}
        disabled={disabled}
      />
      <SlotEditor
        unit={unit}
        slot="noche"
        dateKey={dateKey}
        reading={rN}
        optional={false}
        showForm
        onShowForm={() => {}}
        onSaved={onRefresh}
        onDeleted={onRefresh}
        disabled={disabled}
      />
    </div>
  );
}

export default function AppccTemperaturasPage() {
  const { localId, profileReady } = useAuth();
  const [dateKey, setDateKey] = useState(() => madridDateKey());
  const [units, setUnits] = useState<AppccColdUnitRow[]>([]);
  const [readings, setReadings] = useState<AppccReadingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);

  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setUnits([]);
      setReadings([]);
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    setLoading(true);
    setBanner(null);
    try {
      const [u, r] = await Promise.all([
        fetchAppccColdUnits(supabase, localId, true),
        fetchAppccReadingsForDate(supabase, localId, dateKey),
      ]);
      setUnits(u);
      setReadings(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al cargar datos.';
      if (msg.toLowerCase().includes('relation') || msg.includes('does not exist')) {
        setBanner(
          'Faltan las tablas APPCC en Supabase. Ejecuta supabase-appcc-schema.sql y añade las tablas a la publicación Realtime si la usas.',
        );
      } else {
        setBanner(msg);
      }
      setUnits([]);
      setReadings([]);
    } finally {
      setLoading(false);
    }
  }, [dateKey, localId, supabaseOk]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!localId || !supabaseOk) return;
    const supabase = getSupabaseClient()!;
    const channel = supabase
      .channel(`appcc-readings-${localId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appcc_temperature_readings',
          filter: `local_id=eq.${localId}`,
        },
        () => void load(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appcc_cold_units',
          filter: `local_id=eq.${localId}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [localId, supabaseOk, load]);

  const bySlot = useMemo(() => readingsByUnitAndSlot(readings), [readings]);

  const byZone = useMemo(() => {
    const zones: AppccZone[] = ['cocina', 'barra'];
    return zones.map((z) => ({
      zone: z,
      list: units.filter((u) => u.zone === z),
    }));
  }, [units]);

  const disabled = !localId || !profileReady || !supabaseOk || loading;

  return (
    <div className="space-y-6">
      <Link
        href="/panel"
        className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-[#D32F2F]"
      >
        <ChevronLeft className="h-4 w-4" />
        Panel
      </Link>

      <MermasStyleHero
        eyebrow="APPCC"
        title="Temperaturas de frío"
        description="Registro diario por la mañana y por la noche. La tarde es opcional si necesitáis un control extra."
      />

      {!isSupabaseEnabled() || !getSupabaseClient() ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Configura <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code> y{' '}
          <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> para usar este módulo.
        </div>
      ) : null}

      {!localId && profileReady ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Tu usuario necesita un perfil con <strong>local</strong> en Supabase para registrar temperaturas.
        </div>
      ) : null}

      {banner ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{banner}</div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <label htmlFor="appcc-date" className="text-xs font-bold uppercase tracking-wide text-zinc-500">
            Día del registro
          </label>
          <input
            id="appcc-date"
            type="date"
            value={dateKey}
            onChange={(e) => setDateKey(e.target.value)}
            className="mt-1 block h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900"
          />
        </div>
        <Link
          href="/appcc/equipos"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-800 hover:bg-zinc-50"
        >
          Gestionar equipos
        </Link>
      </div>

      {loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando…</p>
      ) : units.length === 0 && localId && supabaseOk && !banner ? (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-zinc-800">No hay equipos de frío dados de alta.</p>
          <p className="mt-2 text-xs text-zinc-600">
            Añade neveras y congeladores (cocina y barra) en gestión de equipos.
          </p>
          <Link
            href="/appcc/equipos"
            className="mt-4 inline-flex h-10 items-center rounded-xl bg-[#D32F2F] px-4 text-xs font-bold uppercase tracking-wide text-white"
          >
            Ir a equipos
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {byZone.map(({ zone, list }) =>
            list.length === 0 ? null : (
              <section key={zone}>
                <h2 className="mb-3 text-lg font-bold text-zinc-900">{APPCC_ZONE_LABEL[zone]}</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {list.map((unit) => (
                    <UnitCard
                      key={unit.id}
                      unit={unit}
                      dateKey={dateKey}
                      map={bySlot}
                      disabled={disabled}
                      onRefresh={() => void load()}
                    />
                  ))}
                </div>
              </section>
            ),
          )}
        </div>
      )}
    </div>
  );
}
