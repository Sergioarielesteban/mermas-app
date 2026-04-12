'use client';

import Link from 'next/link';
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, Download, Droplet } from 'lucide-react';
import AppccCompactHero from '@/components/AppccCompactHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { downloadAppccAceiteResumenPdf } from '@/lib/appcc-aceite-pdf';
import {
  APPCC_OIL_EVENT_LABEL,
  type AppccFryerRow,
  type AppccOilEventRow,
  type AppccOilEventType,
  type AppccOilEventWithFryer,
  fetchAppccFryers,
  fetchOilEventsForDate,
  insertOilEvent,
} from '@/lib/appcc-aceite-supabase';
import { APPCC_ZONE_LABEL, formatAppccDateEs, madridDateKey, type AppccZone } from '@/lib/appcc-supabase';

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

function FryerOilCard({
  fryer,
  dateKey,
  dayEvents,
  operatorName,
  disabled,
  onRefresh,
}: {
  fryer: AppccFryerRow;
  dateKey: string;
  dayEvents: AppccOilEventRow[];
  /** Mismo nombre para todas las freidoras del día (campo superior). */
  operatorName: string;
  disabled: boolean;
  onRefresh: () => void;
}) {
  const { localId } = useAuth();
  const [mode, setMode] = useState<null | AppccOilEventType>(null);
  const [liters, setLiters] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const mine = useMemo(() => dayEvents.filter((e) => e.fryer_id === fryer.id), [dayEvents, fryer.id]);

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
      await insertOilEvent(supabase, {
        localId,
        fryerId: fryer.id,
        eventType,
        eventDate: dateKey,
        litersUsed: litersNum,
        notes: notes.trim(),
        operatorName: op,
        userId: user.id,
      });
      setMode(null);
      resetForm();
      onRefresh();
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
          {mine.length > 0 ? (
            <ul className="mt-1 flex flex-wrap gap-1">
              {mine.map((e) => (
                <li
                  key={e.id}
                  title={
                    e.operator_name?.trim()
                      ? `Realizado por: ${e.operator_name.trim()}`
                      : undefined
                  }
                  className="rounded-md bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-600 ring-1 ring-zinc-200/80"
                >
                  {APPCC_OIL_EVENT_LABEL[e.event_type]}
                  {e.liters_used != null ? ` · ${e.liters_used} L` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-0.5 text-[9px] text-zinc-400">Sin registros este día</p>
          )}
        </div>
        <Droplet className="h-4 w-4 shrink-0 text-[#D32F2F]/65" aria-hidden />
      </div>

      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'filtrado' ? null : 'filtrado');
            setErr(null);
          }}
          disabled={disabled || saving}
          className={[
            'h-7 rounded-md px-2 text-[10px] font-bold uppercase tracking-wide',
            mode === 'filtrado' ? 'bg-zinc-800 text-white' : 'border border-zinc-300 bg-white text-zinc-800',
          ].join(' ')}
        >
          Filtrado
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'cambio' ? null : 'cambio');
            setErr(null);
          }}
          disabled={disabled || saving}
          className={[
            'h-7 rounded-md px-2 text-[10px] font-bold uppercase tracking-wide',
            mode === 'cambio' ? 'bg-[#D32F2F] text-white' : 'border border-zinc-300 bg-white text-zinc-800',
          ].join(' ')}
        >
          Cambio
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
            className="h-7 w-full rounded-md bg-[#D32F2F] text-[10px] font-bold uppercase tracking-wide text-white disabled:opacity-50"
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
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setDateKey(d);
  }, [searchParams]);

  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setFryers([]);
      setEvents([]);
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    setLoading(true);
    setBanner(null);
    try {
      const [f, ev] = await Promise.all([
        fetchAppccFryers(supabase, localId, true),
        fetchOilEventsForDate(supabase, localId, dateKey),
      ]);
      setFryers(f);
      setEvents(ev);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al cargar datos.';
      if (msg.toLowerCase().includes('relation') || msg.includes('does not exist')) {
        setBanner(
          'Faltan las tablas de aceite en Supabase. Ejecuta supabase-appcc-aceite-schema.sql y añade appcc_fryers y appcc_oil_events a la publicación Realtime si la usas.',
        );
      } else {
        setBanner(msg);
      }
      setFryers([]);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [dateKey, localId, supabaseOk]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ping = () => {
      if (document.visibilityState === 'visible') void loadRef.current();
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
        () => void load(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appcc_fryers',
          filter: `local_id=eq.${localId}`,
        },
        () => void load(),
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

  const handleDownloadPdf = () => {
    if (events.length === 0) return;
    setPdfBusy(true);
    try {
      const enriched = enrichEventsForPdf(events, fryers);
      enriched.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
      downloadAppccAceiteResumenPdf({
        localLabel,
        dateFrom: dateKey,
        dateTo: dateKey,
        events: enriched,
        titleSuffix: `Día · ${formatAppccDateEs(dateKey)}`,
      });
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/appcc/aceite"
          className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-[#D32F2F]"
        >
          <ChevronLeft className="h-4 w-4" />
          Aceite
        </Link>
      </div>

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
              onChange={(e) => setDateKey(e.target.value)}
              className="absolute inset-0 min-h-full min-w-full cursor-pointer opacity-0 text-base"
              aria-label="Elegir día del registro"
            />
          </div>
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
            onClick={handleDownloadPdf}
            disabled={events.length === 0 || pdfBusy}
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

export default function AppccAceiteRegistroPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm text-zinc-500">Cargando…</div>}>
      <AppccAceiteRegistroInner />
    </Suspense>
  );
}
