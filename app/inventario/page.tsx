'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Package, Trash2 } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  type InventoryCatalogCategory,
  type InventoryCatalogItem,
  type InventoryItem,
  deleteInventoryItemLine,
  fetchInventoryCatalogCategories,
  fetchInventoryCatalogItems,
  fetchInventoryItems,
  insertInventoryLineFromCatalog,
  updateInventoryItemLine,
} from '@/lib/inventory-supabase';

function parseDecimal(raw: string): number | null {
  const t = String(raw).trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const UNIT_SUFFIX: Record<string, string> = {
  kg: 'kg',
  ud: 'ud',
  bolsa: 'bolsa',
  racion: 'ración',
  caja: 'caja',
  paquete: 'paquete',
  bandeja: 'bandeja',
};

/** Coincide con el check de `inventory_items.unit` en Supabase. */
const INVENTORY_UNITS = ['kg', 'ud', 'bolsa', 'racion', 'caja', 'paquete', 'bandeja'] as const;

type LineDraft = {
  qty: string;
  price: string;
  name: string;
  format_label: string;
  unit: string;
};

export default function InventarioPage() {
  const { localId, profileReady, localName, localCode } = useAuth();
  const [categories, setCategories] = useState<InventoryCatalogCategory[]>([]);
  const [catalogItems, setCatalogItems] = useState<InventoryCatalogItem[]>([]);
  const [lines, setLines] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  /** Cantidad tecleada en catálogo antes de crear la línea (sin fila en `inventory_items`). */
  const [catalogPendingQty, setCatalogPendingQty] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const loadRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const load = useCallback(async () => {
    if (!localId || !supabaseOk) {
      setCategories([]);
      setCatalogItems([]);
      setLines([]);
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    setLoading(true);
    setBanner(null);
    try {
      const [cats, items, inv] = await Promise.all([
        fetchInventoryCatalogCategories(supabase),
        fetchInventoryCatalogItems(supabase),
        fetchInventoryItems(supabase, localId),
      ]);
      setCategories(cats);
      setCatalogItems(items);
      setLines(inv);
      const d: Record<string, LineDraft> = {};
      for (const row of inv) {
        d[row.id] = {
          qty: String(row.quantity_on_hand),
          price: String(row.price_per_unit),
          name: row.name,
          format_label: row.format_label ?? '',
          unit: row.unit,
        };
      }
      setDrafts(d);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al cargar inventario.';
      if (msg.toLowerCase().includes('relation') || msg.includes('does not exist')) {
        setBanner(
          'Faltan las tablas de inventario en Supabase. Ejecuta supabase-inventory-schema.sql y el seed si aún no lo hiciste.',
        );
      } else {
        setBanner(msg);
      }
      setCategories([]);
      setCatalogItems([]);
      setLines([]);
    } finally {
      setLoading(false);
    }
  }, [localId, supabaseOk]);

  loadRef.current = () => load();

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!localId || !supabaseOk) return;
    const supabase = getSupabaseClient()!;
    const ch = supabase
      .channel(`inventory-${localId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_items', filter: `local_id=eq.${localId}` },
        () => void loadRef.current(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [localId, supabaseOk]);

  const totalValor = useMemo(() => {
    let t = 0;
    for (const row of lines) {
      t += row.quantity_on_hand * row.price_per_unit;
    }
    return Math.round(t * 100) / 100;
  }, [lines]);

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, InventoryCatalogItem[]>();
    for (const c of categories) map.set(c.id, []);
    for (const it of catalogItems) {
      const list = map.get(it.catalog_category_id) ?? [];
      list.push(it);
      map.set(it.catalog_category_id, list);
    }
    return map;
  }, [categories, catalogItems]);

  const searchLower = search.trim().toLowerCase();
  const filteredCatalog = useMemo(() => {
    if (!searchLower) return catalogItems;
    return catalogItems.filter(
      (it) =>
        it.name.toLowerCase().includes(searchLower) ||
        (it.format_label ?? '').toLowerCase().includes(searchLower),
    );
  }, [catalogItems, searchLower]);

  const insertCatalogWithQty = async (item: InventoryCatalogItem, rawQty: string) => {
    if (!localId || !supabaseOk) return;
    if (!rawQty.trim()) return;
    const q = parseDecimal(rawQty);
    if (q === null || q < 0) {
      setBanner('Cantidad no válida (usa punto o coma para decimales).');
      return;
    }
    const supabase = getSupabaseClient()!;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setBusyId(item.id);
    setBanner(null);
    try {
      await insertInventoryLineFromCatalog(supabase, {
        localId,
        catalogItem: item,
        userId: user?.id ?? null,
        initialQuantity: q,
      });
      setCatalogPendingQty((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo añadir.';
      if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('23505')) {
        setBanner('Ese artículo del catálogo ya está en tu inventario.');
      } else {
        setBanner(msg);
      }
    } finally {
      setBusyId(null);
    }
  };

  const saveLine = async (row: InventoryItem, override?: Partial<LineDraft>) => {
    if (!localId || !supabaseOk) return;
    const base = drafts[row.id];
    if (!base) return;
    const d = { ...base, ...override };
    const q = parseDecimal(d.qty);
    const p = parseDecimal(d.price);
    if (q === null || q < 0) {
      setBanner('Cantidad no válida.');
      return;
    }
    if (p === null || p < 0) {
      setBanner('Precio no válido.');
      return;
    }
    const nm = d.name.trim();
    if (!nm) {
      setBanner('El nombre no puede estar vacío.');
      return;
    }
    if (!INVENTORY_UNITS.includes(d.unit as (typeof INVENTORY_UNITS)[number])) {
      setBanner('Unidad no válida.');
      return;
    }
    const supabase = getSupabaseClient()!;
    setBusyId(row.id);
    setBanner(null);
    try {
      await updateInventoryItemLine(supabase, {
        localId,
        itemId: row.id,
        quantity_on_hand: q,
        price_per_unit: p,
        name: nm,
        format_label: d.format_label.trim() ? d.format_label.trim() : null,
        unit: d.unit,
      });
      setDrafts((prev) => ({ ...prev, [row.id]: { ...d, name: nm } }));
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al guardar.');
    } finally {
      setBusyId(null);
    }
  };

  const removeLine = async (row: InventoryItem) => {
    if (!localId || !supabaseOk) return;
    if (!window.confirm(`¿Quitar «${row.name}» de tu inventario local?`)) return;
    const supabase = getSupabaseClient()!;
    setBusyId(row.id);
    setBanner(null);
    try {
      await deleteInventoryItemLine(supabase, localId, row.id);
      await load();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Error al eliminar.');
    } finally {
      setBusyId(null);
    }
  };

  const localLabel = localName ?? localCode ?? '—';
  const disabled = !localId || !profileReady || !supabaseOk || loading;

  return (
    <div className="space-y-5">
      <Link
        href="/panel"
        className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-[#D32F2F]"
      >
        <ChevronLeft className="h-4 w-4" />
        Panel
      </Link>

      <MermasStyleHero
        eyebrow="Chef-One"
        title="Inventario"
        description={`Stock y valor por artículo (${localLabel}). En el catálogo escribe la cantidad para crear la línea; nombre, formato, unidad y precio los editas en cada tarjeta.`}
      />

      {!isSupabaseEnabled() || !getSupabaseClient() ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Configura Supabase en la app para usar inventario.
        </div>
      ) : null}

      {!localId && profileReady ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Tu usuario necesita un perfil con <strong>local</strong> en Supabase.
        </div>
      ) : null}

      {banner ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{banner}</div>
      ) : null}

      {loading ? (
        <p className="text-center text-sm text-zinc-500">Cargando…</p>
      ) : (
        <>
          <section className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white px-4 py-4 ring-1 ring-zinc-100">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#D32F2F]/12 text-[#D32F2F]">
                <Package className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Valor total inventario</p>
                <p className="text-2xl font-extrabold tabular-nums text-zinc-900">{totalValor.toFixed(2)} €</p>
                <p className="text-[11px] text-zinc-500">{lines.length} línea(s) activa(s)</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-zinc-900">Mi inventario</h2>
            {lines.length === 0 ? (
              <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-6 text-center text-sm text-zinc-600">
                Aún no hay artículos. Añade desde el catálogo abajo.
              </p>
            ) : (
              <ul className="space-y-2">
                {lines.map((row) => {
                  const d = drafts[row.id] ?? {
                    qty: String(row.quantity_on_hand),
                    price: String(row.price_per_unit),
                    name: row.name,
                    format_label: row.format_label ?? '',
                    unit: row.unit,
                  };
                  const q = parseDecimal(d.qty) ?? 0;
                  const p = parseDecimal(d.price) ?? 0;
                  const sub = Math.round(q * p * 100) / 100;
                  const u = UNIT_SUFFIX[d.unit] ?? d.unit;
                  const rowBusy = busyId === row.id;
                  return (
                    <li
                      key={row.id}
                      className="rounded-xl border border-zinc-200/90 bg-white p-3 ring-1 ring-zinc-100"
                    >
                      <label className="block">
                        <span className="text-[9px] font-bold uppercase text-zinc-400">Nombre</span>
                        <input
                          type="text"
                          value={d.name}
                          disabled={disabled || rowBusy}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [row.id]: { ...d, name: e.target.value },
                            }))
                          }
                          className="mt-0.5 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm font-semibold text-zinc-900"
                        />
                      </label>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                        <label className="min-w-0 flex-1">
                          <span className="text-[9px] font-bold uppercase text-zinc-400">Formato (texto libre)</span>
                          <input
                            type="text"
                            value={d.format_label}
                            disabled={disabled || rowBusy}
                            placeholder="ej. PAQUETE 11 ud"
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [row.id]: { ...d, format_label: e.target.value },
                              }))
                            }
                            className="mt-0.5 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs text-zinc-800"
                          />
                        </label>
                        <label className="sm:w-36">
                          <span className="text-[9px] font-bold uppercase text-zinc-400">Unidad</span>
                          <select
                            value={d.unit}
                            disabled={disabled || rowBusy}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [row.id]: { ...d, unit: e.target.value },
                              }))
                            }
                            className="mt-0.5 h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs font-semibold text-zinc-900"
                          >
                            {INVENTORY_UNITS.map((key) => (
                              <option key={key} value={key}>
                                {UNIT_SUFFIX[key] ?? key}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-bold uppercase text-zinc-400">Cant. ({u})</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={d.qty}
                            disabled={disabled || rowBusy}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [row.id]: { ...d, qty: e.target.value },
                              }))
                            }
                            className="h-9 w-[4.75rem] rounded-lg border border-zinc-200 px-2 text-sm font-semibold tabular-nums"
                          />
                        </label>
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-bold uppercase text-zinc-400">€ / {u}</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={d.price}
                            disabled={disabled || rowBusy}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [row.id]: { ...d, price: e.target.value },
                              }))
                            }
                            className="h-9 w-[4.75rem] rounded-lg border border-zinc-200 px-2 text-sm font-semibold tabular-nums"
                          />
                        </label>
                        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
                          <span className="text-xs font-bold text-zinc-700">{sub.toFixed(2)} €</span>
                          <button
                            type="button"
                            disabled={disabled || rowBusy}
                            onClick={() => void saveLine(row)}
                            className="h-9 rounded-lg bg-[#D32F2F] px-3 text-xs font-bold text-white disabled:opacity-45"
                          >
                            {rowBusy ? '…' : 'Guardar'}
                          </button>
                          <button
                            type="button"
                            disabled={disabled || rowBusy}
                            onClick={() => void removeLine(row)}
                            className="grid h-9 w-9 place-items-center rounded-lg border border-zinc-300 text-zinc-600 disabled:opacity-45"
                            aria-label="Quitar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-zinc-900">Catálogo (cantidad = añade a tu local)</h2>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar artículo…"
              className="mb-3 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#D32F2F]/20"
            />
            <div className="space-y-2">
              {categories.map((cat) => {
                const items = (itemsByCategory.get(cat.id) ?? []).filter((it) =>
                  filteredCatalog.some((f) => f.id === it.id),
                );
                if (items.length === 0) return null;
                return (
                  <details
                    key={cat.id}
                    className="rounded-xl border border-zinc-200 bg-zinc-50/80 ring-1 ring-zinc-100"
                  >
                    <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-bold text-zinc-800 [&::-webkit-details-marker]:hidden">
                      <span className="flex items-center justify-between gap-2">
                        {cat.name}
                        <span className="text-xs font-semibold text-zinc-500">{items.length}</span>
                      </span>
                    </summary>
                    <ul className="space-y-1 border-t border-zinc-100 px-2 py-2">
                      {items.map((it) => {
                        const line = lines.find((l) => l.catalog_item_id === it.id);
                        const has = Boolean(line);
                        const catBusy = busyId === it.id;
                        const lineBusy = line ? busyId === line.id : false;
                        const qtyBusy = catBusy || lineBusy;
                        const qtyValue =
                          has && line
                            ? (drafts[line.id]?.qty ?? String(line.quantity_on_hand))
                            : (catalogPendingQty[it.id] ?? '');
                        return (
                          <li
                            key={it.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-2 py-2 ring-1 ring-zinc-100"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-zinc-900">{it.name}</p>
                              <p className="text-[10px] text-zinc-500">
                                {it.default_price_per_unit.toFixed(2)} €/{UNIT_SUFFIX[it.unit] ?? it.unit}
                                {it.format_label ? ` · ${it.format_label}` : ''}
                              </p>
                            </div>
                            <label className="flex shrink-0 flex-col gap-0.5">
                              <span className="text-[9px] font-bold uppercase text-zinc-400">Cant.</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                placeholder="0"
                                aria-label={has ? `Cantidad de ${it.name}` : `Añadir cantidad de ${it.name}`}
                                value={qtyValue}
                                disabled={disabled || qtyBusy}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (has && line) {
                                    setDrafts((prev) => {
                                      const cur = prev[line.id] ?? {
                                        qty: String(line.quantity_on_hand),
                                        price: String(line.price_per_unit),
                                        name: line.name,
                                        format_label: line.format_label ?? '',
                                        unit: line.unit,
                                      };
                                      return { ...prev, [line.id]: { ...cur, qty: v } };
                                    });
                                  } else {
                                    setCatalogPendingQty((prev) => ({ ...prev, [it.id]: v }));
                                  }
                                }}
                                onBlur={(e) => {
                                  if (disabled || qtyBusy) return;
                                  if (has && line) void saveLine(line, { qty: e.target.value });
                                  else void insertCatalogWithQty(it, e.target.value);
                                }}
                                className="h-9 w-[4.75rem] rounded-lg border border-zinc-200 px-2 text-center text-sm font-semibold tabular-nums"
                              />
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
