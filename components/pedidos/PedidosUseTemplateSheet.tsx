'use client';

import React from 'react';
import { Bookmark, Search, Star, X } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase-client';
import { fetchPedidoOrderTemplates, type PedidoOrderTemplateListItem } from '@/lib/pedidos-order-templates';
import { isDemoMode } from '@/lib/demo-mode';

type Tab = 'recent' | 'favorites' | 'supplier';

function relativeUsed(iso: string | null): string {
  if (!iso) return 'Sin usar aún';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  const d = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (d <= 0) return 'Hoy';
  if (d === 1) return 'Hace 1 día';
  if (d < 7) return `Hace ${d} días`;
  if (d < 30) return `Hace ${Math.floor(d / 7)} sem.`;
  return `Hace ${Math.floor(d / 30)} mes(es)`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  localId: string | null | undefined;
  onPick: (templateId: string) => void;
};

export default function PedidosUseTemplateSheet({ open, onClose, localId, onPick }: Props) {
  const [tab, setTab] = React.useState<Tab>('recent');
  const [search, setSearch] = React.useState('');
  const [rows, setRows] = React.useState<PedidoOrderTemplateListItem[]>([]);
  const [loading, setLoading] = React.useState(false);

  const reload = React.useCallback(() => {
    if (!open || !localId) return;
    setLoading(true);
    void fetchPedidoOrderTemplates(getSupabaseClient(), localId, isDemoMode())
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [open, localId]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  const q = search.trim().toLowerCase();
  const filteredBase = React.useMemo(() => {
    let list = rows;
    if (tab === 'favorites') list = list.filter((r) => r.isFavorite);
    if (!q) return list;
    return list.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.supplierName.toLowerCase().includes(q) ||
        (r.category?.toLowerCase().includes(q) ?? false),
    );
  }, [rows, tab, q]);

  const bySupplier = React.useMemo(() => {
    const m = new Map<string, PedidoOrderTemplateListItem[]>();
    for (const r of filteredBase) {
      const k = r.supplierName;
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], 'es'));
  }, [filteredBase]);

  const sortedRecent = React.useMemo(() => {
    const copy = [...filteredBase];
    copy.sort((a, b) => {
      const ta = a.lastUsedAt ? Date.parse(a.lastUsedAt) : 0;
      const tb = b.lastUsedAt ? Date.parse(b.lastUsedAt) : 0;
      return tb - ta;
    });
    return copy;
  }, [filteredBase]);

  const displayList = tab === 'supplier' ? null : tab === 'recent' ? sortedRecent : filteredBase;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="use-template-title"
      onClick={() => onClose()}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-4 py-3">
          <h2 id="use-template-title" className="text-base font-bold text-zinc-900">
            Usar plantilla
          </h2>
          <button
            type="button"
            onClick={() => onClose()}
            className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="shrink-0 border-b border-zinc-100 px-3 pb-2 pt-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar plantillas…"
              className="h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-9 pr-3 text-sm text-zinc-900 outline-none focus:border-[#D32F2F]/40 focus:bg-white focus:ring-2 focus:ring-[#D32F2F]/10"
            />
          </div>
          <div className="mt-2 flex gap-1">
            {(
              [
                ['recent', 'Recientes'],
                ['favorites', 'Favoritas'],
                ['supplier', 'Por proveedor'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={[
                  'flex-1 rounded-lg py-2 text-[11px] font-bold transition',
                  tab === id
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {loading ? (
            <p className="py-8 text-center text-sm text-zinc-500">Cargando…</p>
          ) : tab === 'supplier' ? (
            bySupplier.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-500">No hay plantillas.</p>
            ) : (
              <div className="space-y-4 pb-4">
                {bySupplier.map(([supplierName, list]) => (
                  <div key={supplierName}>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">{supplierName}</p>
                    <ul className="space-y-2">
                      {list.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => {
                              onPick(t.id);
                              onClose();
                            }}
                            className="flex w-full items-start gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-left shadow-sm ring-1 ring-zinc-100 transition active:scale-[0.99]"
                          >
                            <Bookmark className="mt-0.5 h-4 w-4 shrink-0 text-[#B91C1C]" aria-hidden />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1">
                                <span className="text-sm font-bold text-zinc-900">{t.name}</span>
                                {t.isFavorite ? (
                                  <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" aria-hidden />
                                ) : null}
                              </span>
                              <span className="mt-0.5 block text-[11px] text-zinc-500">
                                {t.itemCount} artículos · {relativeUsed(t.lastUsedAt)}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )
          ) : displayList && displayList.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">No hay plantillas que coincidan.</p>
          ) : (
            <ul className="space-y-2 pb-4">
              {displayList?.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(t.id);
                      onClose();
                    }}
                    className="flex w-full items-start gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-left shadow-sm ring-1 ring-zinc-100 transition active:scale-[0.99]"
                  >
                    <Bookmark className="mt-0.5 h-4 w-4 shrink-0 text-[#B91C1C]" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1">
                        <span className="text-sm font-bold text-zinc-900">{t.name}</span>
                        {t.isFavorite ? (
                          <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" aria-hidden />
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-zinc-600">{t.supplierName}</span>
                      <span className="mt-0.5 block text-[10px] text-zinc-500">
                        {t.itemCount} artículos · {relativeUsed(t.lastUsedAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="shrink-0 border-t border-zinc-100 bg-zinc-50/90 px-4 py-2 text-[10px] leading-snug text-zinc-600">
          Las cantidades se cargan desde la plantilla; los precios siempre son los del catálogo actual.
        </p>
      </div>
    </div>
  );
}
