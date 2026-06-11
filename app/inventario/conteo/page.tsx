'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ModuleHeader from '@/components/ModuleHeader';
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
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
        Preparando conteo…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <ModuleHeader title="Conteo rápido" dense />
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-8 text-center text-sm text-zinc-600">
          No hay productos para contar.{' '}
          <Link href="/inventario/valoracion" className="font-bold text-[#D32F2F] underline">
            Activa productos
          </Link>
          .
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ModuleHeader title="Conteo rápido" dense />

      <div className="flex items-center justify-between text-xs font-semibold text-zinc-600">
        <span>
          Producto {index + 1} / {items.length}
        </span>
        <span>{savedCount} ajustes en esta sesión</span>
      </div>

      {banner ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          {banner}
        </div>
      ) : null}

      {current ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold text-zinc-900">{current.name}</h2>
          {current.format_label ? (
            <p className="mt-0.5 text-xs text-zinc-500">{current.format_label}</p>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-zinc-50 px-3 py-3 ring-1 ring-zinc-100">
              <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Stock sistema</p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums text-zinc-900">
                {formatStockQuantity(systemQty, current.unit)}
              </p>
            </div>
            <div
              className={[
                'rounded-xl px-3 py-3 ring-1',
                diff != null && diff !== 0 ? 'bg-amber-50 ring-amber-200/70' : 'bg-emerald-50/60 ring-emerald-200/60',
              ].join(' ')}
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Diferencia</p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums text-zinc-900">
                {diff == null ? '—' : diff === 0 ? '0' : `${diff > 0 ? '+' : ''}${diff}`}
              </p>
            </div>
          </div>

          <label className="mt-4 block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Stock real contado</span>
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={countedQty}
              onChange={(e) => setCountedQty(e.target.value)}
              disabled={busy}
              className="mt-1 h-14 w-full rounded-2xl border border-zinc-200 px-4 text-2xl font-extrabold tabular-nums text-zinc-900"
              placeholder="0"
            />
          </label>

          <label className="mt-3 block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Motivo del ajuste</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
              className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm"
              placeholder="Conteo de turno, merma no registrada…"
            />
          </label>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy || index === 0}
              onClick={goPrev}
              className="inline-flex h-11 items-center justify-center gap-1 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-800 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden /> Anterior
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveCurrent(true)}
              className="inline-flex h-11 items-center justify-center gap-1 rounded-xl bg-[#D32F2F] text-xs font-bold text-white disabled:opacity-45"
            >
              {busy ? 'Guardando…' : 'Guardar y siguiente'}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void saveCurrent(false)}
            className="mt-2 h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50 text-xs font-bold text-zinc-800 disabled:opacity-45"
          >
            Guardar sin avanzar
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void finishSession()}
        className="h-10 w-full rounded-xl border border-zinc-300 bg-white text-xs font-bold text-zinc-700"
      >
        Terminar conteo
      </button>
    </div>
  );
}
