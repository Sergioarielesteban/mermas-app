'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Download } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { downloadAppccAceiteResumenPdf } from '@/lib/appcc-aceite-pdf';
import {
  APPCC_OIL_EVENT_LABEL,
  type AppccOilEventType,
  type AppccOilEventWithFryer,
  fetchOilEventsInRangeWithFryer,
} from '@/lib/appcc-aceite-supabase';
import { dateKeyDaysAgo, formatAppccDateEs, madridDateKey } from '@/lib/appcc-supabase';

const RANGE_DAYS = 120;

type FilterType = 'all' | AppccOilEventType;

function groupByDate(rows: AppccOilEventWithFryer[]) {
  const map = new Map<string, AppccOilEventWithFryer[]>();
  for (const r of rows) {
    const list = map.get(r.event_date) ?? [];
    list.push(r);
    map.set(r.event_date, list);
  }
  return map;
}

export default function AppccAceiteHistorialPage() {
  const { localId, profileReady, localName, localCode } = useAuth();
  const [rows, setRows] = useState<AppccOilEventWithFryer[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [pdfBusy, setPdfBusy] = useState(false);

  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();
  const to = madridDateKey();
  const from = dateKeyDaysAgo(RANGE_DAYS);
  const [dateFrom, setDateFrom] = useState(from);
  const [dateTo, setDateTo] = useState(to);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!localId || !supabaseOk) {
      setRows([]);
      if (!silent) setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    if (!silent) setLoading(true);
    if (!silent) setErr(null);
    try {
      const data = await fetchOilEventsInRangeWithFryer(
        supabase,
        localId,
        from,
        to,
        filter === 'all' ? 'all' : filter,
      );
      setRows(data);
    } catch (e) {
      if (!silent) {
        setErr(e instanceof Error ? e.message : 'Error al cargar.');
        setRows([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [localId, supabaseOk, from, to, filter]);

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
      .channel(`appcc-oil-hist-${localId}`)
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
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [localId, supabaseOk, load]);

  const localLabel = localName ?? localCode ?? '—';

  const filterLabel =
    filter === 'all' ? 'Todos' : filter === 'cambio' ? 'Solo cambios' : 'Solo filtrados';

  const byDate = useMemo(() => groupByDate(rows), [rows]);
  const sortedDates = useMemo(
    () => [...byDate.keys()].sort((a, b) => b.localeCompare(a)),
    [byDate],
  );

  const handlePdf = () => {
    if (rows.length === 0) return;
    const pdfFrom = dateFrom <= dateTo ? dateFrom : dateTo;
    const pdfTo = dateFrom <= dateTo ? dateTo : dateFrom;
    const filteredRows = rows.filter((r) => r.event_date >= pdfFrom && r.event_date <= pdfTo);
    if (filteredRows.length === 0) {
      setErr('No hay registros en el periodo seleccionado para descargar.');
      return;
    }
    setPdfBusy(true);
    try {
      const sorted = [...filteredRows].sort((a, b) => {
        const d = b.event_date.localeCompare(a.event_date);
        if (d !== 0) return d;
        return b.recorded_at.localeCompare(a.recorded_at);
      });
      downloadAppccAceiteResumenPdf({
        localLabel,
        dateFrom: pdfFrom,
        dateTo: pdfTo,
        events: sorted,
        titleSuffix: filterLabel,
      });
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <MermasStyleHero
        eyebrow="APPCC"
        title="Historial de aceite"
        description={`Últimos ${RANGE_DAYS} días con al menos un registro. Pulsa un día para abrir el registro. Filtra por tipo y descarga un PDF del listado filtrado.`}
      />

      {!localId && profileReady ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Necesitas sesión con local en Supabase.
        </p>
      ) : null}

      {err ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{err}</p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {(['all', 'cambio', 'filtrado'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={[
                'h-9 rounded-lg px-3 text-xs font-bold',
                filter === f
                  ? 'bg-[#D32F2F] text-white'
                  : 'border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50',
              ].join(' ')}
            >
              {f === 'all' ? 'Todos' : APPCC_OIL_EVENT_LABEL[f]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handlePdf}
          disabled={rows.length === 0 || pdfBusy}
          className="inline-flex h-9 items-center justify-center gap-1.5 self-start rounded-lg border border-zinc-900/15 bg-zinc-900 px-3 text-xs font-bold text-white hover:bg-zinc-800 disabled:opacity-45 sm:self-auto"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          {pdfBusy ? 'PDF…' : 'Descargar resumen PDF'}
        </button>
      </div>

      <div className="rounded-xl border border-zinc-100 bg-zinc-50/90 px-3 py-2.5">
        <p className="text-center text-[10px] font-bold uppercase tracking-wide text-zinc-500">Periodo del informe</p>
        <div className="mt-2 flex flex-wrap items-end justify-center gap-3">
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] font-medium text-zinc-500">Desde</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-900 outline-none focus:ring-2 focus:ring-[#D32F2F]/20"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] font-medium text-zinc-500">Hasta</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-900 outline-none focus:ring-2 focus:ring-[#D32F2F]/20"
            />
          </label>
        </div>
      </div>

      <p className="text-center text-[11px] text-zinc-500">
        Periodo: {formatAppccDateEs(from)} – {formatAppccDateEs(to)}
      </p>

      {loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando…</p>
      ) : sortedDates.length === 0 ? (
        <p className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600">
          No hay registros en este periodo con el filtro seleccionado.
        </p>
      ) : (
        <ul className="space-y-2">
          {sortedDates.map((dk) => {
            const list = byDate.get(dk) ?? [];
            const operators = [
              ...new Set(
                list
                  .map((e) => e.operator_name?.trim())
                  .filter((n): n is string => Boolean(n)),
              ),
            ];
            return (
              <li key={dk}>
                <Link
                  href={`/appcc/aceite/registro?d=${encodeURIComponent(dk)}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 ring-1 ring-zinc-100 transition hover:border-zinc-300 hover:bg-zinc-50/80"
                >
                  <div>
                    <p className="text-sm font-bold capitalize text-zinc-900">{formatAppccDateEs(dk)}</p>
                    <p className="text-xs text-zinc-500">
                      {list.length} registro{list.length === 1 ? '' : 's'}
                    </p>
                    {operators.length > 0 ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-zinc-600">
                        {operators.join(' · ')}
                      </p>
                    ) : null}
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
