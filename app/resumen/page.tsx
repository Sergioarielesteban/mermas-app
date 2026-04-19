'use client';

import Link from 'next/link';
import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useMermasStore } from '@/components/MermasStoreProvider';
import { fetchMermaPhotoDataUrlById } from '@/lib/mermas-supabase';
import { downloadMermasReportPdf } from '@/lib/mermas-report-pdf';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { toBusinessDateKey } from '@/lib/business-day';
import { confirmDestructiveOperation } from '@/lib/ops-role-confirm';
import type { MermaMotiveKey } from '@/lib/types';

const MOTIVES: Array<{ key: MermaMotiveKey; label: string }> = [
  { key: 'se-quemo', label: 'SE QUEMÓ' },
  { key: 'mal-estado', label: 'MAL ESTADO' },
  { key: 'cliente-cambio', label: 'EL CLIENTE CAMBIÓ' },
  { key: 'error-cocina', label: 'ERROR DEL EQUIPO' },
  { key: 'sobras-marcaje', label: 'SOBRAS DE MARCAJE' },
  { key: 'cancelado', label: 'CANCELADO' },
];

function motiveLabel(key: string) {
  switch (key) {
    case 'se-quemo':
      return 'SE QUEMÓ';
    case 'mal-estado':
      return 'MAL ESTADO';
    case 'cliente-cambio':
      return 'EL CLIENTE CAMBIÓ';
    case 'error-cocina':
      return 'ERROR DEL EQUIPO';
    case 'sobras-marcaje':
      return 'SOBRAS DE MARCAJE';
    case 'cancelado':
      return 'CANCELADO';
    default:
      return key;
  }
}

export default function ResumenPage() {
  const { localId, profileRole } = useAuth();
  const { mermas, products, updateMerma, removeMerma } = useMermasStore();
  const [productFilter, setProductFilter] = React.useState<string>('all');
  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');
  const [message, setMessage] = React.useState<string | null>(null);
  const [showDeletedBanner, setShowDeletedBanner] = React.useState(false);
  const deletedBannerTimeoutRef = React.useRef<number | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editProductId, setEditProductId] = React.useState('');
  const [editQuantity, setEditQuantity] = React.useState(1);
  const [editMotive, setEditMotive] = React.useState<MermaMotiveKey>('se-quemo');
  const [editNotes, setEditNotes] = React.useState('');
  const [editOccurredAt, setEditOccurredAt] = React.useState('');
  const [photoUrlByMermaId, setPhotoUrlByMermaId] = React.useState<Record<string, string>>({});
  const [photoLoadingId, setPhotoLoadingId] = React.useState<string | null>(null);

  const loadMermaPhoto = React.useCallback(
    async (mermaId: string) => {
      if (!localId || !isSupabaseEnabled()) return;
      const supabase = getSupabaseClient();
      if (!supabase) return;
      setPhotoLoadingId(mermaId);
      try {
        const url = await fetchMermaPhotoDataUrlById(supabase, localId, mermaId);
        if (url) setPhotoUrlByMermaId((prev) => ({ ...prev, [mermaId]: url }));
      } catch {
        setMessage('No se pudo cargar la foto.');
      } finally {
        setPhotoLoadingId(null);
      }
    },
    [localId],
  );

  const filtered = mermas.filter((m) => {
    const date = toBusinessDateKey(m.occurredAt);
    if (productFilter !== 'all' && m.productId !== productFilter) return false;
    if (fromDate && date < fromDate) return false;
    if (toDate && date > toDate) return false;
    return true;
  });

  const totalFiltered = filtered.reduce((acc, row) => acc + row.costEur, 0);
  const groupedByDay = (() => {
    const map = new Map<string, typeof filtered>();
    for (const row of filtered) {
      const key = toBusinessDateKey(row.occurredAt);
      const prev = map.get(key);
      if (prev) prev.push(row);
      else map.set(key, [row]);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dateKey, rows]) => ({
        dateKey,
        rows: rows.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1)),
        total: rows.reduce((sum, r) => sum + r.costEur, 0),
      }));
  })();

  const toInputDateTime = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const fromInputDateTime = (value: string) => {
    if (!value) return new Date().toISOString();
    return new Date(value).toISOString();
  };

  const startEdit = (id: string) => {
    const item = mermas.find((m) => m.id === id);
    if (!item) return;
    setEditingId(id);
    setEditProductId(item.productId);
    setEditQuantity(item.quantity);
    setEditMotive(item.motiveKey);
    setEditNotes(item.notes ?? '');
    setEditOccurredAt(toInputDateTime(item.occurredAt));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditProductId('');
    setEditQuantity(1);
    setEditMotive('se-quemo');
    setEditNotes('');
    setEditOccurredAt('');
  };

  const saveEdit = () => {
    if (!editingId) return;
    const result = updateMerma(editingId, {
      productId: editProductId,
      quantity: Math.max(1, Number(editQuantity || 1)),
      motiveKey: editMotive,
      notes: editNotes,
      occurredAt: fromInputDateTime(editOccurredAt),
    });
    if (!result.ok) {
      setMessage(result.reason ?? 'No se pudo actualizar la merma.');
      return;
    }
    setMessage('Merma actualizada correctamente.');
    cancelEdit();
  };

  const deleteMerma = async (_id: string) => {
    if (!(await confirmDestructiveOperation(profileRole, '¿Confirmar eliminación de esta merma?'))) {
      return;
    }
    const result = await removeMerma(_id);
    setMessage(result.ok ? 'Merma eliminada.' : result.reason ?? 'No se pudo eliminar.');
    if (result.ok) {
      setShowDeletedBanner(true);
      if (deletedBannerTimeoutRef.current) window.clearTimeout(deletedBannerTimeoutRef.current);
      deletedBannerTimeoutRef.current = window.setTimeout(() => {
        setShowDeletedBanner(false);
        deletedBannerTimeoutRef.current = null;
      }, 1000);
    }
  };

  React.useEffect(
    () => () => {
      if (deletedBannerTimeoutRef.current) window.clearTimeout(deletedBannerTimeoutRef.current);
    },
    [],
  );

  const exportPdf = () => {
    const productLabel =
      productFilter === 'all' ? 'Todos los productos' : products.find((p) => p.id === productFilter)?.name ?? '—';
    const fromLabel = fromDate ? new Date(fromDate + 'T12:00:00').toLocaleDateString('es-ES') : 'Sin límite inicial';
    const toLabel = toDate ? new Date(toDate + 'T12:00:00').toLocaleDateString('es-ES') : 'Sin límite final';
    downloadMermasReportPdf({
      rows: filtered,
      products,
      filters: { productLabel, fromLabel, toLabel },
    });
  };

  return (
    <div className="space-y-3">
      <Link
        href="/dashboard"
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-300 bg-white py-2.5 text-sm font-bold text-zinc-800 shadow-sm ring-1 ring-zinc-200/80 transition hover:bg-zinc-50 active:scale-[0.99]"
      >
        <span aria-hidden>←</span>
        Atrás · Mermas
      </Link>
      {showDeletedBanner ? (
        <div className="pointer-events-none fixed inset-0 z-[90] grid place-items-center bg-black/25 px-6">
          <div className="rounded-2xl bg-[#D32F2F] px-7 py-5 text-center shadow-2xl ring-2 ring-white/75">
            <p className="text-xl font-black uppercase tracking-wide text-white">ELIMINADO</p>
          </div>
        </div>
      ) : null}
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Resumen de Operaciones</p>
        <p className="pt-1 text-sm text-zinc-700">Historial de mermas registradas y su impacto economico.</p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            className="h-10 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none"
          >
            <option value="all">Todos los productos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-10 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-10 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none"
            />
          </div>
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={exportPdf}
            className="h-11 w-full rounded-lg bg-[#D32F2F] px-3 text-sm font-extrabold text-white shadow-sm ring-1 ring-red-900/20"
          >
            Descargar informe
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Registros filtrados: {filtered.length} | Valor total: {totalFiltered.toFixed(2)} €
        </p>
      </div>

      {message ? (
        <div className="rounded-xl bg-white p-4 text-sm text-zinc-700 ring-1 ring-zinc-200">{message}</div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="rounded-xl bg-white p-4 text-sm text-zinc-600 ring-1 ring-zinc-200">
          No hay registros para el filtro actual.
        </div>
      ) : null}

      {groupedByDay.map((group) => (
        <details key={group.dateKey} className="rounded-xl bg-white shadow-sm ring-1 ring-zinc-200">
          <summary className="cursor-pointer list-none px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-extrabold uppercase text-zinc-900">
                {new Date(`${group.dateKey}T12:00:00`).toLocaleDateString('es-ES')}
              </p>
              <p className="text-sm font-black text-[#B91C1C]">{group.total.toFixed(2)} €</p>
            </div>
          </summary>
          <div className="space-y-2 border-t border-zinc-200 bg-zinc-50/50 p-3">
            {group.rows.map((m) => {
              const product = products.find((p) => p.id === m.productId);
              const isEditing = editingId === m.id;
              return (
                <div key={m.id} className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
                  {!isEditing ? (
                    <>
                      <p className="text-sm font-extrabold uppercase text-zinc-900">
                        {product?.name ?? 'Producto'}
                      </p>
                      <p className="pt-1 text-sm text-zinc-600">
                        Cantidad: {m.quantity} | Valor: {m.costEur.toFixed(2)} €
                      </p>
                      <p className="pt-1 text-xs text-zinc-600">Motivo: {motiveLabel(m.motiveKey)}</p>
                      <p className="pt-1 text-xs text-zinc-500">
                        {new Date(m.occurredAt).toLocaleString('es-ES')}
                      </p>
                      {m.notes?.trim() ? (
                        <p className="pt-1 text-xs text-zinc-600">Nota: {m.notes.trim()}</p>
                      ) : null}
                      {m.motiveKey === 'mal-estado' ? (
                        <div className="mt-2 space-y-2">
                          {m.photoDataUrl || photoUrlByMermaId[m.id] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={m.photoDataUrl ?? photoUrlByMermaId[m.id]}
                              alt="Evidencia merma"
                              className="max-h-40 w-auto rounded-lg border border-zinc-200 object-contain"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => void loadMermaPhoto(m.id)}
                              disabled={photoLoadingId === m.id || !localId}
                              className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 disabled:opacity-50"
                            >
                              {photoLoadingId === m.id ? 'Cargando foto…' : 'Cargar foto'}
                            </button>
                          )}
                        </div>
                      ) : null}
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(m.id)}
                          className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void deleteMerma(m.id);
                          }}
                          className="h-9 rounded-lg bg-red-600 px-3 text-xs font-bold text-white"
                        >
                          Eliminar
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <select
                        value={editProductId}
                        onChange={(e) => setEditProductId(e.target.value)}
                        className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        value={editQuantity}
                        onChange={(e) => setEditQuantity(Number(e.target.value || 1))}
                        className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none"
                      />
                      <select
                        value={editMotive}
                        onChange={(e) => setEditMotive(e.target.value as MermaMotiveKey)}
                        className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none"
                      >
                        {MOTIVES.map((item) => (
                          <option key={item.key} value={item.key}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="datetime-local"
                        value={editOccurredAt}
                        onChange={(e) => setEditOccurredAt(e.target.value)}
                        className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none"
                      />
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        rows={2}
                        placeholder="Notas..."
                        className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={saveEdit}
                          className="h-9 rounded-lg bg-[#D32F2F] px-3 text-xs font-bold text-white"
                        >
                          Guardar cambios
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}

