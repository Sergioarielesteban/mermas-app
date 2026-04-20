'use client';

import React, { useCallback, useEffect, useState } from 'react';
import FinanzasDatosEntryShell from '@/components/FinanzasDatosEntryShell';
import { emitFinanzasDataChanged } from '@/lib/finanzas-data-changed';
import { addDaysToYmd, parseOptionalMoney, toYmdLocal } from '@/lib/finanzas-date-period-helpers';
import {
  deleteTaxEntry,
  fetchTaxEntriesInRange,
  insertTaxEntry,
  updateTaxEntry,
} from '@/lib/finanzas-economics-supabase';
import type { TaxEntry, TaxEntryType } from '@/lib/finanzas-economics-types';
import { appConfirm } from '@/lib/app-dialog-bridge';
import { getSupabaseClient } from '@/lib/supabase-client';

const TAX_TYPES: { id: TaxEntryType; label: string }[] = [
  { id: 'iva_repercutido', label: 'IVA repercutido' },
  { id: 'iva_soportado', label: 'IVA soportado' },
  { id: 'impuesto_sociedades', label: 'Impuesto sociedades' },
  { id: 'otro', label: 'Otro' },
];

export default function FinanzasDatosImpuestosPage() {
  return (
    <FinanzasDatosEntryShell
      title="Impuestos"
      description="Asientos manuales por fecha. Sin automatización: solo lo que registres aquí entra en agregados fiscales."
    >
      {({ localId }) => <ImpuestosManager localId={localId} />}
    </FinanzasDatosEntryShell>
  );
}

function ImpuestosManager({ localId }: { localId: string }) {
  const [rows, setRows] = useState<TaxEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [taxType, setTaxType] = useState<TaxEntryType>('iva_repercutido');
  const [amount, setAmount] = useState('');
  const [dateYmd, setDateYmd] = useState(() => toYmdLocal(new Date()));
  const [notes, setNotes] = useState('');

  const [listTo, setListTo] = useState(() => toYmdLocal(new Date()));
  const [listFrom, setListFrom] = useState(() => addDaysToYmd(toYmdLocal(new Date()), -200));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const to = toYmdLocal(new Date());
      const from = addDaysToYmd(to, -200);
      setListTo(to);
      setListFrom(from);
      const list = await fetchTaxEntriesInRange(getSupabaseClient()!, localId, from, to);
      setRows(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar.');
    } finally {
      setLoading(false);
    }
  }, [localId]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setTaxType('iva_repercutido');
    setAmount('');
    setDateYmd(toYmdLocal(new Date()));
    setNotes('');
    setMessage(null);
  }

  function startEdit(row: TaxEntry) {
    setEditingId(row.id);
    setTaxType(row.taxType);
    setAmount(String(row.amountEur));
    setDateYmd(row.date);
    setNotes(row.notes ?? '');
    setMessage(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const amt = parseOptionalMoney(amount);
      if (amt == null) throw new Error('Indica un importe válido.');
      const client = getSupabaseClient()!;
      if (editingId) {
        await updateTaxEntry(client, localId, editingId, {
          taxType,
          amountEur: amt,
          date: dateYmd,
          notes: notes.trim() || '',
        });
        setMessage('Actualizado.');
      } else {
        await insertTaxEntry(client, {
          localId,
          taxType,
          amountEur: amt,
          date: dateYmd,
          notes: notes.trim() || '',
        });
        setMessage('Registrado.');
      }
      emitFinanzasDataChanged();
      resetForm();
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(row: TaxEntry) {
    if (!(await appConfirm('¿Eliminar este asiento?'))) return;
    try {
      await deleteTaxEntry(getSupabaseClient()!, localId, row.id);
      emitFinanzasDataChanged();
      if (editingId === row.id) resetForm();
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al eliminar.');
    }
  }

  const inputCls =
    'min-h-[48px] w-full rounded-xl border border-zinc-200 bg-white px-3 text-base font-semibold text-zinc-900 outline-none focus:border-[#D32F2F]';

  return (
    <div className="space-y-6">
      <form
        onSubmit={onSubmit}
        className="max-w-lg space-y-3 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ring-1 ring-zinc-100 sm:p-5"
      >
        <p className="text-sm font-bold text-zinc-900">{editingId ? 'Editar asiento' : 'Nuevo asiento'}</p>

        <div>
          <label className="text-xs font-bold uppercase text-zinc-500" htmlFor="tx-type">
            Tipo
          </label>
          <select
            id="tx-type"
            value={taxType}
            onChange={(e) => setTaxType(e.target.value as TaxEntryType)}
            className={`${inputCls} mt-1`}
          >
            {TAX_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold uppercase text-zinc-500" htmlFor="tx-importe">
            Importe (€)
          </label>
          <input
            id="tx-importe"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputCls} mt-1 tabular-nums`}
            placeholder="0,00"
          />
        </div>

        <div>
          <label className="text-xs font-bold uppercase text-zinc-500" htmlFor="tx-fecha">
            Fecha
          </label>
          <input
            id="tx-fecha"
            type="date"
            value={dateYmd}
            onChange={(e) => setDateYmd(e.target.value)}
            className={`${inputCls} mt-1`}
            required
          />
        </div>

        <div>
          <label className="text-xs font-bold uppercase text-zinc-500" htmlFor="tx-notas">
            Notas (opcional)
          </label>
          <textarea
            id="tx-notas"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`${inputCls} mt-1 min-h-[72px] py-2 text-sm font-medium`}
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

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="submit"
            disabled={saving}
            className="min-h-[52px] flex-1 rounded-xl bg-[#D32F2F] text-base font-black text-white disabled:opacity-60"
          >
            {saving ? 'Guardando…' : editingId ? 'Guardar' : 'Registrar'}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="min-h-[52px] flex-1 rounded-xl border border-zinc-200 bg-zinc-50 text-sm font-bold text-zinc-800"
            >
              Nuevo
            </button>
          ) : null}
        </div>
      </form>

      <section aria-label="Asientos recientes">
        <h2 className="text-xs font-black uppercase tracking-wide text-zinc-500">
          Últimos movimientos ({listFrom} → {listTo})
        </h2>
        {loading ? <p className="mt-2 text-sm text-zinc-600">Cargando…</p> : null}
        {!loading && rows.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">No hay asientos en este rango.</p>
        ) : null}
        <ul className="mt-3 space-y-2">
          {[...rows].reverse().map((row) => (
            <li
              key={row.id}
              className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm ring-1 ring-zinc-50 sm:flex sm:items-center sm:justify-between sm:gap-3"
            >
              <div className="min-w-0">
                <p className="font-bold text-zinc-900">{TAX_TYPES.find((t) => t.id === row.taxType)?.label ?? row.taxType}</p>
                <p className="text-sm text-zinc-600">
                  {row.date} · <span className="tabular-nums font-semibold">{row.amountEur.toFixed(2)} €</span>
                </p>
                {row.notes ? <p className="mt-1 text-xs text-zinc-500">{row.notes}</p> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 sm:mt-0">
                <button
                  type="button"
                  onClick={() => startEdit(row)}
                  className="min-h-[44px] rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-xs font-bold text-zinc-800"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => void onDelete(row)}
                  className="min-h-[44px] rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-900"
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
