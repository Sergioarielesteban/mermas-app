'use client';

import React, { useCallback, useEffect, useState } from 'react';
import FinanzasDatosEntryShell from '@/components/FinanzasDatosEntryShell';
import { emitFinanzasDataChanged } from '@/lib/finanzas-data-changed';
import { parseOptionalMoney, toYmdLocal } from '@/lib/finanzas-date-period-helpers';
import { FIXED_EXPENSE_CATEGORY_LABEL } from '@/lib/finanzas-fixed-expense-viz';
import {
  deleteFixedExpense,
  fetchFixedExpensesForLocal,
  insertFixedExpense,
  updateFixedExpense,
} from '@/lib/finanzas-economics-supabase';
import type { FixedExpense, FixedExpenseCategory, FixedExpenseFrequency } from '@/lib/finanzas-economics-types';
import { appConfirm } from '@/lib/app-dialog-bridge';
import { getSupabaseClient } from '@/lib/supabase-client';

const CATEGORIES: FixedExpenseCategory[] = [
  'rent',
  'utilities',
  'insurance',
  'software',
  'banking_fees',
  'equipment_lease',
  'marketing',
  'other',
];

const FREQUENCIES: { id: FixedExpenseFrequency; label: string }[] = [
  { id: 'monthly', label: 'Mensual' },
  { id: 'quarterly', label: 'Trimestral' },
  { id: 'yearly', label: 'Anual' },
  { id: 'one_off', label: 'Puntual' },
];

export default function FinanzasDatosGastosFijosPage() {
  return (
    <FinanzasDatosEntryShell
      title="Gastos fijos"
      description="Listado claro: crea, edita, activa o desactiva y elimina. Los puntuales requieren fecha de imputación."
    >
      {({ localId }) => <GastosFijosManager localId={localId} />}
    </FinanzasDatosEntryShell>
  );
}

function GastosFijosManager({ localId }: { localId: string }) {
  const [rows, setRows] = useState<FixedExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<FixedExpenseCategory>('other');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<FixedExpenseFrequency>('monthly');
  const [oneOffDate, setOneOffDate] = useState(toYmdLocal(new Date()));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchFixedExpensesForLocal(getSupabaseClient()!, localId, {
        activeOnly: false,
        limit: 500,
      });
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
    setName('');
    setCategory('other');
    setAmount('');
    setFrequency('monthly');
    setOneOffDate(toYmdLocal(new Date()));
    setMessage(null);
  }

  function startEdit(row: FixedExpense) {
    setEditingId(row.id);
    setName(row.name);
    setCategory(row.category);
    setAmount(String(row.amountEur));
    setFrequency(row.frequency);
    setOneOffDate(row.periodStart ?? toYmdLocal(new Date()));
    setMessage(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const amt = parseOptionalMoney(amount);
      if (amt == null || amt < 0) throw new Error('Indica un importe válido.');
      if (!name.trim()) throw new Error('Indica un nombre.');
      const client = getSupabaseClient()!;
      if (editingId) {
        await updateFixedExpense(client, localId, editingId, {
          name: name.trim(),
          category,
          amountEur: amt,
          frequency,
          periodStart: frequency === 'one_off' ? oneOffDate : null,
          periodEnd: frequency === 'one_off' ? oneOffDate : null,
        });
        setMessage('Gasto actualizado.');
      } else {
        await insertFixedExpense(client, {
          localId,
          name: name.trim(),
          category,
          amountEur: amt,
          frequency,
          active: true,
          periodStart: frequency === 'one_off' ? oneOffDate : null,
          periodEnd: frequency === 'one_off' ? oneOffDate : null,
        });
        setMessage('Gasto creado.');
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

  async function toggleActive(row: FixedExpense) {
    try {
      await updateFixedExpense(getSupabaseClient()!, localId, row.id, { active: !row.active });
      emitFinanzasDataChanged();
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al actualizar.');
    }
  }

  async function onDelete(row: FixedExpense) {
    if (!(await appConfirm(`¿Eliminar «${row.name}»?`))) return;
    try {
      await deleteFixedExpense(getSupabaseClient()!, localId, row.id);
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
        <p className="text-sm font-bold text-zinc-900">{editingId ? 'Editar gasto' : 'Nuevo gasto'}</p>

        <div>
          <label className="text-xs font-bold uppercase text-zinc-500" htmlFor="gf-nombre">
            Nombre
          </label>
          <input
            id="gf-nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${inputCls} mt-1`}
            placeholder="Ej. Alquiler local"
          />
        </div>

        <div>
          <label className="text-xs font-bold uppercase text-zinc-500" htmlFor="gf-cat">
            Categoría
          </label>
          <select
            id="gf-cat"
            value={category}
            onChange={(e) => setCategory(e.target.value as FixedExpenseCategory)}
            className={`${inputCls} mt-1`}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {FIXED_EXPENSE_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold uppercase text-zinc-500" htmlFor="gf-importe">
            Importe (€)
          </label>
          <input
            id="gf-importe"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputCls} mt-1 tabular-nums`}
            placeholder="0,00"
          />
        </div>

        <div>
          <label className="text-xs font-bold uppercase text-zinc-500" htmlFor="gf-freq">
            Frecuencia
          </label>
          <select
            id="gf-freq"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as FixedExpenseFrequency)}
            className={`${inputCls} mt-1`}
          >
            {FREQUENCIES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {frequency === 'one_off' ? (
          <div>
            <label className="text-xs font-bold uppercase text-zinc-500" htmlFor="gf-fecha">
              Fecha (puntual)
            </label>
            <input
              id="gf-fecha"
              type="date"
              value={oneOffDate}
              onChange={(e) => setOneOffDate(e.target.value)}
              className={`${inputCls} mt-1`}
            />
          </div>
        ) : null}

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
            {saving ? 'Guardando…' : editingId ? 'Guardar' : 'Añadir'}
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

      <section aria-label="Listado de gastos fijos">
        <h2 className="text-xs font-black uppercase tracking-wide text-zinc-500">Listado</h2>
        {loading ? <p className="mt-2 text-sm text-zinc-600">Cargando…</p> : null}
        {!loading && rows.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">No hay gastos registrados.</p>
        ) : null}
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm ring-1 ring-zinc-50 sm:flex sm:items-center sm:justify-between sm:gap-3"
            >
              <div className="min-w-0">
                <p className="font-bold text-zinc-900">{row.name}</p>
                <p className="text-sm text-zinc-600">
                  {FIXED_EXPENSE_CATEGORY_LABEL[row.category]} · {FREQUENCIES.find((f) => f.id === row.frequency)?.label ?? row.frequency} ·{' '}
                  <span className="tabular-nums font-semibold">{row.amountEur.toFixed(2)} €</span>
                  {row.frequency === 'one_off' && row.periodStart ? ` · ${row.periodStart}` : null}
                </p>
                <p className="mt-1 text-xs font-bold text-zinc-500">
                  {row.active ? <span className="text-emerald-700">Activo</span> : <span className="text-zinc-500">Inactivo</span>}
                </p>
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
                  onClick={() => void toggleActive(row)}
                  className="min-h-[44px] rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-800"
                >
                  {row.active ? 'Desactivar' : 'Activar'}
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
