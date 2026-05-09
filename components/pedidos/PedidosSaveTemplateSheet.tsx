'use client';

import React from 'react';
import { Bookmark, X } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase-client';
import { insertPedidoOrderTemplate } from '@/lib/pedidos-order-templates';
import type { PedidoOrder } from '@/lib/pedidos-supabase';
import type { Unit } from '@/lib/types';
import { isDemoMode } from '@/lib/demo-mode';

type Props = {
  open: boolean;
  onClose: () => void;
  localId: string | null | undefined;
  userId: string | null | undefined;
  order: PedidoOrder | null;
  supplierName: string;
  onSaved?: () => void;
  /**
   * Pedido persistido en BD: enlazar plantilla a ese `purchase_orders.id`.
   * `null` = borrador aún no guardado (no enviar UUID ficticio a Supabase).
   * Omitir = usar `order.id` (flujo desde lista de pedidos).
   */
  linkedOrderId?: string | null;
};

export default function PedidosSaveTemplateSheet({
  open,
  onClose,
  localId,
  userId,
  order,
  supplierName,
  onSaved,
  linkedOrderId,
}: Props) {
  const [name, setName] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [localLabel, setLocalLabel] = React.useState('');
  const [favorite, setFavorite] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setName('');
    setCategory('');
    setLocalLabel('');
    setFavorite(false);
  }, [open, order?.id]);

  const handleSave = async () => {
    if (!order || !localId) return;
    const n = name.trim();
    if (!n) {
      setError('Indica un nombre para la plantilla.');
      return;
    }
    const items = order.items
      .filter((it) => it.supplierProductId && it.quantity > 0)
      .map((it) => ({
        supplierProductId: it.supplierProductId,
        productName: it.productName,
        unit: it.unit as Unit,
        quantity: it.quantity,
      }));
    if (items.length === 0) {
      setError('Este pedido no tiene líneas con producto de catálogo.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await insertPedidoOrderTemplate(
        getSupabaseClient(),
        localId,
        userId,
        {
          supplierId: order.supplierId,
          supplierName,
          name: n,
          category: category.trim() || null,
          localLabel: localLabel.trim() || null,
          isFavorite: favorite,
          sourceOrderId: linkedOrderId !== undefined ? linkedOrderId : order.id,
          items,
        },
        isDemoMode(),
      );
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  if (!open || !order) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-template-title"
      onClick={() => !busy && onClose()}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-zinc-100 bg-white px-4 py-3">
          <h2 id="save-template-title" className="text-base font-bold text-zinc-900">
            Guardar como plantilla
          </h2>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-4 pb-5 pt-4">
          <div className="flex justify-center py-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#D32F2F]/12 ring-1 ring-[#D32F2F]/20">
              <Bookmark className="h-8 w-8 text-[#B91C1C]" aria-hidden />
            </div>
          </div>
          <p className="text-center text-[11px] text-zinc-500">
            Solo guardamos artículos y cantidades. Los precios se cargan del catálogo al usar la plantilla.
          </p>

          <label className="mt-4 block">
            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              Nombre de la plantilla <span className="text-[#B91C1C]">*</span>
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Pedido semanal carnes"
              className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm font-medium text-zinc-900 outline-none focus:border-[#D32F2F]/50 focus:ring-2 focus:ring-[#D32F2F]/15"
            />
          </label>

          <div className="mt-3 rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Proveedor</p>
            <p className="mt-0.5 text-sm font-semibold text-zinc-900">{supplierName}</p>
          </div>

          <label className="mt-3 block">
            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Local (opcional)</span>
            <input
              value={localLabel}
              onChange={(e) => setLocalLabel(e.target.value)}
              placeholder="Etiqueta interna (ej. sala, cocina…)"
              className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-900 outline-none focus:border-[#D32F2F]/50 focus:ring-2 focus:ring-[#D32F2F]/15"
            />
          </label>

          <label className="mt-3 block">
            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Categoría (opcional)</span>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Ej. Reposición semanal"
              className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-900 outline-none focus:border-[#D32F2F]/50 focus:ring-2 focus:ring-[#D32F2F]/15"
            />
          </label>

          <label className="mt-4 flex cursor-pointer items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
            <span className="text-sm font-semibold text-zinc-800">Marcar como favorita</span>
            <input
              type="checkbox"
              checked={favorite}
              onChange={(e) => setFavorite(e.target.checked)}
              className="h-5 w-5 accent-[#D32F2F]"
            />
          </label>

          {error ? <p className="mt-3 text-sm font-medium text-[#B91C1C]">{error}</p> : null}

          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSave()}
            className="mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-[#D32F2F] text-sm font-bold text-white shadow-sm ring-1 ring-[#B91C1C]/30 disabled:opacity-60"
          >
            {busy ? 'Guardando…' : 'Guardar plantilla'}
          </button>
        </div>
      </div>
    </div>
  );
}
