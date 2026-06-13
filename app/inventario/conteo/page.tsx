'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { markAppResumeModuleRootNavigationIfNeeded } from '@/lib/app-resume-state';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  applyCountAdjustment,
  completeInventoryCountSession,
  fetchInventoryStockRows,
  startInventoryCountSession,
  type InventoryStockRow,
} from '@/lib/inventory-operations-supabase';
import { formatStockQuantity, labelInventoryUnit, parseStockDecimal } from '@/lib/inventory-stock-format';

type SessionDiff = {
  itemId: string;
  name: string;
  unit: string;
  diff: number;
};

export default function InventarioConteoPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const startItemId = searchParams.get('item');
  const { localId, userId, profileReady } = useAuth();
  const [items, setItems] = React.useState<InventoryStockRow[]>([]);
  const [index, setIndex] = React.useState(0);
  const [countedQty, setCountedQty] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [sessionReason, setSessionReason] = React.useState('Conteo semanal');
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [banner, setBanner] = React.useState<string | null>(null);
  const [countSessionId, setCountSessionId] = React.useState<string | null>(null);
  const [reviewedIds, setReviewedIds] = React.useState<Set<string>>(() => new Set());
  const [sessionDiffs, setSessionDiffs] = React.useState<SessionDiff[]>([]);
  const [showSummary, setShowSummary] = React.useState(false);

  React.useEffect(() => {
    if (!localId || !isSupabaseEnabled() || !profileReady) {
      setLoading(false);
      return;
    }
    void (async () => {
      setLoading(true);
      try {
        const supabase = getSupabaseClient();
        if (!supabase) return;
        const rows = await fetchInventoryStockRows(supabase, localId);
        setItems(rows);
        if (startItemId) {
          const idx = rows.findIndex((r) => r.id === startItemId);
          if (idx >= 0) setIndex(idx);
        }
        const session = await startInventoryCountSession(supabase, localId, userId);
        if (session) setCountSessionId(session.id);
      } catch (e) {
        setBanner(e instanceof Error ? e.message : 'No se pudo iniciar el conteo.');
      } finally {
        setLoading(false);
      }
    })();
  }, [localId, profileReady, startItemId, userId]);

  const current = items[index] ?? null;
  const parsedCounted = parseStockDecimal(countedQty);
  const systemQty = current?.quantity_on_hand ?? 0;
  const diff =
    parsedCounted != null && current ? Math.round((parsedCounted - systemQty) * 1000) / 1000 : null;

  const reviewedCount = reviewedIds.size;
  const progressPct = items.length > 0 ? Math.round((reviewedCount / items.length) * 100) : 0;

  React.useEffect(() => {
    setCountedQty('');
    if (!current?.id || !reviewedIds.has(current.id)) setReason('');
  }, [current?.id]);

  const markReviewed = (itemId: string) => {
    setReviewedIds((prev) => new Set(prev).add(itemId));
  };

  const goNext = () => {
    if (index < items.length - 1) setIndex((i) => i + 1);
  };
  const goPrev = () => {
    if (index > 0) setIndex((i) => i - 1);
  };

  const markMatchesAndNext = () => {
    if (!current || busy) return;
    markReviewed(current.id);
    setBanner(null);
    goNext();
  };

  const saveCurrent = async (advance: boolean) => {
    if (!localId || !current) return;
    if (parsedCounted == null || parsedCounted < 0) {
      setBanner('Indica el stock real contado.');
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    setBanner(null);
    try {
      const mov = await applyCountAdjustment(supabase, {
        localId,
        inventoryItemId: current.id,
        countedQuantity: parsedCounted,
        reason: reason.trim() || sessionReason.trim() || 'Conteo rápido',
        countSessionId,
        userId,
      });
      markReviewed(current.id);
      if (mov) {
        const delta = Math.round((parsedCounted - systemQty) * 1000) / 1000;
        setSessionDiffs((prev) => [
          ...prev.filter((d) => d.itemId !== current.id),
          { itemId: current.id, name: current.name, unit: current.unit, diff: delta },
        ]);
        setItems((prev) =>
          prev.map((row) =>
            row.id === current.id
              ? { ...row, quantity_on_hand: mov.new_stock ?? parsedCounted, last_counted_at: new Date().toISOString() }
              : row,
          ),
        );
      }
      if (advance) goNext();
      else setBanner(mov ? 'Ajuste guardado.' : 'Sin diferencia: stock coincide con el sistema.');
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo guardar el conteo.');
    } finally {
      setBusy(false);
    }
  };

  const finishSession = async () => {
    if (localId && countSessionId) {
      const supabase = getSupabaseClient();
      if (supabase) await completeInventoryCountSession(supabase, localId, countSessionId);
    }
    setShowSummary(true);
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-200/70 bg-white px-3 py-4 text-center text-[12px] text-zinc-500 ring-1 ring-zinc-100/80">
        Preparando conteo…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="space-y-2">
        <div className="rounded-2xl border border-dashed border-zinc-200/90 bg-zinc-50/70 px-3 py-4 text-center text-[12px] text-zinc-600 ring-1 ring-zinc-100">
          No hay productos para contar.{' '}
          <Link href="/inventario/valoracion" className="font-bold text-[#B91C1C]">
            Activa productos
          </Link>
          .
        </div>
      </div>
    );
  }

  if (showSummary) {
    return (
      <div className="min-w-0 space-y-2 sm:space-y-2.5">
        <section className="rounded-2xl border border-zinc-200/80 bg-white px-3 py-2.5 shadow-sm ring-1 ring-zinc-100/80">
          <h2 className="text-[14px] font-black text-zinc-950">Conteo terminado</h2>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-2xl bg-zinc-50 px-2 py-2 ring-1 ring-zinc-100">
              <dt className="text-[9px] font-bold uppercase text-zinc-500">Revisados</dt>
              <dd className="font-black tabular-nums text-zinc-900">{reviewedCount}</dd>
            </div>
            <div className="rounded-2xl bg-amber-50/80 px-2 py-2 ring-1 ring-amber-100">
              <dt className="text-[9px] font-bold uppercase text-zinc-500">Diferencias</dt>
              <dd className="font-black tabular-nums text-zinc-900">{sessionDiffs.length}</dd>
            </div>
          </dl>
        </section>

        {sessionDiffs.length > 0 ? (
          <ul className="space-y-1">
            {sessionDiffs.map((d) => (
              <li
                key={d.itemId}
                className="flex items-center justify-between gap-2 rounded-2xl border border-zinc-200/70 bg-white px-2.5 py-2 text-[12px] ring-1 ring-zinc-100/80"
              >
                <span className="min-w-0 truncate font-semibold text-zinc-900">{d.name}</span>
                <span className="shrink-0 font-mono font-bold tabular-nums text-zinc-800">
                  {d.diff > 0 ? '+' : ''}
                  {d.diff} {labelInventoryUnit(d.unit)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-emerald-200/80 bg-emerald-50/60 px-3 py-3 text-center text-[12px] font-medium text-emerald-900 ring-1 ring-emerald-100">
            Sin diferencias en esta sesión. Todo cuadraba o se verificó con ✓ Coincide.
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            markAppResumeModuleRootNavigationIfNeeded(pathname, '/inventario');
            router.push('/inventario');
          }}
          className="min-h-[36px] w-full rounded-2xl bg-[#D32F2F] text-[11px] font-bold text-white"
        >
          Volver a stock
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-2 sm:space-y-2.5">
      <section className="rounded-2xl border border-zinc-200/80 bg-white px-3 py-2 shadow-sm ring-1 ring-zinc-100/80">
        <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-600">
          <span>
            {reviewedCount} / {items.length} productos
          </span>
          <span>{progressPct}%</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-100 ring-1 ring-zinc-200/60">
          <div
            className="h-full rounded-full bg-[#D32F2F] transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <label className="mt-2 block">
          <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">Motivo de sesión</span>
          <input
            type="text"
            value={sessionReason}
            onChange={(e) => setSessionReason(e.target.value)}
            className="mt-0.5 h-8 w-full rounded-xl border border-zinc-200/80 px-2 text-[12px] ring-1 ring-zinc-200/70"
          />
        </label>
      </section>

      {banner ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-950 ring-1 ring-amber-100">
          {banner}
        </div>
      ) : null}

      {current ? (
        <div className="rounded-2xl border border-zinc-200/70 bg-white px-3 py-2.5 shadow-sm ring-1 ring-zinc-100/80">
          <h2 className="truncate text-[14px] font-black leading-tight text-zinc-950">{current.name}</h2>
          {current.format_label ? (
            <p className="mt-0.5 truncate text-[10px] text-zinc-500">{current.format_label}</p>
          ) : null}

          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-2 py-2 ring-1 ring-zinc-100/70">
              <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">Sistema</p>
              <p className="mt-0.5 font-mono text-[15px] font-bold tabular-nums leading-none text-zinc-900">
                {formatStockQuantity(systemQty, current.unit)}
              </p>
            </div>
            <div
              className={[
                'rounded-2xl border px-2 py-2 ring-1',
                diff != null && diff !== 0
                  ? 'border-amber-200/80 bg-amber-50/80 ring-amber-100/80'
                  : 'border-emerald-200/80 bg-emerald-50/60 ring-emerald-100/70',
              ].join(' ')}
            >
              <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">Diferencia</p>
              <p className="mt-0.5 font-mono text-[15px] font-bold tabular-nums leading-none text-zinc-900">
                {diff == null ? '—' : diff === 0 ? '0' : `${diff > 0 ? '+' : ''}${diff}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={markMatchesAndNext}
            className="mt-2.5 inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-2xl border border-emerald-300/80 bg-emerald-50 text-[12px] font-black text-emerald-900 ring-1 ring-emerald-200/70 disabled:opacity-45"
          >
            <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            Coincide — siguiente
          </button>

          <label className="mt-2.5 block">
            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Stock real (solo si difiere)</span>
            <input
              type="text"
              inputMode="decimal"
              value={countedQty}
              onChange={(e) => setCountedQty(e.target.value)}
              disabled={busy}
              className="mt-1 h-11 w-full rounded-2xl border border-zinc-200/80 px-3 text-[18px] font-bold tabular-nums text-zinc-900 ring-1 ring-zinc-200/70"
              placeholder="Solo si no coincide"
            />
          </label>

          {parsedCounted != null && diff != null && diff !== 0 ? (
            <label className="mt-2 block">
              <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Motivo del ajuste</span>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={busy}
                className="mt-1 h-9 w-full rounded-2xl border border-zinc-200/80 px-2.5 text-[13px] ring-1 ring-zinc-200/70"
                placeholder={sessionReason || 'Conteo de turno…'}
              />
            </label>
          ) : null}

          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={busy || index === 0}
              onClick={goPrev}
              className="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-2xl border border-zinc-200 bg-white text-[10px] font-bold text-zinc-700 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Anterior
            </button>
            <button
              type="button"
              disabled={busy || parsedCounted == null}
              onClick={() => void saveCurrent(true)}
              className="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-2xl bg-[#D32F2F] text-[10px] font-bold text-white disabled:opacity-45"
            >
              {busy ? 'Guardando…' : 'Guardar diff →'}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void finishSession()}
        className="min-h-[36px] w-full rounded-2xl border border-zinc-200/80 bg-white text-[11px] font-bold text-zinc-700 ring-1 ring-zinc-200/70"
      >
        Terminar conteo
      </button>
    </div>
  );
}
