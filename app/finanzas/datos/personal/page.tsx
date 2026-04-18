'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import FinanzasDatosEntryShell from '@/components/FinanzasDatosEntryShell';
import { emitFinanzasDataChanged } from '@/lib/finanzas-data-changed';
import {
  monthBoundsFromMonthInput,
  parseOptionalMoney,
  toYmdLocal,
  weekBoundsFromYmd,
} from '@/lib/finanzas-date-period-helpers';
import {
  fetchStaffCostsPeriodOverlappingRange,
  insertStaffCostsPeriod,
  updateStaffCostsPeriod,
} from '@/lib/finanzas-economics-supabase';
import type { StaffCostPeriodType } from '@/lib/finanzas-economics-types';
import { getSupabaseClient } from '@/lib/supabase-client';

function currentMonthInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function FinanzasDatosPersonalPage() {
  return (
    <FinanzasDatosEntryShell
      title="Coste de personal"
      description="Indica nómina, Seg. Social y extras; el total se calcula en base de datos. Elige semana (lunes–domingo) o mes natural."
    >
      {({ localId }) => <PersonalForm localId={localId} />}
    </FinanzasDatosEntryShell>
  );
}

function PersonalForm({ localId }: { localId: string }) {
  const [mode, setMode] = useState<'weekly' | 'monthly'>('weekly');
  const [weekRef, setWeekRef] = useState(toYmdLocal(new Date()));
  const [monthRef, setMonthRef] = useState(currentMonthInput());
  const [nomina, setNomina] = useState('');
  const [ss, setSs] = useState('');
  const [extras, setExtras] = useState('');
  const [notes, setNotes] = useState('');
  const [existingId, setExistingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPeriod, setLoadingPeriod] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bounds = useMemo(() => {
    if (mode === 'weekly') return weekBoundsFromYmd(weekRef);
    return monthBoundsFromMonthInput(monthRef);
  }, [mode, weekRef, monthRef]);

  const periodType: StaffCostPeriodType = mode === 'weekly' ? 'weekly' : 'monthly';

  const totalPreview = useMemo(() => {
    const a = parseOptionalMoney(nomina) ?? 0;
    const b = parseOptionalMoney(ss) ?? 0;
    const c = parseOptionalMoney(extras) ?? 0;
    return Math.round((a + b + c) * 100) / 100;
  }, [nomina, ss, extras]);

  const loadPeriod = useCallback(async () => {
    setLoadingPeriod(true);
    setError(null);
    setMessage(null);
    try {
      const client = getSupabaseClient()!;
      const rows = await fetchStaffCostsPeriodOverlappingRange(
        client,
        localId,
        bounds.start,
        bounds.end,
      );
      const hit = rows.find(
        (r) =>
          r.periodType === periodType && r.periodStart === bounds.start && r.periodEnd === bounds.end,
      );
      if (hit) {
        setExistingId(hit.id);
        setNomina(hit.laborCostEur != null ? String(hit.laborCostEur) : '');
        setSs(hit.ssCostEur != null ? String(hit.ssCostEur) : '');
        setExtras(hit.otherStaffCostEur != null ? String(hit.otherStaffCostEur) : '');
        setNotes(hit.notes ?? '');
      } else {
        setExistingId(null);
        setNomina('');
        setSs('');
        setExtras('');
        setNotes('');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el periodo.');
    } finally {
      setLoadingPeriod(false);
    }
  }, [localId, bounds.start, bounds.end, periodType]);

  useEffect(() => {
    void loadPeriod();
  }, [loadPeriod]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const client = getSupabaseClient()!;
      const labor = parseOptionalMoney(nomina);
      const ssN = parseOptionalMoney(ss);
      const ex = parseOptionalMoney(extras);
      if (existingId) {
        await updateStaffCostsPeriod(client, localId, existingId, {
          laborCostEur: labor,
          ssCostEur: ssN,
          otherStaffCostEur: ex,
          notes: notes.trim() || '',
        });
        setMessage('Guardado.');
      } else {
        const created = await insertStaffCostsPeriod(client, {
          localId,
          periodType,
          periodStart: bounds.start,
          periodEnd: bounds.end,
          laborCostEur: labor,
          ssCostEur: ssN,
          otherStaffCostEur: ex,
          notes: notes.trim() || '',
        });
        setExistingId(created.id);
        setMessage('Creado.');
      }
      emitFinanzasDataChanged();
      void loadPeriod();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar.');
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    'min-h-[48px] w-full rounded-xl border border-zinc-200 bg-white px-3 text-base font-semibold text-zinc-900 outline-none focus:border-[#D32F2F]';

  return (
    <form onSubmit={onSave} className="max-w-lg space-y-4 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ring-1 ring-zinc-100 sm:p-5">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('weekly')}
          className={[
            'min-h-[48px] flex-1 rounded-xl text-sm font-black',
            mode === 'weekly' ? 'bg-[#D32F2F] text-white' : 'border border-zinc-200 bg-zinc-50 text-zinc-800',
          ].join(' ')}
        >
          Semana
        </button>
        <button
          type="button"
          onClick={() => setMode('monthly')}
          className={[
            'min-h-[48px] flex-1 rounded-xl text-sm font-black',
            mode === 'monthly' ? 'bg-[#D32F2F] text-white' : 'border border-zinc-200 bg-zinc-50 text-zinc-800',
          ].join(' ')}
        >
          Mes
        </button>
      </div>

      {mode === 'weekly' ? (
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-zinc-500" htmlFor="per-week">
            Semana (elige un día; se usa lunes–domingo que lo contiene)
          </label>
          <input
            id="per-week"
            type="date"
            value={weekRef}
            onChange={(e) => setWeekRef(e.target.value)}
            className={`${inputCls} mt-1`}
          />
        </div>
      ) : (
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-zinc-500" htmlFor="per-month">
            Mes
          </label>
          <input
            id="per-month"
            type="month"
            value={monthRef}
            onChange={(e) => setMonthRef(e.target.value)}
            className={`${inputCls} mt-1`}
          />
        </div>
      )}

      <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
        <span className="font-bold text-zinc-900">Periodo:</span> {bounds.start} → {bounds.end}
        {loadingPeriod ? <span className="ml-2 text-xs text-zinc-500">Cargando…</span> : null}
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-zinc-500" htmlFor="nomina">
          Nómina (€)
        </label>
        <input
          id="nomina"
          type="text"
          inputMode="decimal"
          value={nomina}
          onChange={(e) => setNomina(e.target.value)}
          className={`${inputCls} mt-1 tabular-nums`}
          placeholder="0,00"
        />
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-zinc-500" htmlFor="ss">
          Seguridad social (€)
        </label>
        <input
          id="ss"
          type="text"
          inputMode="decimal"
          value={ss}
          onChange={(e) => setSs(e.target.value)}
          className={`${inputCls} mt-1 tabular-nums`}
          placeholder="0,00"
        />
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-zinc-500" htmlFor="extras">
          Extras (€)
        </label>
        <input
          id="extras"
          type="text"
          inputMode="decimal"
          value={extras}
          onChange={(e) => setExtras(e.target.value)}
          className={`${inputCls} mt-1 tabular-nums`}
          placeholder="0,00"
        />
      </div>

      <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-3 py-3">
        <p className="text-xs font-bold uppercase text-emerald-900">Total estimado (pantalla)</p>
        <p className="mt-1 text-2xl font-black tabular-nums text-emerald-950">{totalPreview.toFixed(2)} €</p>
        <p className="mt-1 text-[11px] text-emerald-900/90">
          En base de datos el total es la suma de nómina + SS + extras (columna generada).
        </p>
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-zinc-500" htmlFor="per-notas">
          Notas (opcional)
        </label>
        <textarea
          id="per-notas"
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

      <button
        type="submit"
        disabled={loading || loadingPeriod}
        className="min-h-[52px] w-full rounded-xl bg-[#D32F2F] text-base font-black text-white shadow-sm disabled:opacity-60"
      >
        {loading ? 'Guardando…' : existingId ? 'Guardar periodo' : 'Crear periodo'}
      </button>
    </form>
  );
}
