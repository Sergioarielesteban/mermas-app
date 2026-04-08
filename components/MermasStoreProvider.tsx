'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { fetchProductsAndMermas, mapMermaRow } from '@/lib/mermas-supabase';
import { uid } from '@/lib/id';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { isBrowser, safeJsonParse } from '@/lib/storage';
import type { MermaMotiveKey, MermaRecord, Product, Unit } from '@/lib/types';
import seedMermasRaw from '@/lib/seed-mermas.json';

type CreateProductInput = {
  name: string;
  unit: Unit;
  pricePerUnit: number;
};

type AddMermaInput = {
  productId: string;
  quantity: number;
  motiveKey: MermaMotiveKey;
  notes: string;
  occurredAt: string; // ISO
  photoDataUrl?: string;
};

type MermasStore = {
  products: Product[];
  mermas: MermaRecord[];
  addProduct: (input: CreateProductInput) => void;
  updateProduct: (id: string, input: CreateProductInput) => void;
  removeProduct: (id: string) => { ok: boolean; reason?: string };
  addMerma: (input: AddMermaInput) => Promise<{ ok: boolean; record?: MermaRecord; reason?: string }>;
  updateMerma: (id: string, input: AddMermaInput) => { ok: boolean; reason?: string };
  removeMerma: (id: string) => Promise<{ ok: boolean; reason?: string }>;
  exportData: () => PersistedState;
  importData: (payload: PersistedState) => { ok: boolean; reason?: string };
};

const STORAGE_KEY = 'mermas_app_v2';
const AUTH_KEY = 'mermas_user_email';

type PersistedState = {
  products: Product[];
  mermas: MermaRecord[];
};

type SeedMermaRow = {
  occurredAt: string;
  productName: string;
  quantity: number;
  motiveLabel: string;
  costEur: number;
};

const RAW_PRODUCTS_TSV = `nombre	precio_unidad	unidad
ALITAS DE POLLO	1,30 €	RACION
ALITAS DE POLLO UNIDAD	0,18 €	UNIDAD
AMERICAN BURGUER	2,54 €	RACION
AMERICAN CHIKEN	2,47 €	RACION
AROS DE CEBOLLA	0,77 €	RACION
BACON TIRAS BOLSA	8,75 €	BOLSA
BACON TIRAS RACION	0,42 €	RACION
BARQUETA FRANKFURT	0,05 €	UNIDAD
BARQUETA PATATAS	0,04 €	UNIDAD
BIKINI	0,65 €	RACION
BOCADILLO DE BACON	1,33 €	RACION
BOCADILLO DE LOMO	0,88 €	RACION
BOCADILLO DE POLLO	1,19 €	RACION
BOCADILLO TORTILLA FRANCESA	0,83 €	RACION
BURGUER TERNERA	1,13 €	RACION
CAJA BURGUÉR LLEVAR	0,19 €	UNIDAD
CAJA FRANKFURT LLEVAR	0,13 €	UNIDAD
CAJA PATATAS LLEVAR	0,11 €	UNIDAD
CALAMARES	1,58 €	RACION
CARNE CERVELA	1,39 €	UNIDAD
CHICKEN UNIDAD	0,70 €	UNIDAD
CARNE CHISTORRA UNIDAD	0,29 €	UNIDAD
CARNE CHORIZO UNIDAD	0,12 €	UNIDAD
CARNE CRIOLLO	0,93 €	UNIDAD
CARNE FRANKFURT	0,81 €	UNIDAD
CARNE LOMO UNIDAD	0,14 €	UNIDAD
CARNE POLLO RACION	0,80 €	RACION
CARNE PULLED	1,30 €	RACION
CARNE ROYAL	1,50 €	UNIDAD
CARNE SMASH	0,78 €	UNIDAD
CARNE TERNERA 90	0,74 €	UNIDAD
CARNE VACUNA	2,09 €	UNIDAD
CARROT BURGUER	1,50 €	RACION
CARROT PREMIUM	2,00 €	RACION
CEBOLLA CARAMELIZADA RACION	0,19 €	RACION
CEBOLLA MORADA RACION	0,03 €	RACION
CERVELA	1,74 €	RACION
CHICKEN BURGUER	1,27 €	RACION
CHISTORRA	1,22 €	RACION
CHOCOS	1,15 €	RACION
CHORIZO PICANTE	1,21 €	RACION
COCIDO UNIDAD	0,24 €	UNIDAD
COCIDOS	0,96 €	RACION
CRIOLLO ARGENTINO	1,36 €	RACION
CROISANT	0,74 €	UNIDAD
CROISANT CHOCOLATE	1,04 €	UNIDAD
CROISANT CHOCOLATE BLANCO	1,07 €	UNIDAD
DONUT	0,77 €	UNIDAD
DONUT BLANCO	1,07 €	UNIDAD
ENSALADA CESAR	2,12 €	RACION
ENSALADA DE CABRA	2,39 €	RACION
ENSALADA DE PASTA	1,77 €	RACION
ESTRACCIATELLA	3,00 €	RACION
FINGERS	1,65 €	RACION
FRANFURT	1,16 €	RACION
HUEVOS	0,21 €	UNIDAD
IBERICO CABRA	2,14 €	RACION
JERINGULLA RELLENA	0,12 €	UNIDAD
LECHUGA RACION	0,12 €	RACION
LIMÓN RACION	0,04 €	RACION
LOMO GOURMET	1,81 €	RACION
LONCHA BACON BOCATA	0,25 €	UNIDAD
LONCHA BACON BURGUÉR 1/2	0,11 €	UNIDAD
LONCHA CABRA BOCATA	0,52 €	UNIDAD
LONCHA CABRA ENSALADA	0,63 €	UNIDAD
LONCHA CHEDAR	0,08 €	UNIDAD
LONCHA EDAM	0,12 €	UNIDAD
LONCHA JAMÓN DULCE	0,10 €	UNIDAD
LONCHA MANCHEGO	0,25 €	UNIDAD
LONCHA PROVOLONE	0,21 €	UNIDAD
MAXI BURGUER	2,55 €	RACION
MAXI CHICKEN	2,46 €	RACION
MINI CROQUETAS	0,44 €	RACION
MINI CROQUETAS UNIDAD	0,05 €	UNIDAD
MINI DE ATUN	1,23 €	RACION
MINI DE FUET	1,17 €	RACION
MINI DE JAMON DUROC	1,54 €	RACION
MINI DE QUESO MANCHEGO	1,49 €	RACION
MINI DE TORTILLA DE PATATAS	1,18 €	RACION
MINI VEGETAL DE ATUN	1,33 €	RACION
MORROS	1,34 €	RACION
NACHOS	1,18 €	RACION
NACHOS PULLED	1,73 €	RACION
NACHOS RESTOS 454 gr	2,200 €	KG
NARANJAS	1,70 €	KG
NUGGETS	0,88 €	RACION
PAN BRIOCHE	0,56 €	UNIDAD
PAN BRIOCHE SALSA AHUMADA	0,70 €	UNIDAD
PAN BRIOCHE SALSA SECRETA	0,68 €	UNIDAD
PAN BRIOCHE SALSA TRUFADA	0,70 €	UNIDAD
PAN EXTREME	1,60 €	UNIDAD
PAN LARGO	0,28 €	UNIDAD
PAN LARGO CON TOMATE	0,32 €	UNIDAD
PAN RUSTICO	0,38 €	UNIDAD
PAN RÚSTICO SALSA CHEDAR	0,50 €	UNIDAD
PATATAS	0,75 €	RACION
PATATAS BONIATO	1,30 €	RACION
PATATAS CHEDAR BACON	1,53 €	RACION
PIMIENTO VERDE TROZO	0,37 €	UNIDAD
POLLO GOURMET	2,11 €	RACION
PROVOLETA	4,07 €	RACION
PULLED PORK	2,00 €	RACION
QUESO STRACCIATELLA	1,80 €	UNIDAD
RODAJA DE TOMATE	0,05 €	UNIDAD
ROYAL CHICKEN	2,80 €	RACION
SALSA AHUMADA	0,13 €	UNIDAD
SALSA BARBACOA RACION	0,04 €	UNIDAD
SALSA CÉSAR RACION	0,20 €	UNIDAD
SALSA CHEDAR	0,12 €	UNIDAD
SALSA SECRETA RACION	0,12 €	UNIDAD
SALSA TRUFADA RACION	0,14 €	UNIDAD
SANTA	3,15 €	RACION
SMASH BURGUER	3,00 €	RACION
SOBRE BURGUER	0,02 €	UNIDAD
TAPA DE MANCHEGO	1,55 €	RACION
TEQUEÑOS DE QUESO	1,77 €	RACION
TEQUEÑOS DE QUESO UNIDAD	0,36 €	UNIDAD
TEQUEÑOS NUTELLA UNIDAD	0,50 €	UNIDAD
TIRAS DE CHOCO UNID	0,10 €	UNIDAD
TOMATE ROJO KG	1,70 €	KG
TORTILLA FRANCESA SOLA	0,42 €	UNIDAD
TRUFADA	2,55 €	RACION
VACUNA	3,36 €	RACION
VACUNA SOLA	2,49 €	RACION
VIKINGO	1,24 €	RACION
XUXO	1,04 €	UNIDAD
BOLSA DE ALBAHACA	1,50 €	UNIDAD
TOMATE VERDE KG	2,50 €	KG
BOLSA MEDIANA LLEVAR	0,17 €	UNIDAD
TOMATE CHERRY KG	3,00 €	KG
PAN RUSTICO CON TOMATE	0,50 €	
PAN RUSTICO SIN GLUTEN	1,40 €	
PAN BRIOCHE SIN GLUTEN	1,59 €`;

const StoreContext = createContext<MermasStore | null>(null);

function sortProductsByName(items: Product[]) {
  return [...items].sort((a, b) =>
    a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true }),
  );
}

function normalizeName(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

function toSlug(name: string) {
  return normalizeName(name).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function parseUnit(raw: string): Unit {
  const value = raw.trim().toLowerCase();
  if (value === 'kg') return 'kg';
  if (value === 'bolsa') return 'bolsa';
  if (value === 'racion') return 'racion';
  return 'ud';
}

function parsePrice(raw: string): number {
  const normalized = raw.replace(/€/g, '').replace(/\s+/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function buildSeedProducts(): Product[] {
  const lines = RAW_PRODUCTS_TSV.split('\n').map((l) => l.trim()).filter(Boolean);
  const rows = lines.slice(1);
  const createdAt = new Date().toISOString();

  const products = rows
    .map((row, index) => {
      const [name = '', priceRaw = '', unitRaw = ''] = row.split('\t');
      const cleanName = name.trim();
      const price = parsePrice(priceRaw);
      if (!cleanName || price <= 0) return null;
      return {
        id: `seed-${toSlug(cleanName)}-${index + 1}`,
        name: cleanName,
        unit: parseUnit(unitRaw),
        pricePerUnit: price,
        createdAt,
      } satisfies Product;
    })
    .filter((item): item is Product => Boolean(item));

  return sortProductsByName(products);
}

const DEFAULT_PRODUCTS: Product[] = buildSeedProducts();

function mapMotive(label: string): MermaMotiveKey | null {
  if (label.includes('SE QUEMO')) return 'se-quemo';
  if (label.includes('MAL ESTADO')) return 'mal-estado';
  if (label.includes('CLIENTE CAMBIO')) return 'cliente-cambio';
  if (label.includes('ERROR EN COCINA') || label.includes('ERROR DEL PERSONAL') || label.includes('ERROR DEL EQUIPO')) return 'error-cocina';
  if (label.includes('SOBRAS DE MARCAJE')) return 'sobras-marcaje';
  if (label.includes('CANCELADO')) return 'cancelado';
  return null;
}

const PRODUCT_ALIASES: Record<string, string> = {
  'carne chicken': 'chicken unidad',
  'tiras de chocos unidad': 'tiras de choco unid',
  'nachos restos 450 gr': 'nachos restos 454 gr',
  'nachos restos': 'nachos restos 454 gr',
  'tomate rojo': 'tomate rojo kg',
  'pan rustico': 'pan rustico',
  'pan rústico': 'pan rustico',
};

const PRODUCT_PRICE_FIXES: Record<string, number> = {
  'loncha bacon bocata': 0.25,
  'loncha bacon burguer 1/2': 0.11,
};

function applyKnownPriceFix(product: Product): Product {
  const key = normalizeName(product.name);
  const fixed = PRODUCT_PRICE_FIXES[key];
  if (!fixed) return product;
  // Defensive migration for legacy decimal-shift mistakes (e.g. 2.5 instead of 0.25).
  if (product.pricePerUnit > 1) {
    return { ...product, pricePerUnit: fixed };
  }
  return product;
}

function findProductIdByName(name: string, products: Product[]) {
  const norm = normalizeName(name);
  const aliasNorm = normalizeName(PRODUCT_ALIASES[norm] ?? norm);

  const exact = products.find((p) => normalizeName(p.name) === aliasNorm);
  if (exact) return exact.id;

  const loose = products.find((p) => normalizeName(p.name).includes(aliasNorm));
  if (loose) return loose.id;

  return null;
}

function isBaconHalfSliceName(name: string) {
  const n = normalizeName(name);
  return n.includes('loncha bacon burguer 1/2') || n.includes('loncha bacon burger 1/2');
}

function isBaconHalfSliceText(text: string) {
  const n = normalizeName(text);
  return (
    n.includes('loncha bacon burguer 1/2') ||
    n.includes('loncha bacon burger 1/2') ||
    n.includes('bacon 1/2')
  );
}

function pruneBaconHalfRecords(products: Product[], records: MermaRecord[]) {
  const removedProductIds = new Set(products.filter((p) => isBaconHalfSliceName(p.name)).map((p) => p.id));
  const productNameById = new Map(products.map((p) => [p.id, p.name]));

  return records.filter((m) => {
    const productName = productNameById.get(m.productId) ?? '';
    const looksBaconHalf =
      removedProductIds.has(m.productId) ||
      isBaconHalfSliceText(productName) ||
      isBaconHalfSliceText(m.notes ?? '') ||
      m.id.startsWith('fix-bacon-half-') ||
      normalizeName(m.id).includes('loncha-bacon-burguer-1-2');
    return !looksBaconHalf;
  });
}

function buildSeedMermas(products: Product[]): MermaRecord[] {
  const rows = (seedMermasRaw as SeedMermaRow[]) ?? [];
  const out: MermaRecord[] = [];

  rows.forEach((row, index) => {
    const productId = findProductIdByName(row.productName, products);
    const motiveKey = mapMotive(row.motiveLabel);
    if (!productId || !motiveKey) return;
    const product = products.find((p) => p.id === productId);
    if (product && isBaconHalfSliceName(product.name)) return;

    out.push({
      id: `seed-m-${index + 1}`,
      productId,
      quantity: row.quantity,
      motiveKey,
      notes: '',
      occurredAt: row.occurredAt,
      costEur: row.costEur,
      createdAt: row.occurredAt,
    });
  });

  return out.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
}

const DEFAULT_MERMAS: MermaRecord[] = buildSeedMermas(DEFAULT_PRODUCTS);

function mergeProducts(seed: Product[], persisted: Product[]): Product[] {
  const map = new Map<string, Product>();
  for (const item of seed) {
    map.set(normalizeName(item.name), item);
  }
  for (const item of persisted) {
    // User-defined values overwrite seed if same name exists.
    map.set(normalizeName(item.name), applyKnownPriceFix(item));
  }
  return sortProductsByName(Array.from(map.values()));
}

function loadInitialState(): PersistedState {
  if (!isBrowser()) {
    const products = sortProductsByName(DEFAULT_PRODUCTS);
    return { products, mermas: pruneBaconHalfRecords(products, DEFAULT_MERMAS) };
  }
  const parsed = safeJsonParse<PersistedState>(localStorage.getItem(STORAGE_KEY));
  if (!parsed?.products?.length) {
    const products = sortProductsByName(DEFAULT_PRODUCTS);
    return { products, mermas: pruneBaconHalfRecords(products, DEFAULT_MERMAS) };
  }
  const mergedProducts = mergeProducts(DEFAULT_PRODUCTS, parsed.products);
  return {
    products: mergedProducts,
    mermas: pruneBaconHalfRecords(
      mergedProducts,
      Array.isArray(parsed.mermas) ? parsed.mermas : DEFAULT_MERMAS,
    ),
  };
}

export function MermasStoreProvider({ children }: { children: React.ReactNode }) {
  const { localId, profileReady, email } = useAuth();
  const supabaseEnabled = isSupabaseEnabled();
  const cloudMode = Boolean(profileReady && localId && isSupabaseEnabled());
  const legacyMode = !supabaseEnabled || !email;
  const [cloudDataLoaded, setCloudDataLoaded] = useState(false);

  const [products, setProducts] = useState<Product[]>(() => sortProductsByName(DEFAULT_PRODUCTS));
  const [mermas, setMermas] = useState<MermaRecord[]>(() =>
    pruneBaconHalfRecords(sortProductsByName(DEFAULT_PRODUCTS), DEFAULT_MERMAS),
  );
  const [hydrated, setHydrated] = useState(false);
  const lastLocalEditAtRef = React.useRef(0);
  const lastRemoteAppliedAtRef = React.useRef(0);
  const applyingRemoteRef = React.useRef(false);
  const markLocalEdit = React.useCallback(() => {
    lastLocalEditAtRef.current = Date.now();
  }, []);

  const refetchCloud = React.useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !localId) return;
    try {
      const { products: p, mermas: m } = await fetchProductsAndMermas(supabase, localId);
      const cleaned = pruneBaconHalfRecords(p, m);
      setProducts(sortProductsByName(p));
      setMermas(cleaned);
      setCloudDataLoaded(true);
    } catch {
      // Keep last known state; do not wipe UI on transient cloud errors.
    }
  }, [localId]);

  useEffect(() => {
    if (!profileReady) return;
    queueMicrotask(() => {
      setCloudDataLoaded(!localId);
    });
  }, [profileReady, localId]);

  useEffect(() => {
    if (!isBrowser()) return;
    // With Supabase enabled, never fall back to legacy local state while auth/profile is still resolving.
    if (supabaseEnabled && !profileReady) return;
    if (!legacyMode) {
      queueMicrotask(() => {
        setHydrated(true);
      });
      return;
    }
    const initial = loadInitialState();
    queueMicrotask(() => {
      setProducts(initial.products);
      setMermas(initial.mermas);
      setHydrated(true);
    });
  }, [legacyMode, localId, profileReady, supabaseEnabled]);

  useEffect(() => {
    if (!isBrowser() || !hydrated || !cloudMode || !localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    void (async () => {
      try {
        const { products: p, mermas: m } = await fetchProductsAndMermas(supabase, localId);
        if (cancelled) return;
        const cleaned = pruneBaconHalfRecords(p, m);
        setProducts(sortProductsByName(p));
        setMermas(cleaned);
        setCloudDataLoaded(true);
      } catch {
        // Keep last known state if first cloud load fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cloudMode, hydrated, localId]);

  useEffect(() => {
    if (!isBrowser() || !hydrated || !cloudMode || !cloudDataLoaded) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const channel = supabase
      .channel('mermas-local-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        void refetchCloud();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mermas' }, () => {
        void refetchCloud();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cloudDataLoaded, cloudMode, hydrated, refetchCloud]);

  useEffect(() => {
    if (!isBrowser()) return;
    if (!hydrated) return;
    if (!legacyMode) return;
    const next: PersistedState = { products, mermas };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, [hydrated, legacyMode, products, mermas]);

  useEffect(() => {
    if (!isBrowser()) return;
    if (!hydrated) return;
    if (!legacyMode) return;
    const email = localStorage.getItem(AUTH_KEY)?.trim().toLowerCase();
    if (!email) return;

    let cancelled = false;
    const applyRemote = (remote: PersistedState, updatedAt: string | null | undefined) => {
      if (cancelled) return;
      if (!Array.isArray(remote.products) || !Array.isArray(remote.mermas)) return;
      const remoteTs = updatedAt ? Date.parse(updatedAt) : 0;
      // Evita pisar ediciones locales más nuevas que el snapshot remoto.
      if (remoteTs && lastLocalEditAtRef.current && remoteTs + 2000 < lastLocalEditAtRef.current) return;
      if (remoteTs && remoteTs <= lastRemoteAppliedAtRef.current) return;
      const mergedProducts = mergeProducts(DEFAULT_PRODUCTS, remote.products);
      const cleanedMermas = pruneBaconHalfRecords(mergedProducts, remote.mermas);
      applyingRemoteRef.current = true;
      setProducts(mergedProducts);
      setMermas(cleanedMermas);
      queueMicrotask(() => {
        applyingRemoteRef.current = false;
      });
      if (remoteTs) lastRemoteAppliedAtRef.current = remoteTs;
    };

    const pull = async () => {
      try {
        const resp = await fetch(`/api/sync?email=${encodeURIComponent(email)}`, {
          method: 'GET',
          cache: 'no-store',
        });
        if (!resp.ok) return;
        const data = (await resp.json()) as {
          ok?: boolean;
          snapshot?: { products?: Product[]; mermas?: MermaRecord[]; updatedAt?: string | null } | null;
        };
        if (!data?.ok || !data.snapshot) return;
        applyRemote({
          products: Array.isArray(data.snapshot.products) ? data.snapshot.products : [],
          mermas: Array.isArray(data.snapshot.mermas) ? data.snapshot.mermas : [],
        }, data.snapshot.updatedAt);
      } catch {
        // Ignore transient network issues; next poll retries.
      }
    };

    void pull();
    const intervalId = window.setInterval(() => {
      void pull();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [hydrated, legacyMode]);

  useEffect(() => {
    if (!isBrowser()) return;
    if (!hydrated) return;
    if (!legacyMode) return;
    const email = localStorage.getItem(AUTH_KEY);
    if (!email) return;

    const timeout = window.setTimeout(() => {
      void fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, products, mermas }),
      }).catch(() => {
        // Keep app usable offline; sync retries on next data change.
      });
    }, 1400);

    return () => window.clearTimeout(timeout);
  }, [hydrated, legacyMode, products, mermas]);

  const store = useMemo<MermasStore>(() => {
    // If Supabase auth is active, avoid falling back to local writes while profile/local is loading.
    const useCloud = Boolean(supabaseEnabled && email);

    const addProduct = (input: CreateProductInput) => {
      const trimmed = input.name.trim();
      if (!trimmed) return;
      if (!Number.isFinite(input.pricePerUnit) || input.pricePerUnit <= 0) return;
      const normalized = normalizeName(trimmed);
      const exists = products.some((p) => normalizeName(p.name) === normalized);
      if (exists) return;

      if (useCloud) {
        if (!localId) return;
        const supabase = getSupabaseClient();
        if (!supabase) return;
        void (async () => {
          const { error } = await supabase.from('products').insert({
            local_id: localId,
            name: trimmed,
            unit: input.unit,
            price_per_unit: Math.round(input.pricePerUnit * 100) / 100,
            is_active: true,
          });
          if (error) return;
          markLocalEdit();
          await refetchCloud();
        })();
        return;
      }

      const id = uid('p');
      const product: Product = {
        id,
        name: trimmed,
        unit: input.unit,
        pricePerUnit: Math.round(input.pricePerUnit * 100) / 100,
        createdAt: new Date().toISOString(),
      };
      markLocalEdit();
      setProducts((prev) => sortProductsByName([product, ...prev]));
    };

    const updateProduct = (id: string, input: CreateProductInput) => {
      const trimmed = input.name.trim();
      if (!trimmed) return;
      if (!Number.isFinite(input.pricePerUnit) || input.pricePerUnit <= 0) return;
      const normalized = normalizeName(trimmed);
      const exists = products.some((p) => p.id !== id && normalizeName(p.name) === normalized);
      if (exists) return;

      if (useCloud) {
        if (!localId) return;
        const supabase = getSupabaseClient();
        if (!supabase) return;
        void (async () => {
          const { error } = await supabase
            .from('products')
            .update({
              name: trimmed,
              unit: input.unit,
              price_per_unit: Math.round(input.pricePerUnit * 100) / 100,
            })
            .eq('id', id);
          if (error) return;
          markLocalEdit();
          await refetchCloud();
        })();
        return;
      }

      setProducts((prev) =>
        sortProductsByName(
          prev.map((p) =>
            p.id === id
              ? {
                  ...p,
                  name: trimmed,
                  unit: input.unit,
                  pricePerUnit: Math.round(input.pricePerUnit * 100) / 100,
                }
              : p,
          ),
        ),
      );
      markLocalEdit();
    };

    const removeProduct = (id: string) => {
      const hasRelatedMermas = mermas.some((m) => m.productId === id);
      if (hasRelatedMermas) {
        return { ok: false, reason: 'No se puede eliminar: tiene mermas registradas.' };
      }
      if (useCloud) {
        if (!localId) return { ok: false, reason: 'Perfil del local aún cargando. Reintenta en 2 segundos.' };
        const supabase = getSupabaseClient();
        if (!supabase) return { ok: false, reason: 'Sin conexión.' };
        void (async () => {
          const { error } = await supabase.from('products').update({ is_active: false }).eq('id', id);
          if (error) return;
          markLocalEdit();
          await refetchCloud();
        })();
        return { ok: true };
      }
      markLocalEdit();
      setProducts((prev) => prev.filter((p) => p.id !== id));
      return { ok: true };
    };

    const addMerma = async (input: AddMermaInput) => {
      const product = products.find((p) => p.id === input.productId);
      const price = product?.pricePerUnit ?? 0;
      const qty = Number.isFinite(input.quantity) ? input.quantity : 0;
      const costEur = Math.round(qty * price * 100) / 100;
      const record: MermaRecord = {
        id: uid('m'),
        productId: input.productId,
        quantity: qty,
        motiveKey: input.motiveKey,
        notes: input.notes.trim(),
        occurredAt: input.occurredAt,
        photoDataUrl: input.photoDataUrl,
        costEur,
        createdAt: new Date().toISOString(),
      };

      if (useCloud) {
        if (!localId) {
          return { ok: false, reason: 'Perfil del local aún cargando. Espera 2 segundos y vuelve a guardar.' };
        }
        const supabase = getSupabaseClient();
        if (!supabase) {
          return { ok: false, reason: 'Sin conexión con Supabase.' };
        }
        markLocalEdit();
        setMermas((prev) => [record, ...prev]);
        const { data, error } = await supabase
          .from('mermas')
          .insert({
            local_id: localId,
            product_id: input.productId,
            quantity: qty,
            motive_key: input.motiveKey,
            notes: input.notes.trim(),
            occurred_at: input.occurredAt,
            photo_data_url: input.photoDataUrl ?? null,
            cost_eur: costEur,
          })
          .select('id,product_id,quantity,motive_key,notes,occurred_at,photo_data_url,cost_eur,created_at')
          .single();
        if (error || !data) {
          // Revert optimistic row so the UI does not suggest it was saved.
          setMermas((prev) => prev.filter((m) => m.id !== record.id));
          return { ok: false, reason: error?.message ?? 'No se pudo guardar en nube.' };
        }
        const saved = mapMermaRow(data);
        setMermas((prev) => prev.map((m) => (m.id === record.id ? saved : m)));
        markLocalEdit();
        return { ok: true, record: saved };
      }

      markLocalEdit();
      setMermas((prev) => [record, ...prev]);
      return { ok: true, record };
    };

    const updateMerma = (id: string, input: AddMermaInput) => {
      const product = products.find((p) => p.id === input.productId);
      if (!product) return { ok: false, reason: 'Producto no encontrado.' };
      const qty = Number.isFinite(input.quantity) ? input.quantity : 0;
      if (qty <= 0) return { ok: false, reason: 'Cantidad inválida.' };
      const costEur = Math.round(qty * product.pricePerUnit * 100) / 100;

      if (useCloud) {
        if (!localId) return { ok: false, reason: 'Perfil del local aún cargando. Reintenta en 2 segundos.' };
        const supabase = getSupabaseClient();
        if (!supabase) return { ok: false, reason: 'Sin conexión.' };
        void (async () => {
          const { error } = await supabase
            .from('mermas')
            .update({
              product_id: input.productId,
              quantity: qty,
              motive_key: input.motiveKey,
              notes: input.notes.trim(),
              occurred_at: input.occurredAt,
              photo_data_url: input.photoDataUrl ?? null,
              cost_eur: costEur,
            })
            .eq('id', id);
          if (error) return;
          markLocalEdit();
          await refetchCloud();
        })();
        return { ok: true };
      }

      setMermas((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                productId: input.productId,
                quantity: qty,
                motiveKey: input.motiveKey,
                notes: input.notes.trim(),
                occurredAt: input.occurredAt,
                photoDataUrl: input.photoDataUrl,
                costEur,
              }
            : m,
        ),
      );
      markLocalEdit();
      return { ok: true };
    };

    const removeMerma = async (id: string) => {
      const exists = mermas.some((m) => m.id === id);
      if (!exists) return { ok: false, reason: 'Registro no encontrado.' };
      if (useCloud) {
        if (!localId) return { ok: false, reason: 'Perfil del local aún cargando. Reintenta en 2 segundos.' };
        const supabase = getSupabaseClient();
        if (!supabase) return { ok: false, reason: 'Sin conexión.' };
        const snapshot = mermas;
        // Optimistic UI: remove immediately, rollback if backend delete fails.
        setMermas((prev) => prev.filter((m) => m.id !== id));
        const { data, error } = await supabase
          .from('mermas')
          .delete()
          .eq('id', id)
          .select('id')
          .maybeSingle();
        if (error) {
          setMermas(snapshot);
          return { ok: false, reason: `No se pudo eliminar en nube: ${error.message}` };
        }
        if (!data?.id) {
          setMermas(snapshot);
          return {
            ok: false,
            reason: 'No se pudo eliminar: sin permisos o registro no encontrado para este local.',
          };
        }
        markLocalEdit();
        await refetchCloud();
        return { ok: true };
      }
      markLocalEdit();
      setMermas((prev) => prev.filter((m) => m.id !== id));
      return { ok: true };
    };

    const exportData = () => ({ products, mermas });

    const importData = (payload: PersistedState) => {
      if (useCloud) {
        return { ok: false, reason: 'Importación no disponible en modo multi-local (Supabase).' };
      }
      if (!Array.isArray(payload.products) || !Array.isArray(payload.mermas)) {
        return { ok: false, reason: 'Formato de backup inválido.' };
      }
      markLocalEdit();
      setProducts(sortProductsByName(payload.products));
      setMermas(payload.mermas);
      return { ok: true };
    };

    return {
      products,
      mermas,
      addProduct,
      updateProduct,
      removeProduct,
      addMerma,
      updateMerma,
      removeMerma,
      exportData,
      importData,
    };
  }, [email, localId, markLocalEdit, mermas, products, refetchCloud, supabaseEnabled]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useMermasStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useMermasStore debe usarse dentro de MermasStoreProvider');
  return ctx;
}

