'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { Search, Save } from 'lucide-react';
import AppccCompactHero from '@/components/AppccCompactHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import {
  fetchAllergensMaster,
  fetchProductAllergensForLocal,
  fetchSupplierProductsForAllergens,
  saveProductAllergenSelection,
  type AllergenMasterRow,
  type AllergenPresenceType,
  type ProductAllergenRow,
  type SupplierProductLite,
} from '@/lib/appcc-allergens-supabase';
import { AllergenChip, PresenceBadge } from '@/components/appcc/AllergenUi';

type DraftMap = Record<string, { selected: boolean; presenceType: AllergenPresenceType }>;

export default function AppccCartaAlergenosProductosPage() {
  const { localId, userId, profileReady } = useAuth();
  const supabaseReady = isSupabaseEnabled() && !!getSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [products, setProducts] = useState<SupplierProductLite[]>([]);
  const [allergens, setAllergens] = useState<AllergenMasterRow[]>([]);
  const [rows, setRows] = useState<ProductAllergenRow[]>([]);
  const [search, setSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [draft, setDraft] = useState<DraftMap>({});

  useEffect(() => {
    if (!profileReady) return;
    if (!localId || !supabaseReady) {
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient()!;
    let active = true;
    const run = async () => {
      setLoading(true);
      setBanner(null);
      try {
        const [p, a, r] = await Promise.all([
          fetchSupplierProductsForAllergens(supabase, localId),
          fetchAllergensMaster(supabase),
          fetchProductAllergensForLocal(supabase, localId),
        ]);
        if (!active) return;
        setProducts(p);
        setAllergens(a);
        setRows(r);
        if (p.length > 0) setSelectedProductId((prev) => prev || p[0].id);
      } catch (e: unknown) {
        setBanner(e instanceof Error ? e.message : 'No se pudo cargar productos.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [profileReady, localId, supabaseReady]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, search]);

  const byProduct = useMemo(() => {
    const map = new Map<string, ProductAllergenRow[]>();
    rows.forEach((r) => {
      if (!map.has(r.product_id)) map.set(r.product_id, []);
      map.get(r.product_id)!.push(r);
    });
    return map;
  }, [rows]);

  useEffect(() => {
    if (!selectedProductId) return;
    const productRows = byProduct.get(selectedProductId) ?? [];
    const next: DraftMap = {};
    allergens.forEach((a) => {
      const current = productRows.find((x) => x.allergen_id === a.id);
      next[a.id] = {
        selected: !!current,
        presenceType: current?.presence_type ?? 'contains',
      };
    });
    setDraft(next);
  }, [selectedProductId, byProduct, allergens]);

  const selectedProduct = products.find((p) => p.id === selectedProductId) ?? null;

  const toggleAllergen = (allergenId: string) => {
    setDraft((prev) => ({
      ...prev,
      [allergenId]: {
        ...prev[allergenId],
        selected: !prev[allergenId]?.selected,
      },
    }));
  };

  const save = async () => {
    if (!selectedProductId || !localId || !userId || !supabaseReady) return;
    setBusy(true);
    setBanner(null);
    try {
      const supabase = getSupabaseClient()!;
      const selections = Object.entries(draft)
        .filter(([, v]) => v.selected)
        .map(([allergenId, v]) => ({
          allergenId,
          presenceType: v.presenceType,
        }));
      await saveProductAllergenSelection(supabase, {
        localId,
        productId: selectedProductId,
        userId,
        selections,
      });
      const latestRows = await fetchProductAllergensForLocal(supabase, localId);
      setRows(latestRows);
      setBanner('Ficha de alérgenos guardada.');
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  if (!profileReady || loading) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">Cargando fichas de ingredientes…</p>
      </section>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <AppccCompactHero title="Ficha de alérgenos por ingrediente" />
      {banner ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-100">
          {banner}
        </div>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-3 ring-1 ring-zinc-100">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar ingrediente de proveedor…"
            className="w-full rounded-xl border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <div className="mt-2 max-h-44 overflow-auto space-y-1">
          {filteredProducts.map((p) => {
            const complete = (byProduct.get(p.id) ?? []).length > 0;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedProductId(p.id)}
                className={[
                  'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left',
                  selectedProductId === p.id ? 'border-[#D32F2F]/40 bg-[#D32F2F]/5' : 'border-zinc-200 bg-white',
                ].join(' ')}
              >
                <span className="text-sm font-semibold text-zinc-800">{p.name}</span>
                <span className={['rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1', complete ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-red-50 text-red-800 ring-red-200'].join(' ')}>
                  {complete ? 'Con ficha' : 'Sin ficha'}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {selectedProduct ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 ring-1 ring-zinc-100">
          <p className="text-sm font-bold text-zinc-900">{selectedProduct.name}</p>
          <p className="text-xs text-zinc-500">Selecciona alérgenos y tipo de presencia.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {allergens.map((a) => (
              <AllergenChip key={a.id} allergen={a} selected={draft[a.id]?.selected ?? false} onClick={() => toggleAllergen(a.id)} />
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {allergens
              .filter((a) => draft[a.id]?.selected)
              .map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <p className="text-sm font-semibold text-zinc-800">
                    {a.icon} {a.name}
                  </p>
                  <div className="flex items-center gap-2">
                    <select
                      value={draft[a.id]?.presenceType ?? 'contains'}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [a.id]: {
                            ...prev[a.id],
                            selected: true,
                            presenceType: e.target.value as AllergenPresenceType,
                          },
                        }))
                      }
                      className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-700"
                    >
                      <option value="contains">Contiene</option>
                      <option value="traces">Trazas</option>
                      <option value="may_contain">Puede contener</option>
                    </select>
                    <PresenceBadge presence={draft[a.id]?.presenceType ?? 'contains'} />
                  </div>
                </div>
              ))}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#D32F2F] px-4 py-2 text-sm font-bold text-white hover:bg-[#B91C1C] disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Guardar ficha de alérgenos
          </button>
        </section>
      ) : null}
    </div>
  );
}
