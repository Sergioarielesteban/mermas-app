'use client';

import Link from 'next/link';
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, ChevronDown, Download, Minus, Plus, Thermometer, X } from 'lucide-react';
import AppccCompactHero from '@/components/AppccCompactHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { downloadAppccTemperaturasPdf, downloadAppccTemperaturasRangePdf } from '@/lib/appcc-pdf';
import {
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
  appccTemperaturasOperationalDateKey,
  readingsByUnitAndSlot,
  deleteAppccReading,
  upsertAppccReading,
} from '@/lib/appcc-supabase';
import { notifyAppccAlerta } from '@/services/notifications';

const PDF_MAX_DAYS = 120;
const LS_REGISTRADOR = 'appcc_registrador';
const LS_REGISTRADORES = 'appcc_registradores';
const MAX_NAMES = 6;

const SLOT_DISPLAY: Record<AppccSlot, string> = {
  manana: 'Mañana',
  tarde: 'Tarde',
  noche: 'Noche',
};

/** Solo dos turnos al día (mañana y noche); «tarde» queda en BD por lecturas antiguas. */
const TEMP_REGISTRO_SLOTS: AppccSlot[] = ['manana', 'noche'];

// ─── Helpers ────────────────────────────────────────────────────────────────

function sanitizeTempInput(raw: string): string {
  const plain = String(raw).replace(/\s+/g, '').replace(',', '.').replace(/[^0-9.]/g, '');
  const firstDot = plain.indexOf('.');
  const compact =
    firstDot < 0 ? plain : `${plain.slice(0, firstDot + 1)}${plain.slice(firstDot + 1).replace(/\./g, '')}`;
  const [intPartRaw = '', decPartRaw = ''] = compact.split('.');
  const intPart = intPartRaw.replace(/^0+(?=\d)/, '');
  if (!compact.includes('.')) return intPart;
  return `${intPart || '0'}.${decPartRaw.slice(0, 1)}`;
}

function parseTempInput(raw: string, unitType: AppccColdUnitRow['unit_type']): number | null {
  const s = sanitizeTempInput(raw);
  if (s === '' || s === '.') return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const abs = Math.round(Math.abs(n) * 10) / 10;
  return unitType === 'congelador' ? -abs : abs;
}

function formatHourMin(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
}

function formatSignedTempLabel(temp: number): string {
  const fixed = Number.isInteger(temp) ? String(temp) : temp.toFixed(1).replace('.', ',');
  return `${fixed} °C`;
}

function stepTemp(current: string, delta: number, unitType: AppccColdUnitRow['unit_type']): string {
  const parsed = parseFloat(current.replace(',', '.'));
  const base = isNaN(parsed) ? (unitType === 'congelador' ? 18 : 4) : parsed;
  const next = Math.round((base + delta) * 10) / 10;
  return String(next).replace('.', ',');
}

// ─── localStorage helpers ────────────────────────────────────────────────────

function loadRegistrador(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(LS_REGISTRADOR) ?? '';
}

function loadRegistradores(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(LS_REGISTRADORES) ?? '[]');
  } catch {
    return [];
  }
}

function saveRegistrador(name: string) {
  localStorage.setItem(LS_REGISTRADOR, name);
  const existing = loadRegistradores();
  const updated = [name, ...existing.filter((n) => n !== name)].slice(0, MAX_NAMES);
  localStorage.setItem(LS_REGISTRADORES, JSON.stringify(updated));
}

// ─── RegistradorSelector ─────────────────────────────────────────────────────

function RegistradorSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const names = loadRegistradores();

  const commit = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    saveRegistrador(trimmed);
    onChange(trimmed);
    setEditing(false);
    setInputVal('');
  };

  if (!value || editing) {
    return (
      <div className="rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-[#D32F2F]/40">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#D32F2F] text-[10px] font-black text-white">!</span>
          <p className="text-[12px] font-bold text-[#D32F2F]">Indica quién registra para continuar</p>
        </div>
        {names.length > 0 && !editing ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {names.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => { saveRegistrador(n); onChange(n); }}
                className="rounded-full bg-zinc-100 px-3 py-1.5 text-[13px] font-semibold text-zinc-800 transition hover:bg-[#D32F2F] hover:text-white"
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-full bg-zinc-50 px-3 py-1.5 text-[13px] font-semibold text-zinc-400 ring-1 ring-zinc-200 transition hover:bg-zinc-100"
            >
              + Otro
            </button>
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            <input
              autoFocus
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commit(inputVal); if (e.key === 'Escape') { setEditing(false); setInputVal(''); } }}
              placeholder="Tu nombre o iniciales…"
              className="h-10 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 outline-none focus:border-[#D32F2F]/60 focus:ring-1 focus:ring-[#D32F2F]/25"
            />
            <button
              type="button"
              onClick={() => commit(inputVal)}
              disabled={!inputVal.trim()}
              className="h-10 rounded-xl bg-[#D32F2F] px-4 text-[13px] font-bold text-white disabled:opacity-40"
            >
              Listo
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-zinc-200/80">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
        <Check className="h-4 w-4 text-emerald-600" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Registrando como</p>
        <p className="text-[15px] font-bold text-zinc-900">{value}</p>
      </div>
      <button
        type="button"
        onClick={() => { setEditing(true); setInputVal(''); }}
        className="text-[11px] font-bold text-zinc-400 underline underline-offset-2 hover:text-zinc-600"
      >
        Cambiar
      </button>
    </div>
  );
}

// ─── SlotEditor ──────────────────────────────────────────────────────────────

function SlotEditor({
  unit,
  slot,
  dateKey,
  reading,
  onSaved,
  onDeleted,
  disabled,
  registrador,
}: {
  unit: AppccColdUnitRow;
  slot: AppccSlot;
  dateKey: string;
  reading: AppccReadingRow | undefined;
  onSaved: (row: AppccReadingRow) => void;
  onDeleted: (coldUnitId: string, slot: AppccSlot) => void;
  disabled: boolean;
  registrador: string;
}) {
  const { localId, userId: authUserId } = useAuth();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedMeta, setSavedMeta] = useState<{ name: string; time: string } | null>(null);

  useEffect(() => {
    setOpen(false);
    setValue('');
    setNotes('');
    setErr(null);
    setSavedMeta(null);
  }, [reading?.id, dateKey]);

  const tempParsed = parseTempInput(value, unit.unit_type);
  const hasLimits = unit.temp_min_c != null || unit.temp_max_c != null;
  const effectiveTemp = tempParsed ?? reading?.temperature_c ?? null;
  const outOfRange =
    effectiveTemp !== null && hasLimits && isTempOutOfRange(effectiveTemp, unit.temp_min_c, unit.temp_max_c);

  const remove = async () => {
    if (!reading) return;
    setErr(null);
    const supabase = getSupabaseClient();
    if (!supabase || !localId) { setErr('Sesión no disponible.'); return; }
    setSaving(true);
    try {
      await deleteAppccReading(supabase, reading.id);
      setOpen(false);
      setSavedMeta(null);
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
    if (!supabase || !localId) { setErr('Sesión no disponible.'); return; }
    const t = parseTempInput(value, unit.unit_type);
    if (t === null) { setErr('Introduce temperatura.'); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) { setErr('Usuario no identificado.'); return; }
    setSaving(true);
    try {
      const notesValue = notes.trim()
        ? (registrador ? `[${registrador}] ${notes.trim()}` : notes.trim())
        : (registrador ? `[${registrador}]` : '');
      const row = await upsertAppccReading(supabase, {
        localId,
        coldUnitId: unit.id,
        readingDate: dateKey,
        slot,
        temperatureC: t,
        notes: notesValue,
        userId: user.id,
      });
      if (hasLimits && isTempOutOfRange(t, unit.temp_min_c, unit.temp_max_c) && localId) {
        void notifyAppccAlerta(supabase, {
          localId,
          userId: user.id ?? authUserId,
          elemento: unit.name,
          readingId: row.id,
          dateKey,
        });
      }
      setSavedMeta({ name: registrador || 'Registrado', time: formatHourMin(row.recorded_at) });
      setOpen(false);
      onSaved(row);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  const slotLabel = SLOT_DISPLAY[slot];

  // ── Caso: ya hay lectura ──────────────────────────────────────────────────
  if (reading && !open) {
    const displayName = savedMeta?.name ?? parseRegistradorFromNotes(reading.notes);
    const displayTime = savedMeta?.time ?? formatHourMin(reading.recorded_at);
    const tempLabel = formatSignedTempLabel(reading.temperature_c);

    return (
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{slotLabel}</span>
        <div
          className={[
            'flex items-center justify-between rounded-xl px-3 py-2.5 ring-1',
            outOfRange
              ? 'bg-red-50 ring-red-200'
              : 'bg-emerald-50 ring-emerald-200/80',
          ].join(' ')}
        >
          <div className="flex items-center gap-2">
            <Check
              className={['h-4 w-4 shrink-0', outOfRange ? 'text-red-500' : 'text-emerald-500'].join(' ')}
              aria-hidden
            />
            <div>
              <p
                className={[
                  'text-[15px] font-black tabular-nums leading-none',
                  outOfRange ? 'text-red-700' : 'text-emerald-700',
                ].join(' ')}
              >
                {tempLabel}
              </p>
              {outOfRange && (
                <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-red-600">Fuera de rango</p>
              )}
              {displayName && (
                <p className="mt-0.5 text-[10px] font-medium text-zinc-500">
                  {displayName}{displayTime ? ` · ${displayTime}` : ''}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setValue(sanitizeTempInput(String(Math.abs(reading.temperature_c))));
              setNotes(parseRealNotesFromNotes(reading.notes));
              setOpen(true);
            }}
            disabled={disabled}
            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/70 hover:text-zinc-600 disabled:opacity-30"
            title="Editar lectura"
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  // ── Caso: sin lectura ─────────────────────────────────────────────────────
  if (!reading && !open) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{slotLabel}</span>
        <button
          type="button"
          onClick={() => { setOpen(true); setValue(''); setErr(null); }}
          disabled={disabled}
          className="flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-zinc-200 bg-white text-[13px] font-bold text-zinc-400 transition hover:border-[#D32F2F]/60 hover:text-[#D32F2F] disabled:opacity-30"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Añadir
        </button>
      </div>
    );
  }

  // ── Modo edición ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{slotLabel}</span>
        <button
          type="button"
          onClick={() => { setOpen(false); setErr(null); }}
          className="rounded p-0.5 text-zinc-400 hover:text-zinc-600"
          title="Cancelar"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <div className="rounded-xl bg-zinc-50 px-3 py-3 ring-1 ring-zinc-200">
        {/* Stepper */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setValue((v) => stepTemp(v, -0.5, unit.unit_type))}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-zinc-600 ring-1 ring-zinc-200 transition active:bg-zinc-100"
          >
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <div className="relative flex-1">
            <input
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(sanitizeTempInput(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === '-' || e.key === '+' || e.key.toLowerCase() === 'e') e.preventDefault();
                if (e.key === 'Enter') void save();
              }}
              disabled={saving}
              placeholder=""
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-2 text-center text-lg font-black tabular-nums text-zinc-900 outline-none focus:border-[#D32F2F]/60 focus:ring-1 focus:ring-[#D32F2F]/25"
              autoFocus
            />
            {tempParsed !== null && (
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-zinc-400">
                {unit.unit_type === 'congelador' ? '-' : ''}{Math.abs(tempParsed)}°C
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setValue((v) => stepTemp(v, 0.5, unit.unit_type))}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-zinc-600 ring-1 ring-zinc-200 transition active:bg-zinc-100"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Límites hint */}
        {hasLimits && (
          <p className="mt-1.5 text-center text-[10px] font-medium text-zinc-400">
            Rango: {unit.temp_min_c ?? '—'} – {unit.temp_max_c ?? '—'} °C
            {outOfRange && <span className="ml-1.5 font-bold text-red-600">⚠ Fuera de rango</span>}
          </p>
        )}

        {/* Notas colapsables */}
        <button
          type="button"
          onClick={() => setShowNotes((s) => !s)}
          className="mt-2.5 flex w-full items-center gap-1 text-left text-[10px] font-semibold text-zinc-400 hover:text-zinc-600"
        >
          <Plus className={['h-3 w-3 transition-transform', showNotes ? 'rotate-45' : ''].join(' ')} aria-hidden />
          Añadir nota (opcional)
        </button>
        {showNotes && (
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observaciones…"
            className="mt-1.5 h-8 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-xs text-zinc-800 outline-none focus:ring-1 focus:ring-[#D32F2F]/25"
          />
        )}

        {err && <p className="mt-1.5 text-[10px] font-medium text-red-600">{err}</p>}

        {/* Acciones */}
        <div className="mt-3 flex gap-2">
          {reading && (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={saving}
              className="h-9 rounded-lg bg-zinc-200 px-3 text-[12px] font-bold text-zinc-600 transition hover:bg-zinc-300 disabled:opacity-40"
            >
              Quitar
            </button>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || tempParsed === null}
            className="h-9 flex-1 rounded-lg bg-[#D32F2F] text-[12px] font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-[#b71c1c] disabled:opacity-40"
          >
            {saving ? '…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Helpers para notas con nombre embebido
function parseRegistradorFromNotes(notes: string | null | undefined): string {
  if (!notes) return '';
  const m = notes.match(/^\[(.+?)\]/);
  return m ? m[1] : '';
}

function parseRealNotesFromNotes(notes: string | null | undefined): string {
  if (!notes) return '';
  return notes.replace(/^\[.+?\]\s*/, '');
}

// ─── UnitCard ────────────────────────────────────────────────────────────────

function UnitCard({
  unit,
  dateKey,
  map,
  disabled,
  onReadingSaved,
  onReadingDeleted,
  registrador,
}: {
  unit: AppccColdUnitRow;
  dateKey: string;
  map: Map<string, AppccReadingRow>;
  disabled: boolean;
  onReadingSaved: (row: AppccReadingRow) => void;
  onReadingDeleted: (coldUnitId: string, slot: AppccSlot) => void;
  registrador: string;
}) {
  const rM = map.get(`${unit.id}:manana`);
  const rN = map.get(`${unit.id}:noche`);

  const allDone = Boolean(rM && rN);
  const anyDone = Boolean(rM || rN);
  const hasOutOfRange =
    (rM && isTempOutOfRange(rM.temperature_c, unit.temp_min_c, unit.temp_max_c)) ||
    (rN && isTempOutOfRange(rN.temperature_c, unit.temp_min_c, unit.temp_max_c));

  const statusBadge = hasOutOfRange
    ? { label: 'REVISAR', cls: 'bg-orange-100 text-orange-700 ring-orange-200' }
    : allDone
    ? { label: 'OK', cls: 'bg-emerald-100 text-emerald-700 ring-emerald-200' }
    : anyDone
    ? { label: 'PARCIAL', cls: 'bg-amber-100 text-amber-700 ring-amber-200' }
    : { label: 'SIN DATOS', cls: 'bg-zinc-100 text-zinc-500 ring-zinc-200' };

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/80">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100">
            <Thermometer className="h-4 w-4 text-[#D32F2F]" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="font-serif text-[15px] font-bold leading-tight text-zinc-900 truncate">{unit.name}</p>
            <p className="text-[11px] font-medium text-zinc-400">{APPCC_UNIT_TYPE_LABEL[unit.unit_type]}</p>
          </div>
        </div>
        <span
          className={[
            'shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ring-1',
            statusBadge.cls,
          ].join(' ')}
        >
          {statusBadge.label}
        </span>
      </div>

      {/* Slots */}
      <div className="grid grid-cols-2 gap-3 border-t border-zinc-100 px-4 py-3">
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
            registrador={registrador}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main inner component ────────────────────────────────────────────────────

function AppccTemperaturasInner() {
  const searchParams = useSearchParams();
  const { localId, profileReady, localName, localCode } = useAuth();
  const [dateKey, setDateKey] = useState(() => appccTemperaturasOperationalDateKey());
  const [pdfDateFrom, setPdfDateFrom] = useState(() => appccTemperaturasOperationalDateKey());
  const [pdfDateTo, setPdfDateTo] = useState(() => appccTemperaturasOperationalDateKey());
  const [units, setUnits] = useState<AppccColdUnitRow[]>([]);
  const [readings, setReadings] = useState<AppccReadingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [activeZone, setActiveZone] = useState<AppccZone>('cocina');
  const [registrador, setRegistrador] = useState<string>('');
  const [showPdfPanel, setShowPdfPanel] = useState(false);

  useEffect(() => {
    setRegistrador(loadRegistrador());
  }, []);

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
          setBanner('Faltan las tablas APPCC en Supabase. Ejecuta supabase-appcc-schema.sql.');
        } else {
          setBanner(msg);
        }
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

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const ping = () => {
      if (document.visibilityState === 'visible') void loadRef.current({ silent: true });
    };
    document.addEventListener('visibilitychange', ping);
    window.addEventListener('focus', ping);
    const onPageShow = (ev: PageTransitionEvent) => { if (ev.persisted) ping(); };
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appcc_temperature_readings', filter: `local_id=eq.${localId}` }, () => void load({ silent: true }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appcc_cold_units', filter: `local_id=eq.${localId}` }, () => void load({ silent: true }))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [localId, supabaseOk, load]);

  const bySlot = useMemo(() => readingsByUnitAndSlot(readings), [readings]);

  const byZone = useMemo(() => {
    const zones: AppccZone[] = ['cocina', 'barra'];
    return zones.map((z) => ({
      zone: z,
      list: units.filter((u) => u.zone === z),
    }));
  }, [units]);

  // Zones that actually have units
  const activeZones = useMemo(() => byZone.filter(({ list }) => list.length > 0), [byZone]);

  // Badge count: pending slots in each zone
  const pendingByZone = useMemo(() => {
    const result: Record<string, number> = {};
    for (const { zone, list } of byZone) {
      let pending = 0;
      for (const unit of list) {
        for (const slot of TEMP_REGISTRO_SLOTS) {
          if (!bySlot.get(`${unit.id}:${slot}`)) pending++;
        }
      }
      result[zone] = pending;
    }
    return result;
  }, [byZone, bySlot]);

  const disabled = !localId || !profileReady || !supabaseOk || loading || !registrador;
  const localLabel = localName ?? localCode ?? '—';

  const handleDownloadPdf = async () => {
    const orderedUnits = byZone.flatMap(({ list }) => list);
    if (orderedUnits.length === 0) return;
    const from = pdfDateFrom <= pdfDateTo ? pdfDateFrom : pdfDateTo;
    const to = pdfDateFrom <= pdfDateTo ? pdfDateTo : pdfDateFrom;
    const span = enumerateDateKeysInclusive(from, to).length;
    if (span === 0) return;
    if (span > PDF_MAX_DAYS) { setBanner(`El PDF admite máximo ${PDF_MAX_DAYS} días.`); return; }
    setPdfBusy(true);
    setBanner(null);
    try {
      const supabase = getSupabaseClient();
      if (!supabase || !localId) { setBanner('Sesión no disponible.'); return; }
      if (from === to && from === dateKey) {
        downloadAppccTemperaturasPdf({ localLabel, dateKey: from, dateFormatted: formatAppccDateEs(from), orderedUnits, bySlot });
        return;
      }
      const rows = await fetchAppccReadingsInRange(supabase, localId, from, to);
      downloadAppccTemperaturasRangePdf({ localLabel, dateFrom: from, dateTo: to, orderedUnits, readings: rows });
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al generar el PDF.');
    } finally {
      setPdfBusy(false);
    }
  };

  // Ensure active zone is valid
  useEffect(() => {
    if (activeZones.length > 0 && !activeZones.find((z) => z.zone === activeZone)) {
      setActiveZone(activeZones[0].zone);
    }
  }, [activeZones, activeZone]);

  const currentZoneUnits = useMemo(
    () => byZone.find((z) => z.zone === activeZone)?.list ?? [],
    [byZone, activeZone],
  );

  return (
    <div className="space-y-4 pb-8">
      <AppccCompactHero title="Temperaturas" />

      {/* Alertas de configuración */}
      {!isSupabaseEnabled() || !getSupabaseClient() ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Configura <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code> y{' '}
          <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> para usar este módulo.
        </div>
      ) : null}

      {!localId && profileReady ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Tu usuario necesita un perfil con <strong>local</strong> para usar los registros de temperatura.
        </div>
      ) : null}

      {banner ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{banner}</div>
      ) : null}

      {/* ¿Quién registra hoy? */}
      <RegistradorSelector value={registrador} onChange={setRegistrador} />

      {/* Selector de fecha */}
      <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-zinc-200/80">
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Día del registro</p>
          <p className="mt-0.5 text-[13px] font-semibold capitalize text-zinc-900">{formatAppccDateEs(dateKey)}</p>
        </div>
        <div className="relative">
          <span className="pointer-events-none block rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11px] font-bold text-zinc-600">
            Cambiar día
          </span>
          <input
            type="date"
            value={dateKey}
            onChange={(e) => {
              const v = e.target.value;
              setDateKey(v);
              setPdfDateFrom(v);
              setPdfDateTo(v);
            }}
            className="absolute inset-0 min-h-full min-w-full cursor-pointer opacity-0 text-base"
            aria-label="Elegir día"
          />
        </div>
      </div>

      {/* Acciones: historial, PDF, equipos */}
      <div className="flex gap-2">
        <Link
          href="/appcc/historial"
          className="flex-1 flex h-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-[12px] font-bold text-zinc-700 hover:bg-zinc-50"
        >
          Historial
        </Link>
        <button
          type="button"
          onClick={() => setShowPdfPanel((s) => !s)}
          className="flex-1 flex h-9 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white text-[12px] font-bold text-zinc-700 hover:bg-zinc-50"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          PDF
        </button>
        <Link
          href="/appcc/equipos"
          className="flex-1 flex h-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-[12px] font-bold text-zinc-700 hover:bg-zinc-50"
        >
          Equipos
        </Link>
      </div>

      {/* Panel PDF expandible */}
      {showPdfPanel && (
        <div className="rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-4 ring-1 ring-zinc-100">
          <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Exportar PDF</p>
          <p className="mt-1 text-[11px] font-medium text-zinc-500">Máximo {PDF_MAX_DAYS} días por archivo.</p>
          <div className="mt-3 flex gap-4">
            <label className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">Desde</span>
              <input type="date" value={pdfDateFrom} onChange={(e) => setPdfDateFrom(e.target.value)}
                className="h-10 rounded-xl border border-zinc-200 bg-white px-2.5 text-xs font-semibold text-zinc-900 outline-none focus:ring-2 focus:ring-[#D32F2F]/20" />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">Hasta</span>
              <input type="date" value={pdfDateTo} onChange={(e) => setPdfDateTo(e.target.value)}
                className="h-10 rounded-xl border border-zinc-200 bg-white px-2.5 text-xs font-semibold text-zinc-900 outline-none focus:ring-2 focus:ring-[#D32F2F]/20" />
            </label>
          </div>
          <button
            type="button"
            onClick={() => void handleDownloadPdf()}
            disabled={units.length === 0 || pdfBusy}
            className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-zinc-900 text-xs font-bold text-white hover:bg-zinc-800 disabled:opacity-45"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            {pdfBusy ? 'Generando…' : 'Descargar PDF'}
          </button>
        </div>
      )}

      {/* Cuerpo principal */}
      {loading ? (
        <p className="py-8 text-center text-sm text-zinc-400">Cargando…</p>
      ) : units.length === 0 && localId && supabaseOk && !banner ? (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-zinc-800">No hay equipos de frío dados de alta.</p>
          <p className="mt-1 text-xs text-zinc-500">Añádelos en gestión de equipos.</p>
          <Link href="/appcc/equipos" className="mt-4 inline-flex h-9 items-center rounded-xl bg-[#D32F2F] px-5 text-xs font-bold uppercase tracking-wide text-white">
            Ir a equipos
          </Link>
        </div>
      ) : (
        <>
          {/* Tabs de sector */}
          {activeZones.length > 1 && (
            <div className="flex gap-2 rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-zinc-200/80">
              {activeZones.map(({ zone }) => {
                const pending = pendingByZone[zone] ?? 0;
                const isActive = zone === activeZone;
                return (
                  <button
                    key={zone}
                    type="button"
                    onClick={() => setActiveZone(zone)}
                    className={[
                      'flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-bold transition',
                      isActive
                        ? 'bg-zinc-900 text-white shadow-sm'
                        : 'text-zinc-500 hover:bg-zinc-50',
                    ].join(' ')}
                  >
                    {APPCC_ZONE_LABEL[zone]}
                    {pending > 0 && (
                      <span
                        className={[
                          'rounded-full px-1.5 py-0.5 text-[9px] font-black leading-none',
                          isActive ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700',
                        ].join(' ')}
                      >
                        {pending}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Tarjetas de equipos */}
          {!registrador && (
            <p className="rounded-xl border border-zinc-200 bg-zinc-50 py-3 text-center text-[12px] font-semibold text-zinc-400">
              Indica quién registra para poder añadir lecturas
            </p>
          )}
          <div className="space-y-3">
            {currentZoneUnits.length === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-400">No hay equipos en este sector.</p>
            ) : (
              currentZoneUnits.map((unit) => (
                <UnitCard
                  key={unit.id}
                  unit={unit}
                  dateKey={dateKey}
                  map={bySlot}
                  disabled={disabled}
                  onReadingSaved={mergeReading}
                  onReadingDeleted={dropReading}
                  registrador={registrador}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function AppccTemperaturasPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm text-zinc-500">Cargando…</div>}>
      <AppccTemperaturasInner />
    </Suspense>
  );
}
