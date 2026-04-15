'use client';

import Link from 'next/link';
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, Download, Thermometer } from 'lucide-react';
import AppccCompactHero from '@/components/AppccCompactHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { downloadAppccTemperaturasPdf, downloadAppccTemperaturasRangePdf } from '@/lib/appcc-pdf';
import {
  APPCC_SLOT_LABEL,
  APPCC_UNIT_TYPE_LABEL,
  APPCC_ZONE_LABEL,
  type AppccColdUnitRow,
  type AppccReadingRow,
  type AppccSlot,
  type AppccZone,
  enumerateDateKeysInclusive,
  fetchAppccColdUnits,
  fetchAppccReadingsForDate,
  fetchAppccReadingsInRange,
  formatAppccDateEs,
  isTempOutOfRange,
  madridDateKey,
  readingsByUnitAndSlot,
  deleteAppccReading,
  upsertAppccReading,
} from '@/lib/appcc-supabase';

const PDF_MAX_DAYS = 120;

function parseTempInput(raw: string): number | null {
  const s = String(raw).trim().replace(',', '.').replace(/\u2212/g, '-');
  // Number('') === 0 en JS: vacío o signo suelto no es una temperatura válida.
  if (s === '' || s === '-' || s === '+' || s === '.' || s === '-.' || s === '+.') return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function initialTempFieldValue(unit: AppccColdUnitRow, reading: AppccReadingRow | undefined): string {
  if (reading != null) return String(reading.temperature_c);
  return unit.unit_type === 'congelador' ? '-' : '';
}

/** Solo dos turnos al día (mañana y noche); «tarde» queda en BD por lecturas antiguas. */
const TEMP_REGISTRO_SLOTS: AppccSlot[] = ['manana', 'noche'];

const SLOT_SHORT: Record<AppccSlot, string> = {
  manana: 'Mañana',
  tarde: 'Tarde',
  noche: 'Noche',
};

function SlotEditor({
  unit,
  slot,
  dateKey,
  reading,
  onSaved,
  onDeleted,
  disabled,
}: {
  unit: AppccColdUnitRow;
  slot: AppccSlot;
  dateKey: string;
  reading: AppccReadingRow | undefined;
  onSaved: (row: AppccReadingRow) => void;
  onDeleted: (coldUnitId: string, slot: AppccSlot) => void;
  disabled: boolean;
}) {
  const { localId } = useAuth();
  const [value, setValue] = useState(() => initialTempFieldValue(unit, reading));
  const [notes, setNotes] = useState(reading?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Tras Guardar OK: mostrar «Guardado» al instante sin esperar al refetch del padre. */
  const [justSaved, setJustSaved] = useState(false);
  const syncTimerRef = React.useRef<number | null>(null);

  useEffect(() => {
    setValue(initialTempFieldValue(unit, reading));
    setNotes(reading?.notes ?? '');
    setJustSaved(false);
  }, [reading, unit]);

  useEffect(
    () => () => {
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    },
    [],
  );

  const tInput = parseTempInput(value);
  const hasLimits = unit.temp_min_c != null || unit.temp_max_c != null;
  const effectiveTemp = tInput !== null ? tInput : (reading?.temperature_c ?? null);
  const out =
    effectiveTemp !== null &&
    hasLimits &&
    isTempOutOfRange(effectiveTemp, unit.temp_min_c, unit.temp_max_c);

  const matchesServerReading =
    reading != null &&
    tInput !== null &&
    Math.round(reading.temperature_c * 100) === Math.round(tInput * 100) &&
    notes.trim() === (reading.notes ?? '').trim();

  const isSavedSynced = justSaved || matchesServerReading;

  const remove = async () => {
    if (!reading) return;
    setErr(null);
    const supabase = getSupabaseClient();
    if (!supabase || !localId) {
      setErr('Sesión o Supabase no disponible.');
      return;
    }
    setSaving(true);
    try {
      await deleteAppccReading(supabase, reading.id);
      setValue(initialTempFieldValue(unit, undefined));
      setNotes('');
      setJustSaved(false);
      onDeleted(unit.id, slot);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al quitar.');
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    setErr(null);
    const supabase = getSupabaseClient();
    if (!supabase || !localId) {
      setErr('Sesión o Supabase no disponible.');
      return;
    }
    const t = parseTempInput(value);
    if (t === null) {
      setErr('Introduce temperatura en °C.');
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      setErr('Usuario no identificado.');
      return;
    }
    setSaving(true);
    try {
      const row = await upsertAppccReading(supabase, {
        localId,
        coldUnitId: unit.id,
        readingDate: dateKey,
        slot,
        temperatureC: t,
        notes: notes.trim(),
        userId: user.id,
      });
      setJustSaved(true);
      onSaved(row);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (disabled || saving) return;
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    setErr(null);

    const t = parseTempInput(value);
    const hasReading = Boolean(reading?.id);
    const sameAsServer =
      reading != null &&
      t != null &&
      Math.round(reading.temperature_c * 100) === Math.round(t * 100) &&
      notes.trim() === (reading.notes ?? '').trim();

    if (sameAsServer) {
      setJustSaved(true);
      return;
    }

    // Campo vacío o inválido: si existía lectura, la quitamos automáticamente.
    if (t === null) {
      setJustSaved(false);
      if (!hasReading) return;
      syncTimerRef.current = window.setTimeout(() => {
        void remove();
      }, 350);
      return;
    }

    // Temperatura válida: guardado automático.
    syncTimerRef.current = window.setTimeout(() => {
      void save();
    }, 350);
  }, [value, notes, reading, disabled, saving]);

  return (
    <div className="py-0.5">
      <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
        <span
          className="w-[2.75rem] shrink-0 text-[9px] font-bold uppercase leading-tight text-zinc-500"
          title={APPCC_SLOT_LABEL[slot]}
        >
          {SLOT_SHORT[slot]}
        </span>
        <div className="flex items-center gap-0.5">
          <input
            type="text"
            inputMode={unit.unit_type === 'congelador' ? 'numeric' : 'decimal'}
            value={value}
            onChange={(e) => {
              setJustSaved(false);
              setValue(e.target.value);
            }}
            disabled={disabled || saving}
            placeholder={unit.unit_type === 'congelador' ? '18' : '°C'}
            title={
              unit.unit_type === 'congelador'
                ? 'Ya hay un «-»; escribe solo el número (ej. 18 → -18 °C)'
                : undefined
            }
            className={[
              'h-7 rounded-md border border-zinc-200 bg-white px-1.5 text-xs font-semibold text-zinc-900 outline-none focus:ring-1 focus:ring-[#D32F2F]/40',
              unit.unit_type === 'congelador' ? 'w-[3.65rem]' : 'w-[3.25rem]',
            ].join(' ')}
          />
          <span className="text-[10px] text-zinc-400">°C</span>
        </div>
        <input
          type="text"
          value={notes}
          onChange={(e) => {
            setJustSaved(false);
            setNotes(e.target.value);
          }}
          disabled={disabled || saving}
          placeholder="Notas"
          className="h-7 min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-1.5 text-[11px] text-zinc-700 outline-none focus:ring-1 focus:ring-[#D32F2F]/30 sm:max-w-[9rem]"
        />
        <button
          type="button"
          title={isSavedSynced ? 'Guardado automático activo' : 'Guardar ahora'}
          onClick={() => {
            if (disabled || saving) return;
            if (isSavedSynced) return;
            void save();
          }}
          disabled={disabled || saving}
          className={[
            'h-7 shrink-0 rounded-md px-2 text-[10px] font-bold uppercase tracking-wide disabled:opacity-50',
            isSavedSynced
              ? 'bg-emerald-600 text-white'
              : 'bg-[#D32F2F] text-white',
          ].join(' ')}
        >
          {saving ? '…' : isSavedSynced ? 'Guardado' : 'Guardar'}
        </button>
      </div>
      {out ? (
        <p className="mt-0.5 text-[9px] font-semibold leading-tight text-red-600">Fuera de rango</p>
      ) : null}
      {err ? <p className="mt-0.5 text-[9px] font-medium text-red-600">{err}</p> : null}
    </div>
  );
}

function UnitCard({
  unit,
  dateKey,
  map,
  disabled,
  onReadingSaved,
  onReadingDeleted,
}: {
  unit: AppccColdUnitRow;
  dateKey: string;
  map: Map<string, AppccReadingRow>;
  disabled: boolean;
  onReadingSaved: (row: AppccReadingRow) => void;
  onReadingDeleted: (coldUnitId: string, slot: AppccSlot) => void;
}) {
  const rM = map.get(`${unit.id}:manana`);
  const rT = map.get(`${unit.id}:tarde`);
  const rN = map.get(`${unit.id}:noche`);

  const range =
    unit.temp_min_c != null || unit.temp_max_c != null
      ? ` · ${unit.temp_min_c ?? '—'} – ${unit.temp_max_c ?? '—'} °C`
      : '';

  return (
    <div className="rounded-xl border border-zinc-200/90 bg-zinc-50/90 px-2.5 py-2 ring-1 ring-zinc-100">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-zinc-900">{unit.name}</p>
          <p className="truncate text-[10px] leading-tight text-zinc-500">
            {APPCC_UNIT_TYPE_LABEL[unit.unit_type]}
            {range}
          </p>
        </div>
        <Thermometer className="h-4 w-4 shrink-0 text-[#D32F2F]/65" aria-hidden />
      </div>
      <div className="divide-y divide-zinc-100/90">
        {TEMP_REGISTRO_SLOTS.map((slot) => (
          <SlotEditor
            key={slot}
            unit={unit}
            slot={slot}
            dateKey={dateKey}
            reading={slot === 'manana' ? rM : rN}
            onSaved={onReadingSaved}
            onDeleted={onReadingDeleted}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

function AppccTemperaturasInner() {
  const searchParams = useSearchParams();
  const { localId, profileReady, localName, localCode } = useAuth();
  const [dateKey, setDateKey] = useState(() => madridDateKey());
  const [pdfDateFrom, setPdfDateFrom] = useState(() => madridDateKey());
  const [pdfDateTo, setPdfDateTo] = useState(() => madridDateKey());
  const [units, setUnits] = useState<AppccColdUnitRow[]>([]);
  const [readings, setReadings] = useState<AppccReadingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    const d = searchParams.get('d');
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      setDateKey(d);
      setPdfDateFrom(d);
      setPdfDateTo(d);
    }
  }, [searchParams]);

  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!localId || !supabaseOk) {
      setUnits([]);
      setReadings([]);
      if (!silent) setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    if (!silent) setLoading(true);
    if (!silent) setBanner(null);
    try {
      const [u, r] = await Promise.all([
        fetchAppccColdUnits(supabase, localId, true),
        fetchAppccReadingsForDate(supabase, localId, dateKey),
      ]);
      setUnits(u);
      setReadings(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al cargar datos.';
      if (!silent) {
        if (msg.toLowerCase().includes('relation') || msg.includes('does not exist')) {
          setBanner(
            'Faltan las tablas APPCC en Supabase. Ejecuta supabase-appcc-schema.sql y añade las tablas a la publicación Realtime si la usas.',
          );
        } else {
          setBanner(msg);
        }
      }
      if (!silent) {
        setUnits([]);
        setReadings([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [dateKey, localId, supabaseOk]);

  const mergeReading = useCallback(
    (row: AppccReadingRow) => {
      if (row.reading_date !== dateKey) return;
      setReadings((prev) => {
        const rest = prev.filter(
          (x) => !(x.cold_unit_id === row.cold_unit_id && x.slot === row.slot),
        );
        return [...rest, row];
      });
    },
    [dateKey],
  );

  const dropReading = useCallback((coldUnitId: string, slot: AppccSlot) => {
    setReadings((prev) => prev.filter((x) => !(x.cold_unit_id === coldUnitId && x.slot === slot)));
  }, []);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    void load();
  }, [load]);

  /** PWA / segundo plano: al volver, volver a pedir equipos (Realtime a veces no llega en móvil). */
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
      .channel(`appcc-readings-${localId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appcc_temperature_readings',
          filter: `local_id=eq.${localId}`,
        },
        () => void load({ silent: true }),
      )
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

  const bySlot = useMemo(() => readingsByUnitAndSlot(readings), [readings]);

  const orderedUnits = useMemo(() => {
    const zones: AppccZone[] = ['cocina', 'barra'];
    const out: AppccColdUnitRow[] = [];
    for (const z of zones) {
      out.push(...units.filter((u) => u.zone === z));
    }
    return out;
  }, [units]);

  const byZone = useMemo(() => {
    const zones: AppccZone[] = ['cocina', 'barra'];
    return zones.map((z) => ({
      zone: z,
      list: units.filter((u) => u.zone === z),
    }));
  }, [units]);

  const disabled = !localId || !profileReady || !supabaseOk || loading;

  const localLabel = localName ?? localCode ?? '—';

  const handleDownloadPdf = async () => {
    if (orderedUnits.length === 0) return;
    const from = pdfDateFrom <= pdfDateTo ? pdfDateFrom : pdfDateTo;
    const to = pdfDateFrom <= pdfDateTo ? pdfDateTo : pdfDateFrom;
    const span = enumerateDateKeysInclusive(from, to).length;
    if (span === 0) return;
    if (span > PDF_MAX_DAYS) {
      setBanner(`El PDF admite como máximo ${PDF_MAX_DAYS} días por archivo.`);
      return;
    }
    setPdfBusy(true);
    setBanner(null);
    try {
      const supabase = getSupabaseClient();
      if (!supabase || !localId) {
        setBanner('Sesión no disponible para descargar.');
        return;
      }
      if (from === to && from === dateKey) {
        downloadAppccTemperaturasPdf({
          localLabel,
          dateKey: from,
          dateFormatted: formatAppccDateEs(from),
          orderedUnits,
          bySlot,
        });
        return;
      }
      const rows = await fetchAppccReadingsInRange(supabase, localId, from, to);
      downloadAppccTemperaturasRangePdf({
        localLabel,
        dateFrom: from,
        dateTo: to,
        orderedUnits,
        readings: rows,
      });
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al generar el PDF.');
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Link
        href="/appcc"
        className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-[#D32F2F]"
      >
        <ChevronLeft className="h-4 w-4" />
        APPCC
      </Link>

      <AppccCompactHero />

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

      <div className="flex flex-col gap-3">
        <div className="flex flex-col items-center text-center">
          <label htmlFor="appcc-date" className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            Día del registro
          </label>
          {/* Input nativo encima (invisible): el texto centrado es formatAppccDateEs; iOS alinea mal type=date */}
          <div className="relative mt-1 flex h-10 w-full max-w-[15rem] items-center justify-center rounded-lg border border-zinc-200 bg-white shadow-sm">
            <span className="pointer-events-none px-3 text-center text-sm font-semibold capitalize tracking-tight text-zinc-900">
              {formatAppccDateEs(dateKey)}
            </span>
            <input
              id="appcc-date"
              type="date"
              value={dateKey}
              onChange={(e) => {
                const v = e.target.value;
                setDateKey(v);
                setPdfDateFrom(v);
                setPdfDateTo(v);
              }}
              className="absolute inset-0 min-h-full min-w-full cursor-pointer opacity-0 text-base"
              aria-label="Elegir día del registro"
            />
          </div>
        </div>
        <div className="mx-auto w-full max-w-sm rounded-xl border border-zinc-100 bg-zinc-50/90 px-3 py-2.5">
          <p className="text-center text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            Rango para el PDF
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-center gap-3">
            <label className="flex flex-col gap-0.5">
              <span className="text-[9px] font-medium text-zinc-500">Desde</span>
              <input
                type="date"
                value={pdfDateFrom}
                onChange={(e) => setPdfDateFrom(e.target.value)}
                className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-900 outline-none focus:ring-2 focus:ring-[#D32F2F]/20"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[9px] font-medium text-zinc-500">Hasta</span>
              <input
                type="date"
                value={pdfDateTo}
                onChange={(e) => setPdfDateTo(e.target.value)}
                className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-900 outline-none focus:ring-2 focus:ring-[#D32F2F]/20"
              />
            </label>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-zinc-400">
            Máximo {PDF_MAX_DAYS} días · una página por día
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/appcc/historial"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-800 hover:bg-zinc-50"
          >
            Historial
          </Link>
          <button
            type="button"
            onClick={() => void handleDownloadPdf()}
            disabled={orderedUnits.length === 0 || pdfBusy}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-zinc-900/15 bg-zinc-900 px-3 text-xs font-bold text-white hover:bg-zinc-800 disabled:opacity-45"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            {pdfBusy ? 'PDF…' : 'Descargar PDF'}
          </button>
          <Link
            href="/appcc/equipos"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-800 hover:bg-zinc-50"
          >
            Equipos
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando…</p>
      ) : units.length === 0 && localId && supabaseOk && !banner ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-6 text-center">
          <p className="text-sm font-semibold text-zinc-800">No hay equipos de frío dados de alta.</p>
          <p className="mt-1 text-xs text-zinc-600">Añádelos en gestión de equipos.</p>
          <Link
            href="/appcc/equipos"
            className="mt-3 inline-flex h-9 items-center rounded-lg bg-[#D32F2F] px-4 text-xs font-bold uppercase tracking-wide text-white"
          >
            Ir a equipos
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {byZone.map(({ zone, list }) =>
            list.length === 0 ? null : (
              <section key={zone}>
                <h2 className="mb-2 text-base font-bold text-zinc-900">{APPCC_ZONE_LABEL[zone]}</h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {list.map((unit) => (
                    <UnitCard
                      key={unit.id}
                      unit={unit}
                      dateKey={dateKey}
                      map={bySlot}
                      disabled={disabled}
                      onReadingSaved={mergeReading}
                      onReadingDeleted={dropReading}
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

export default function AppccTemperaturasPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-sm text-zinc-500">Cargando…</div>
      }
    >
      <AppccTemperaturasInner />
    </Suspense>
  );
}
