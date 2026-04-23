'use client';

import React, { useState } from 'react';
import FinanzasDatosEntryShell from '@/components/FinanzasDatosEntryShell';
import { emitFinanzasDataChanged } from '@/lib/finanzas-data-changed';
import { parseOptionalInt, parseOptionalMoney, toYmdLocal } from '@/lib/finanzas-date-period-helpers';
import { upsertSalesDailyMany } from '@/lib/finanzas-economics-supabase';
import { parseSalesImportCsv } from '@/lib/finanzas-sales-import-parse';
import { getSupabaseClient } from '@/lib/supabase-client';

function todayYmd(): string {
  return toYmdLocal(new Date());
}

export default function FinanzasDatosVentasImportarPage() {
  return (
    <FinanzasDatosEntryShell
      title="Importar ventas"
      description="Pega un CSV (fecha, ventas netas €, tickets opcional) o usa el formulario rápido. Si el día ya existe en tu local, se actualiza."
    >
      {({ localId }) => <VentasImportForm localId={localId} />}
    </FinanzasDatosEntryShell>
  );
}

function VentasImportForm({ localId }: { localId: string }) {
  const [csv, setCsv] = useState('');
  const [dateYmd, setDateYmd] = useState(() => todayYmd());
  const [net, setNet] = useState('');
  const [tickets, setTickets] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inputCls =
    'min-h-[48px] w-full rounded-xl border border-zinc-200 bg-white px-3 text-base font-semibold text-zinc-900 outline-none ring-0 focus:border-[#D32F2F]';

  async function onImportCsv(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const { rows, errors } = parseSalesImportCsv(csv);
      if (rows.length === 0) {
        setError(
          errors.length > 0
            ? errors.slice(0, 6).join(' ')
            : 'No hay filas válidas. Revisa el formato (fecha; ventas; tickets opcional).',
        );
        return;
      }
      await upsertSalesDailyMany(getSupabaseClient()!, localId, rows);
      emitFinanzasDataChanged();
      setMessage(`Ventas importadas correctamente (${rows.length} día${rows.length === 1 ? '' : 's'}).`);
      if (errors.length > 0) {
        setError(`Algunas líneas no se importaron: ${errors.slice(0, 4).join(' ')}${errors.length > 4 ? '…' : ''}`);
      }
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : 'Error al importar.';
      if (/duplicate|unique|23505/i.test(raw)) {
        setError('Hay filas duplicadas para la misma fecha en el CSV, o un conflicto de datos. Revisa el archivo.');
      } else if (/invalid|malformed|csv|formato/i.test(raw) || raw.includes('date')) {
        setError(`Formato o fecha no válidos: ${raw}`);
      } else {
        setError(raw);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onQuickRow(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const netVal = parseOptionalMoney(net);
      const tk = parseOptionalInt(tickets);
      await upsertSalesDailyMany(getSupabaseClient()!, localId, [
        { dateYmd, netSalesEur: netVal, ticketsCount: tk },
      ]);
      emitFinanzasDataChanged();
      setMessage('Ventas importadas correctamente.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ring-1 ring-zinc-100 sm:p-5">
        <h2 className="text-xs font-black uppercase tracking-wide text-zinc-500">Desde CSV</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Separador <strong>;</strong> o <strong>,</strong>. Primera fila puede ser cabecera (fecha, ventas / neto, tickets).
          Fechas: <code className="rounded bg-zinc-100 px-1">YYYY-MM-DD</code> o{' '}
          <code className="rounded bg-zinc-100 px-1">DD/MM/AAAA</code>.
        </p>
        <form onSubmit={onImportCsv} className="mt-4 space-y-3">
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={8}
            className={`${inputCls} min-h-[160px] resize-y py-2 font-mono text-sm`}
            placeholder={'fecha;ventas;tickets\n2026-04-01;1250,50;42\n2026-04-02;980;'}
            autoComplete="off"
          />
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
            disabled={busy || !csv.trim()}
            className="min-h-[52px] w-full rounded-xl bg-[#D32F2F] text-base font-black text-white shadow-sm disabled:opacity-60"
          >
            {busy ? 'Importando…' : 'Importar ventas'}
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ring-1 ring-zinc-100 sm:p-5">
        <h2 className="text-xs font-black uppercase tracking-wide text-zinc-500">Un día (rápido)</h2>
        <form onSubmit={onQuickRow} className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-zinc-500" htmlFor="imp-fecha">
              Fecha
            </label>
            <input
              id="imp-fecha"
              type="date"
              value={dateYmd}
              onChange={(e) => setDateYmd(e.target.value)}
              className={`${inputCls} mt-1`}
              required
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-zinc-500" htmlFor="imp-neto">
              Ventas netas (€)
            </label>
            <input
              id="imp-neto"
              type="text"
              inputMode="decimal"
              value={net}
              onChange={(e) => setNet(e.target.value)}
              className={`${inputCls} mt-1 tabular-nums`}
              placeholder="0,00"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-zinc-500" htmlFor="imp-tk">
              Tickets (opcional)
            </label>
            <input
              id="imp-tk"
              type="number"
              min={0}
              step={1}
              value={tickets}
              onChange={(e) => setTickets(e.target.value)}
              className={`${inputCls} mt-1`}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="min-h-[52px] w-full rounded-xl border-2 border-zinc-900 bg-white text-base font-black text-zinc-900 disabled:opacity-60"
          >
            {busy ? 'Guardando…' : 'Importar este día'}
          </button>
        </form>
      </div>
    </div>
  );
}
