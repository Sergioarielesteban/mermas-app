'use client';

import React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ModuleHeader from '@/components/ModuleHeader';
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
    <div className="space-y-4">
      <ModuleHeader title="Movimientos" dense />

      {banner ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          {banner}
        </div>
      ) : null}

      <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Filtrar por producto</span>
          <select
            value={selectedItemId}
            onChange={(e) => setSelectedItemId(e.target.value)}
            className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900"
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
          <p className="mt-2 text-xs text-zinc-600">
            Mostrando movimientos de <span className="font-bold text-zinc-900">{selectedName}</span>
          </p>
        ) : null}
      </div>

      <InventarioMovementTimeline movements={movements} loading={loading} />

      <div className="flex justify-center pt-2">
        <Link href="/inventario" className="text-xs font-bold text-zinc-600 underline">
          Volver a stock
        </Link>
      </div>
    </div>
  );
}
