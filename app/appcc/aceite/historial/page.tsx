'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
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

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setRows([]);
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    setLoading(true);
    setErr(null);
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
      setErr(e instanceof Error ? e.message : 'Error al cargar.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk, from, to, filter]);

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
      .channel(`appcc-oil-hist-${localId}`)
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
    setPdfBusy(true);
    try {
      const sorted = [...rows].sort((a, b) => {
        const d = b.event_date.localeCompare(a.event_date);
        if (d !== 0) return d;
        return b.recorded_at.localeCompare(a.recorded_at);
      });
      downloadAppccAceiteResumenPdf({
        localLabel,
        dateFrom: from,
        dateTo: to,
        events: sorted,
        titleSuffix: filterLabel,
      });
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/appcc/aceite"
          className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-[#D32F2F]"
        >
          <ChevronLeft className="h-4 w-4" />
          Aceite
        </Link>
      </div>

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
