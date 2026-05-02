'use client';

import Link from 'next/link';
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Download, Droplet, Filter, RefreshCw } from 'lucide-react';
import AppccCompactHero from '@/components/AppccCompactHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { downloadAppccAceiteResumenPdf } from '@/lib/appcc-aceite-pdf';
import {
  APPCC_OIL_EVENT_LABEL,
  oilEventEffectiveLiters,
  withFilteredExtraLitersTag,
  type AppccFryerRow,
  type AppccOilEventRow,
  type AppccOilEventType,
  type AppccOilEventWithFryer,
  fetchAppccFryers,
  fetchOilEventsForDate,
  fetchOilEventsInRangeWithFryer,
  insertOilEvent,
  updateOilEvent,
} from '@/lib/appcc-aceite-supabase';
import {
  APPCC_ZONE_LABEL,
  enumerateDateKeysInclusive,
  formatAppccDateEs,
  madridDateKey,
  type AppccZone,
} from '@/lib/appcc-supabase';

const PDF_MAX_DAYS = 120;

const LS_OPERATOR_NAME = 'appcc-aceite-operator-name';

function parseLiters(raw: string): number | null {
  const n = Number(String(raw).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function enrichEventsForPdf(events: AppccOilEventRow[], fryers: AppccFryerRow[]): AppccOilEventWithFryer[] {
  const byId = new Map(fryers.map((f) => [f.id, f]));
  return events.map((e) => {
    const f = byId.get(e.fryer_id);
    return {
      ...e,
      fryer: f ? { name: f.name, zone: f.zone } : null,
    };
  });
}

function monthBounds(dateKey: string): { from: string; to: string; monthLabel: string } {
  const [y, m] = dateKey.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  const toKey = (d: Date) => d.toISOString().slice(0, 10);
  return {
    from: toKey(start),
    to: toKey(end),
    monthLabel: start.toLocaleDateString('es-ES', { timeZone: 'UTC', month: 'long', year: 'numeric' }),
  };
}

function FryerOilCard({
  fryer,
  dateKey,
  dayEvents,
  operatorName,
  disabled,
  onEventSaved,
}: {
  fryer: AppccFryerRow;
  dateKey: string;
  dayEvents: AppccOilEventRow[];
  /** Mismo nombre para todas las freidoras del día (campo superior). */
  operatorName: string;
  disabled: boolean;
  onEventSaved: (row: AppccOilEventRow) => void;
}) {
  const { localId } = useAuth();
  const [mode, setMode] = useState<null | AppccOilEventType>(null);
  const [liters, setLiters] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const mine = useMemo(
    () =>
      dayEvents
        .filter((e) => e.fryer_id === fryer.id)
        .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)),
    [dayEvents, fryer.id],
  );
  const latest = mine[mine.length - 1];
  const recordedFiltrado = latest?.event_type === 'filtrado';
  const recordedCambio = latest?.event_type === 'cambio';
  const filtradoBtnOn =
    mode === 'filtrado' || (mode === null && recordedFiltrado);
  const cambioBtnOn = mode === 'cambio' || (mode === null && recordedCambio);

  const resetForm = () => {
    setLiters('');
    setNotes('');
    setErr(null);
  };

  useEffect(() => {
    resetForm();
    setMode(null);
  }, [dateKey, fryer.id]);

  const submit = async (eventType: AppccOilEventType) => {
    setErr(null);
    const supabase = getSupabaseClient();
    if (!supabase || !localId) {
      setErr('Sesión o Supabase no disponible.');
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      setErr('Usuario no identificado.');
      return;
    }
    const trimmedL = liters.trim();
    let litersNum: number | null = null;
    if (trimmedL !== '') {
      const L = parseLiters(trimmedL);
      if (L === null) {
        setErr('Litros no válidos (usa un número ≥ 0 o déjalo vacío).');
        return;
      }
      litersNum = L;
    }
    if (eventType === 'cambio' && litersNum === null) {
      setErr('En un cambio indica los litros de aceite usados (≥ 0).');
      return;
    }
    const op = operatorName.trim();
    if (!op) {
      setErr('Indica arriba quién realiza el registro; sirve para todas las freidoras de este día.');
      return;
    }
    setSaving(true);
    try {
      const baseNotes = notes.trim();
      const save = (litersValue: number | null, notesValue: string) =>
        latest
          ? updateOilEvent(supabase, {
              eventId: latest.id,
              eventType,
              litersUsed: litersValue,
              notes: notesValue,
              operatorName: op,
              userId: user.id,
            })
          : insertOilEvent(supabase, {
              localId,
              fryerId: fryer.id,
              eventType,
              eventDate: dateKey,
              litersUsed: litersValue,
              notes: notesValue,
              operatorName: op,
              userId: user.id,
            });

      let row: AppccOilEventRow;
      try {
        row = await save(litersNum, baseNotes);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        const oldFilteredConstraint = /appcc_oil_events_filtrado_liters_chk/i.test(msg);
        if (!(eventType === 'filtrado' && litersNum != null && oldFilteredConstraint)) {
          throw e;
        }
        row = await save(null, withFilteredExtraLitersTag(baseNotes, litersNum));
      }
      setMode(null);
      resetForm();
      onEventSaved(row);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200/90 bg-zinc-50/90 px-2.5 py-2 ring-1 ring-zinc-100">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-zinc-900">{fryer.name}</p>
          <p className="truncate text-[10px] leading-tight text-zinc-500">{APPCC_ZONE_LABEL[fryer.zone]}</p>
          {latest ? (
            <ul className="mt-1 flex flex-wrap gap-1">
              <li
                key={latest.id}
                title={
                  latest.operator_name?.trim()
                    ? `Realizado por: ${latest.operator_name.trim()}`
                    : undefined
                }
                className={[
                  'inline-flex max-w-full items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold leading-tight ring-1',
                  recordedFiltrado
                    ? 'bg-amber-100 text-amber-950 ring-amber-300/90'
                    : 'bg-emerald-100 text-emerald-950 ring-emerald-300/90',
                ].join(' ')}
              >
                {recordedFiltrado ? (
                  <Filter className="h-3.5 w-3.5 shrink-0 text-amber-800" strokeWidth={2.25} aria-hidden />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 shrink-0 text-emerald-800" strokeWidth={2.25} aria-hidden />
                )}
                <span className="min-w-0 truncate">
                  {APPCC_OIL_EVENT_LABEL[latest.event_type]}
                  {oilEventEffectiveLiters(latest) != null ? ` · ${oilEventEffectiveLiters(latest)} L` : ''}
                </span>
              </li>
            </ul>
          ) : (
            <p className="mt-0.5 text-[9px] text-zinc-400">Sin registros este día</p>
          )}
        </div>
        <Droplet className="h-4 w-4 shrink-0 text-[#D32F2F]/65" aria-hidden />
      </div>

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'filtrado' ? null : 'filtrado');
            setErr(null);
          }}
          disabled={disabled || saving}
          className={[
            'flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-xs font-black uppercase tracking-wide transition',
            filtradoBtnOn
              ? 'bg-amber-500 text-white shadow-sm ring-1 ring-amber-600/40 hover:bg-amber-600'
              : 'border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50',
          ].join(' ')}
        >
          <Filter className="h-3.5 w-3.5 shrink-0 opacity-95" strokeWidth={2.4} aria-hidden />
          <span>Filtrado</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'cambio' ? null : 'cambio');
            setErr(null);
          }}
          disabled={disabled || saving}
          className={[
            'flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-xs font-black uppercase tracking-wide transition',
            cambioBtnOn
              ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-800/25 hover:bg-emerald-700'
              : 'border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50',
          ].join(' ')}
        >
          <RefreshCw className="h-3.5 w-3.5 shrink-0 opacity-95" strokeWidth={2.4} aria-hidden />
          <span>Cambio</span>
        </button>
      </div>

      {mode ? (
        <div className="mt-2 space-y-1.5 border-t border-zinc-100/90 pt-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="text-[9px] font-bold uppercase text-zinc-500">
              Litros{mode === 'filtrado' ? ' (opc.)' : ''}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={liters}
              onChange={(e) => setLiters(e.target.value)}
              disabled={disabled || saving}
              placeholder={mode === 'cambio' ? 'Ej. 10' : 'Opcional'}
              className="h-7 w-[4.5rem] rounded-md border border-zinc-200 bg-white px-1.5 text-xs font-semibold text-zinc-900 outline-none focus:ring-1 focus:ring-[#D32F2F]/40"
            />
            <span className="text-[10px] text-zinc-400">L</span>
          </div>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={disabled || saving}
            placeholder="Notas (opcional)"
            className="h-7 w-full rounded-md border border-zinc-200 bg-white px-1.5 text-[11px] text-zinc-700 outline-none focus:ring-1 focus:ring-[#D32F2F]/30"
          />
          <button
            type="button"
            onClick={() => void submit(mode)}
            disabled={disabled || saving}
            className={[
              'h-8 w-full rounded-lg text-xs font-black uppercase tracking-wide text-white shadow-sm transition disabled:opacity-50',
              mode === 'filtrado' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-700 hover:bg-emerald-800',
            ].join(' ')}
          >
            {saving ? 'Guardando…' : `Registrar ${APPCC_OIL_EVENT_LABEL[mode]}`}
          </button>
        </div>
      ) : null}
      {err ? <p className="mt-1 text-[9px] font-medium text-red-600">{err}</p> : null}
    </div>
  );
}

function AppccAceiteRegistroInner() {
  const searchParams = useSearchParams();
  const { localId, profileReady, localName, localCode } = useAuth();
  const [dateKey, setDateKey] = useState(() => madridDateKey());
  const [operatorName, setOperatorName] = useState('');
  const [fryers, setFryers] = useState<AppccFryerRow[]>([]);
  const [events, setEvents] = useState<AppccOilEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_OPERATOR_NAME);
      if (saved) setOperatorName(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const persistOperatorName = (value: string) => {
    setOperatorName(value);
    try {
      localStorage.setItem(LS_OPERATOR_NAME, value);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const d = searchParams.get('d');
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      setDateKey(d);
    }
  }, [searchParams]);

  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!localId || !supabaseOk) {
      setFryers([]);
      setEvents([]);
      if (!silent) setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    if (!silent) setLoading(true);
    if (!silent) setBanner(null);
    try {
      const [f, ev] = await Promise.all([
        fetchAppccFryers(supabase, localId, true),
        fetchOilEventsForDate(supabase, localId, dateKey),
      ]);
      setFryers(f);
      setEvents(ev);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al cargar datos.';
      if (!silent) {
        if (msg.toLowerCase().includes('relation') || msg.includes('does not exist')) {
          setBanner(
            'Faltan las tablas de aceite en Supabase. Ejecuta supabase-appcc-aceite-schema.sql y añade appcc_fryers y appcc_oil_events a la publicación Realtime si la usas.',
          );
        } else {
          setBanner(msg);
        }
        setFryers([]);
        setEvents([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [dateKey, localId, supabaseOk]);

  const mergeOilEvent = useCallback(
    (row: AppccOilEventRow) => {
      if (row.event_date !== dateKey) return;
      setEvents((prev) => {
        const rest = prev.filter((x) => x.id !== row.id);
        return [...rest, row].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
      });
    },
    [dateKey],
  );

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
      .channel(`appcc-oil-${localId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appcc_oil_events',
          filter: `local_id=eq.${localId}`,
        },
        () => void load({ silent: true }),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appcc_fryers',
          filter: `local_id=eq.${localId}`,
        },
        () => void load({ silent: true }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [localId, supabaseOk, load]);

  const byZone = useMemo(() => {
    const zones: AppccZone[] = ['cocina', 'barra'];
    return zones.map((z) => ({
      zone: z,
      list: fryers.filter((f) => f.zone === z),
    }));
  }, [fryers]);

  const disabled = !localId || !profileReady || !supabaseOk || loading;
  const localLabel = localName ?? localCode ?? '—';

  const handleDownloadPdf = async () => {
    const { from, to, monthLabel } = monthBounds(dateKey);
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
      let enriched: AppccOilEventWithFryer[];
      if (from === to && from === dateKey) {
        enriched = enrichEventsForPdf(events, fryers);
      } else {
        enriched = await fetchOilEventsInRangeWithFryer(supabase, localId, from, to, 'all');
      }
      enriched.sort((a, b) => {
        const dc = a.event_date.localeCompare(b.event_date);
        if (dc !== 0) return dc;
        return a.recorded_at.localeCompare(b.recorded_at);
      });
      if (enriched.length === 0) {
        setBanner('No hay registros de aceite en el periodo seleccionado.');
        return;
      }
      const suffix =
        from === to ? `Día · ${formatAppccDateEs(from)}` : `Mensual · ${monthLabel}`;
      downloadAppccAceiteResumenPdf({
        localLabel,
        dateFrom: from,
        dateTo: to,
        events: enriched,
        titleSuffix: suffix,
      });
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al generar el PDF.');
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <AppccCompactHero title="Aceite en freidoras" />

      {!isSupabaseEnabled() || !getSupabaseClient() ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Configura <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code> y{' '}
          <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> para usar este módulo.
        </div>
      ) : null}

      {!localId && profileReady ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Tu usuario necesita un perfil con <strong>local</strong> en Supabase para registrar aceite.
        </div>
      ) : null}

      {banner ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{banner}</div>
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col items-center text-center">
          <label htmlFor="appcc-aceite-date" className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            Día del registro
          </label>
          <div className="relative mt-1 flex h-10 w-full max-w-[15rem] items-center justify-center rounded-lg border border-zinc-200 bg-white shadow-sm">
            <span className="pointer-events-none px-3 text-center text-sm font-semibold capitalize tracking-tight text-zinc-900">
              {formatAppccDateEs(dateKey)}
            </span>
            <input
              id="appcc-aceite-date"
              type="date"
              value={dateKey}
              onChange={(e) => {
                const v = e.target.value;
                setDateKey(v);
              }}
              className="absolute inset-0 min-h-full min-w-full cursor-pointer opacity-0 text-base"
              aria-label="Elegir día del registro"
            />
          </div>
        </div>
        <div className="mx-auto w-full max-w-sm rounded-xl border border-zinc-100 bg-zinc-50/90 px-3 py-2.5 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">PDF mensual</p>
          <p className="mt-1 text-[11px] font-semibold text-zinc-700">
            Se genera el mes completo del día seleccionado ({monthBounds(dateKey).monthLabel}).
          </p>
          <p className="mt-1.5 text-[10px] text-zinc-400">Incluye total de litros gastados.</p>
        </div>
        <div className="mx-auto w-full max-w-sm px-1">
          <label
            htmlFor="appcc-aceite-operator"
            className="text-[10px] font-bold uppercase tracking-wide text-zinc-500"
          >
            Realizado por
          </label>
          <p className="mb-1 text-[10px] leading-snug text-zinc-400">
            Una vez por día: el mismo nombre se guarda en cada freidora que registres.
          </p>
          <input
            id="appcc-aceite-operator"
            type="text"
            value={operatorName}
            onChange={(e) => persistOperatorName(e.target.value)}
            disabled={!localId || !profileReady}
            placeholder="Ej. María / Turno mañana"
            autoComplete="name"
            className="mt-0.5 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-[#D32F2F]/25"
          />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/appcc/aceite/historial"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-800 hover:bg-zinc-50"
          >
            Historial
          </Link>
          <button
            type="button"
            onClick={() => void handleDownloadPdf()}
            disabled={!localId || !supabaseOk || pdfBusy}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-zinc-900/15 bg-zinc-900 px-3 text-xs font-bold text-white hover:bg-zinc-800 disabled:opacity-45"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            {pdfBusy ? 'PDF…' : 'Descargar PDF'}
          </button>
          <Link
            href="/appcc/aceite/equipos"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-800 hover:bg-zinc-50"
          >
            Freidoras
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando…</p>
      ) : fryers.length === 0 && localId && supabaseOk && !banner ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-6 text-center">
          <p className="text-sm font-semibold text-zinc-800">No hay freidoras dadas de alta.</p>
          <p className="mt-1 text-xs text-zinc-600">Añádelas en la gestión de freidoras.</p>
          <Link
            href="/appcc/aceite/equipos"
            className="mt-3 inline-flex h-9 items-center rounded-lg bg-[#D32F2F] px-4 text-xs font-bold uppercase tracking-wide text-white"
          >
            Ir a freidoras
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {byZone.map(({ zone, list }) =>
            list.length === 0 ? null : (
              <section key={zone}>
                <h2 className="mb-2 text-base font-bold text-zinc-900">{APPCC_ZONE_LABEL[zone]}</h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {list.map((fryer) => (
                    <FryerOilCard
                      key={fryer.id}
                      fryer={fryer}
                      dateKey={dateKey}
                      dayEvents={events}
                      operatorName={operatorName}
                      disabled={disabled}
                      onEventSaved={mergeOilEvent}
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

export default function AppccAceiteRegistroPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm text-zinc-500">Cargando…</div>}>
      <AppccAceiteRegistroInner />
    </Suspense>
  );
}
