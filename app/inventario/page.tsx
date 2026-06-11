'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React from 'react';
import { AlertTriangle, Package, Search, Truck } from 'lucide-react';
import InventarioStockCard from '@/components/inventario/InventarioStockCard';
import InventarioAdjustSheet from '@/components/inventario/InventarioAdjustSheet';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  applyManualStockAdjustment,
  fetchInventoryStockRows,
  fetchLastMovementByItemIds,
  type InventoryMovement,
  type InventoryStockRow,
} from '@/lib/inventory-operations-supabase';
import { resolveStockStatus } from '@/lib/inventory-stock-format';

export default function InventarioStockPage() {
  const router = useRouter();
  const { localId, userId, profileReady } = useAuth();
  const [items, setItems] = React.useState<InventoryStockRow[]>([]);
  const [lastByItem, setLastByItem] = React.useState<Map<string, InventoryMovement>>(new Map());
  const [loading, setLoading] = React.useState(true);
  const [banner, setBanner] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState<'all' | 'alerts'>('all');
  const [adjustItem, setAdjustItem] = React.useState<InventoryStockRow | null>(null);
  const [adjustBusy, setAdjustBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!localId || !isSupabaseEnabled()) {
      setItems([]);
      setLastByItem(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      const rows = await fetchInventoryStockRows(supabase, localId);
      setItems(rows);
      const last = await fetchLastMovementByItemIds(
        supabase,
        localId,
        rows.map((r) => r.id),
      );
      setLastByItem(last);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudo cargar el stock.');
    } finally {
      setLoading(false);
    }
  }, [localId]);

  React.useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === 'alerts') {
        const st = resolveStockStatus(item.quantity_on_hand, item.min_stock);
        if (st === 'ok') return false;
      }
      if (!q) return true;
      return item.name.toLowerCase().includes(q);
    });
  }, [items, search, filter]);

  const alertCount = React.useMemo(
    () => items.filter((i) => resolveStockStatus(i.quantity_on_hand, i.min_stock) !== 'ok').length,
    [items],
  );

  const linkedCount = React.useMemo(() => items.filter((i) => i.supplierProductId).length, [items]);

  return (
    <div className="min-w-0 space-y-2 sm:space-y-2.5">
      {banner ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-950 ring-1 ring-amber-100">
          {banner}
        </div>
      ) : null}

      <section className="rounded-2xl border border-zinc-200/80 bg-white px-3 py-2.5 shadow-sm ring-1 ring-zinc-100/80">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-zinc-600">
          <span className="text-zinc-900">{items.length} productos</span>
          <button
            type="button"
            onClick={() => setFilter((f) => (f === 'alerts' ? 'all' : 'alerts'))}
            className={[
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 transition',
              filter === 'alerts'
                ? 'bg-amber-50 text-amber-900 ring-amber-200/80'
                : 'bg-zinc-50 text-zinc-700 ring-zinc-200/80 hover:bg-zinc-100/80',
            ].join(' ')}
          >
            <AlertTriangle className="h-3 w-3" aria-hidden />
            {alertCount} alertas
          </button>
          <span className="inline-flex items-center gap-1">
            <Truck className="h-3 w-3 text-zinc-400" aria-hidden />
            {linkedCount} enlace pedidos
          </span>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-zinc-500">
          Recepción de pedidos generará entradas cuando el artículo esté enlazado. Configura en{' '}
          <Link href="/inventario/valoracion" className="font-bold text-[#B91C1C]">
            Valoración
          </Link>
          .
        </p>
      </section>

      <div className="grid min-w-0 grid-cols-1 gap-2">
        <div className="relative min-w-0 w-full">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto…"
            className="h-9 w-full min-w-0 rounded-2xl border border-zinc-200/80 bg-white pl-8 pr-3 text-[13px] shadow-[0_2px_10px_rgba(0,0,0,0.04)] ring-1 ring-zinc-200/70 outline-none focus:ring-[#D32F2F]/15"
          />
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <Link
            href="/inventario/conteo"
            className="inline-flex h-9 min-w-0 items-center justify-center rounded-2xl bg-[#D32F2F] px-2 text-[11px] font-bold text-white shadow-[0_10px_20px_rgba(211,47,47,0.12)]"
          >
            Conteo
          </Link>
          <Link
            href="/inventario/movimientos"
            className="inline-flex h-9 min-w-0 items-center justify-center rounded-2xl border border-zinc-200/80 bg-white px-2 text-[11px] font-bold text-zinc-800 shadow-[0_2px_10px_rgba(0,0,0,0.04)] ring-1 ring-zinc-200/70"
          >
            Movimientos
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-zinc-200/70 bg-white px-3 py-5 text-center text-[12px] text-zinc-500 ring-1 ring-zinc-100/80">
          Cargando stock…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200/90 bg-zinc-50/70 px-3 py-5 text-center ring-1 ring-zinc-100">
          <Package className="mx-auto h-6 w-6 text-zinc-400" aria-hidden />
          <p className="mt-1.5 text-[12px] font-semibold text-zinc-700">
            {items.length === 0 ? 'No hay productos en inventario todavía.' : 'Ningún producto coincide con el filtro.'}
          </p>
          {items.length === 0 ? (
            <Link href="/inventario/valoracion" className="mt-2 inline-block text-[11px] font-bold text-[#B91C1C]">
              Activar productos en Valoración →
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <InventarioStockCard
              key={item.id}
              item={item}
              lastMovement={lastByItem.get(item.id) ?? null}
              onAdjust={setAdjustItem}
              onCount={(row) => {
                router.push(`/inventario/conteo?item=${row.id}`);
              }}
            />
          ))}
        </div>
      )}

      <InventarioAdjustSheet
        item={adjustItem}
        open={adjustItem != null}
        busy={adjustBusy}
        onClose={() => !adjustBusy && setAdjustItem(null)}
        onSubmit={async (payload) => {
          if (!localId || !adjustItem) return;
          const supabase = getSupabaseClient();
          if (!supabase) return;
          setAdjustBusy(true);
          setBanner(null);
          try {
            await applyManualStockAdjustment(supabase, {
              localId,
              inventoryItemId: adjustItem.id,
              direction: payload.direction,
              quantity: payload.quantity,
              movementType: payload.movementType,
              reason: payload.reason,
              notes: payload.notes || null,
              userId,
            });
            setAdjustItem(null);
            await load();
          } catch (e) {
            setBanner(e instanceof Error ? e.message : 'No se pudo guardar el ajuste.');
          } finally {
            setAdjustBusy(false);
          }
        }}
      />
    </div>
  );
}
