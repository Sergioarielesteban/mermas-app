'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React from 'react';
import { AlertTriangle, Package, Search, Truck } from 'lucide-react';
import ModuleHeader from '@/components/ModuleHeader';
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
    <div className="space-y-4">
      <ModuleHeader title="Stock actual" dense />

      {banner ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          {banner}
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Productos</p>
          <p className="text-xl font-extrabold tabular-nums text-zinc-900">{items.length}</p>
        </div>
        <button
          type="button"
          onClick={() => setFilter((f) => (f === 'alerts' ? 'all' : 'alerts'))}
          className={[
            'rounded-2xl border px-3 py-2.5 text-left shadow-sm',
            filter === 'alerts' ? 'border-amber-300 bg-amber-50' : 'border-zinc-200 bg-white',
          ].join(' ')}
        >
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            <AlertTriangle className="h-3 w-3" aria-hidden /> Alertas
          </p>
          <p className="text-xl font-extrabold tabular-nums text-zinc-900">{alertCount}</p>
        </button>
        <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 shadow-sm">
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            <Truck className="h-3 w-3" aria-hidden /> Enlace pedidos
          </p>
          <p className="text-xl font-extrabold tabular-nums text-zinc-900">{linkedCount}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 text-[11px] text-emerald-900">
        <span className="font-bold">Recepción de pedidos:</span> preparada para generar entradas automáticas cuando el
        artículo de inventario está enlazado al artículo proveedor. Configura enlaces en{' '}
        <Link href="/inventario/valoracion" className="font-bold underline">
          Valoración
        </Link>
        .
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto…"
          className="h-11 w-full rounded-2xl border border-zinc-200 bg-white pl-9 pr-3 text-sm shadow-sm outline-none ring-0 focus:border-zinc-300"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/inventario/conteo"
          className="inline-flex h-10 items-center rounded-xl bg-[#D32F2F] px-4 text-xs font-bold text-white shadow-sm"
        >
          Conteo rápido
        </Link>
        <Link
          href="/inventario/movimientos"
          className="inline-flex h-10 items-center rounded-xl border border-zinc-200 bg-white px-4 text-xs font-bold text-zinc-800"
        >
          Ver movimientos
        </Link>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          Cargando stock…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-8 text-center">
          <Package className="mx-auto h-8 w-8 text-zinc-400" aria-hidden />
          <p className="mt-2 text-sm font-semibold text-zinc-700">
            {items.length === 0 ? 'No hay productos en inventario todavía.' : 'Ningún producto coincide con el filtro.'}
          </p>
          {items.length === 0 ? (
            <Link href="/inventario/valoracion" className="mt-3 inline-block text-xs font-bold text-[#D32F2F] underline">
              Activar productos desde Valoración
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
