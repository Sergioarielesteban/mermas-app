'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import FinanzasDatosEntryShell from '@/components/FinanzasDatosEntryShell';
import { emitFinanzasDataChanged } from '@/lib/finanzas-data-changed';
import { toYmdLocal, parseOptionalMoney, parseOptionalInt } from '@/lib/finanzas-date-period-helpers';
import {
  getSalesDailyByDate,
  insertSalesDaily,
  updateSalesDaily,
} from '@/lib/finanzas-economics-supabase';
import { getSupabaseClient } from '@/lib/supabase-client';

function todayYmd(): string {
  return toYmdLocal(new Date());
}

export default function FinanzasDatosVentasPage() {
  return (
    <FinanzasDatosEntryShell
      title="Ventas del día"
      description="Un registro por día: si ya existe, se actualiza. Ventas en neto (€), alineado con el resumen financiero."
    >
      {({ localId }) => <VentasForm localId={localId} />}
    </FinanzasDatosEntryShell>
  );
}

function VentasForm({ localId }: { localId: string }) {
  const [dateYmd, setDateYmd] = useState(todayYmd);
  const [ventasNeto, setVentasNeto] = useState('');
  const [tickets, setTickets] = useState('');
  const [notes, setNotes] = useState('');
  const [existingId, setExistingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDay, setLoadingDay] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDay = useCallback(async () => {
    setLoadingDay(true);
    setError(null);
    setMessage(null);
    try {
      const row = await getSalesDailyByDate(getSupabaseClient()!, localId, dateYmd);
      if (row) {
        setExistingId(row.id);
        setVentasNeto(row.netSalesEur != null ? String(row.netSalesEur) : '');
        setTickets(row.ticketsCount != null ? String(row.ticketsCount) : '');
        setNotes(row.notes ?? '');
      } else {
        setExistingId(null);
        setVentasNeto('');
        setTickets('');
        setNotes('');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el día.');
    } finally {
      setLoadingDay(false);
    }
  }, [localId, dateYmd]);

  useEffect(() => {
    void loadDay();
  }, [loadDay]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const net = parseOptionalMoney(ventasNeto);
      const tk = parseOptionalInt(tickets);
      const client = getSupabaseClient()!;
      if (existingId) {
        await updateSalesDaily(client, localId, existingId, {
          netSalesEur: net,
          ticketsCount: tk,
          notes: notes.trim() || '',
        });
        setMessage('Guardado.');
      } else {
        const created = await insertSalesDaily(client, {
          localId,
          date: dateYmd,
          netSalesEur: net,
          ticketsCount: tk,
          notes: notes.trim() || '',
        });
        setExistingId(created.id);
        setMessage('Creado.');
      }
      emitFinanzasDataChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar.');
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    'min-h-[48px] w-full rounded-xl border border-zinc-200 bg-white px-3 text-base font-semibold text-zinc-900 outline-none ring-0 focus:border-[#D32F2F]';

  return (
    <form onSubmit={onSave} className="max-w-lg space-y-4 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ring-1 ring-zinc-100 sm:p-5">
      <p className="text-sm">
        <Link
          href="/finanzas/datos/ventas/importar"
          className="font-bold text-[#D32F2F] underline underline-offset-2"
        >
          Importar ventas
        </Link>
        <span className="text-zinc-600"> · CSV o varios días en segundos</span>
      </p>
      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-zinc-500" htmlFor="ventas-fecha">
          Fecha
        </label>
        <input
          id="ventas-fecha"
          type="date"
          value={dateYmd}
          onChange={(e) => setDateYmd(e.target.value)}
          className={`${inputCls} mt-1`}
          required
        />
        {loadingDay ? <p className="mt-1 text-xs text-zinc-500">Cargando día…</p> : null}
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-zinc-500" htmlFor="ventas-neto">
          Ventas netas (€)
        </label>
        <input
          id="ventas-neto"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          value={ventasNeto}
          onChange={(e) => setVentasNeto(e.target.value)}
          className={`${inputCls} mt-1 tabular-nums`}
        />
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-zinc-500" htmlFor="ventas-tickets">
          Tickets (opcional)
        </label>
        <input
          id="ventas-tickets"
          type="number"
          min={0}
          step={1}
          placeholder="—"
          value={tickets}
          onChange={(e) => setTickets(e.target.value)}
          className={`${inputCls} mt-1`}
        />
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-zinc-500" htmlFor="ventas-notas">
          Notas (opcional)
        </label>
        <textarea
          id="ventas-notas"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={`${inputCls} mt-1 min-h-[80px] resize-y py-2 text-sm font-medium`}
        />
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div>
      ) : null}
      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
          {message}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={loading || loadingDay}
        className="min-h-[52px] w-full rounded-xl bg-[#D32F2F] text-base font-black text-white shadow-sm disabled:opacity-60"
      >
        {loading ? 'Guardando…' : existingId ? 'Guardar cambios' : 'Guardar día'}
      </button>
      {existingId ? (
        <p className="text-center text-xs text-zinc-500">Registro existente para esta fecha · se actualiza al guardar</p>
      ) : (
        <p className="text-center text-xs text-zinc-500">Nuevo registro para esta fecha</p>
      )}
    </form>
  );
}
