'use client';

import React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import InventarioMovementTimeline from '@/components/inventario/InventarioMovementTimeline';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  fetchInventoryMovements,
  fetchInventoryStockRows,
  type InventoryMovementWithItem,
  type InventoryStockRow,
} from '@/lib/inventory-operations-supabase';

export default function InventarioMovimientosPage() {
  const searchParams = useSearchParams();
  const itemFilter = searchParams.get('item');
  const { localId, profileReady } = useAuth();
  const [movements, setMovements] = React.useState<InventoryMovementWithItem[]>([]);
  const [items, setItems] = React.useState<InventoryStockRow[]>([]);
  const [selectedItemId, setSelectedItemId] = React.useState<string>(itemFilter ?? '');
  const [loading, setLoading] = React.useState(true);
  const [banner, setBanner] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (itemFilter) setSelectedItemId(itemFilter);
  }, [itemFilter]);

  const load = React.useCallback(async () => {
    if (!localId || !isSupabaseEnabled()) {
      setMovements([]);
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      const [mov, stock] = await Promise.all([
        fetchInventoryMovements(supabase, localId, {
          itemId: selectedItemId || undefined,
          limit: 100,
        }),
        fetchInventoryStockRows(supabase, localId),
      ]);
      setMovements(mov);
      setItems(stock);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'No se pudieron cargar los movimientos.');
    } finally {
      setLoading(false);
    }
  }, [localId, selectedItemId]);

  React.useEffect(() => {
    if (!profileReady) return;
    void load();
  }, [profileReady, load]);

  const selectedName = items.find((i) => i.id === selectedItemId)?.name;

  return (
    <div className="space-y-2 sm:space-y-2.5">
      {banner ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-950 ring-1 ring-amber-100">
          {banner}
        </div>
      ) : null}

      <section className="rounded-2xl border border-zinc-200/80 bg-white px-3 py-2.5 shadow-sm ring-1 ring-zinc-100/80">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Producto</span>
          <select
            value={selectedItemId}
            onChange={(e) => setSelectedItemId(e.target.value)}
            className="mt-1 h-9 w-full rounded-2xl border border-zinc-200/80 bg-white px-2.5 text-[13px] font-semibold text-zinc-900 shadow-[0_2px_10px_rgba(0,0,0,0.04)] ring-1 ring-zinc-200/70"
          >
            <option value="">Todos los productos</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {selectedName ? (
          <p className="mt-1.5 text-[10px] text-zinc-500">
            Filtrando: <span className="font-bold text-zinc-800">{selectedName}</span>
          </p>
        ) : null}
      </section>

      <InventarioMovementTimeline movements={movements} loading={loading} />

      <div className="flex justify-center pt-1">
        <Link href="/inventario" className="text-[11px] font-bold text-zinc-600">
          ← Volver a stock
        </Link>
      </div>
    </div>
  );
}
