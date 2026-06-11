'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  applyCountAdjustment,
  completeInventoryCountSession,
  fetchInventoryStockRows,
  startInventoryCountSession,
  type InventoryStockRow,
} from '@/lib/inventory-operations-supabase';
import { formatStockQuantity, parseStockDecimal } from '@/lib/inventory-stock-format';

export default function InventarioConteoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const startItemId = searchParams.get('item');
  const { localId, userId, profileReady } = useAuth();
  const [items, setItems] = React.useState<InventoryStockRow[]>([]);
  const [index, setIndex] = React.useState(0);
  const [countedQty, setCountedQty] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [banner, setBanner] = React.useState<string | null>(null);
  const [countSessionId, setCountSessionId] = React.useState<string | null>(null);
  const [savedCount, setSavedCount] = React.useState(0);

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

  React.useEffect(() => {
    setCountedQty('');
    setReason('');
  }, [current?.id]);

  const goNext = () => {
    if (index < items.length - 1) setIndex((i) => i + 1);
  };
  const goPrev = () => {
    if (index > 0) setIndex((i) => i - 1);
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
        reason: reason.trim() || 'Conteo rápido',
        countSessionId,
        userId,
      });
      if (mov) {
        setSavedCount((c) => c + 1);
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
    router.push('/inventario');
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

  return (
    <div className="space-y-2 sm:space-y-2.5">
      <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-600">
        <span>
          Producto {index + 1} / {items.length}
        </span>
        <span>{savedCount} ajustes</span>
      </div>

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

          <label className="mt-2.5 block">
            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Stock real</span>
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={countedQty}
              onChange={(e) => setCountedQty(e.target.value)}
              disabled={busy}
              className="mt-1 h-11 w-full rounded-2xl border border-zinc-200/80 px-3 text-[18px] font-bold tabular-nums text-zinc-900 ring-1 ring-zinc-200/70"
              placeholder="0"
            />
          </label>

          <label className="mt-2 block">
            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Motivo</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
              className="mt-1 h-9 w-full rounded-2xl border border-zinc-200/80 px-2.5 text-[13px] ring-1 ring-zinc-200/70"
              placeholder="Conteo de turno…"
            />
          </label>

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
              disabled={busy}
              onClick={() => void saveCurrent(true)}
              className="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-2xl bg-[#D32F2F] text-[10px] font-bold text-white disabled:opacity-45"
            >
              {busy ? 'Guardando…' : 'Guardar →'}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void saveCurrent(false)}
            className="mt-1.5 min-h-[34px] w-full rounded-2xl border border-zinc-200 bg-white text-[10px] font-bold text-zinc-700 disabled:opacity-45"
          >
            Guardar sin avanzar
          </button>
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
