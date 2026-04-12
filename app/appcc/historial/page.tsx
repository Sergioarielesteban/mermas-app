'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  formatAppccDateEs,
  fetchAppccReadingsInRange,
  madridDateKey,
  dateKeyDaysAgo,
  type AppccReadingRow,
} from '@/lib/appcc-supabase';

const RANGE_DAYS = 120;

function groupByDate(rows: AppccReadingRow[]) {
  const map = new Map<string, AppccReadingRow[]>();
  for (const r of rows) {
    const list = map.get(r.reading_date) ?? [];
    list.push(r);
    map.set(r.reading_date, list);
  }
  return map;
}

export default function AppccHistorialPage() {
  const { localId, profileReady } = useAuth();
  const [rows, setRows] = useState<AppccReadingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setRows([]);
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    const to = madridDateKey();
    const from = dateKeyDaysAgo(RANGE_DAYS);
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchAppccReadingsInRange(supabase, localId, from, to);
      setRows(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al cargar.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDate = useMemo(() => groupByDate(rows), [rows]);
  const sortedDates = useMemo(
    () => [...byDate.keys()].sort((a, b) => b.localeCompare(a)),
    [byDate],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/appcc"
          className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-[#D32F2F]"
        >
          <ChevronLeft className="h-4 w-4" />
          APPCC
        </Link>
      </div>

      <MermasStyleHero
        eyebrow="APPCC"
        title="Historial de registros"
        description={`Últimos ${RANGE_DAYS} días con al menos una lectura guardada. Pulsa un día para abrir el registro.`}
      />

      {!localId && profileReady ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Necesitas sesión con local en Supabase.
        </p>
      ) : null}

      {err ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{err}</p>
      ) : null}

      {loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando…</p>
      ) : sortedDates.length === 0 ? (
        <p className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600">
          No hay lecturas en este periodo. Registra temperaturas desde el día actual.
        </p>
      ) : (
        <ul className="space-y-2">
          {sortedDates.map((dk) => {
            const list = byDate.get(dk) ?? [];
            return (
              <li key={dk}>
                <Link
                  href={`/appcc/temperaturas?d=${encodeURIComponent(dk)}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 ring-1 ring-zinc-100 transition hover:border-zinc-300 hover:bg-zinc-50/80"
                >
                  <div>
                    <p className="text-sm font-bold capitalize text-zinc-900">{formatAppccDateEs(dk)}</p>
                    <p className="text-xs text-zinc-500">
                      {list.length} lectura{list.length === 1 ? '' : 's'}
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
