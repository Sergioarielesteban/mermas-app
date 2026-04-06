'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { uid } from '@/lib/id';
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
  addMerma: (input: AddMermaInput) => MermaRecord;
  updateMerma: (id: string, input: AddMermaInput) => { ok: boolean; reason?: string };
  removeMerma: (id: string) => { ok: boolean; reason?: string };
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

function applyBaconHalfMonthlyBackfill(mermas: MermaRecord[], products: Product[]) {
  const target = products.find((p) => isBaconHalfSliceName(p.name));
  if (!target) return mermas;

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const daysToSpread = 7;
  const totalQty = 84;
  const qtyPerDay = Math.floor(totalQty / daysToSpread);
  const remainder = totalQty % daysToSpread;

  const kept = mermas.filter((m) => !m.id.startsWith(`fix-bacon-half-${monthKey}-`));
  const additions: MermaRecord[] = [];

  for (let i = 1; i <= daysToSpread; i += 1) {
    const qty = qtyPerDay + (i <= remainder ? 1 : 0);
    const occurredAt = new Date(now.getFullYear(), now.getMonth(), i, 12, 0, 0);
    const costEur = Math.round(qty * target.pricePerUnit * 100) / 100;
    additions.push({
      id: `fix-bacon-half-${monthKey}-${String(i).padStart(2, '0')}`,
      productId: target.id,
      quantity: qty,
      motiveKey: 'sobras-marcaje',
      notes: 'Ajuste mensual bacon 1/2',
      occurredAt: occurredAt.toISOString(),
      costEur,
      createdAt: new Date().toISOString(),
    });
  }

  return [...additions, ...kept].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
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
    return { products, mermas: applyBaconHalfMonthlyBackfill(DEFAULT_MERMAS, products) };
  }
  const parsed = safeJsonParse<PersistedState>(localStorage.getItem(STORAGE_KEY));
  if (!parsed?.products?.length) {
    const products = sortProductsByName(DEFAULT_PRODUCTS);
    return { products, mermas: applyBaconHalfMonthlyBackfill(DEFAULT_MERMAS, products) };
  }
  const mergedProducts = mergeProducts(DEFAULT_PRODUCTS, parsed.products);
  return {
    products: mergedProducts,
    mermas: applyBaconHalfMonthlyBackfill(
      Array.isArray(parsed.mermas) ? parsed.mermas : DEFAULT_MERMAS,
      mergedProducts,
    ),
  };
}

export function MermasStoreProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>(() => sortProductsByName(DEFAULT_PRODUCTS));
  const [mermas, setMermas] = useState<MermaRecord[]>(() => DEFAULT_MERMAS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!isBrowser()) return;
    const initial = loadInitialState();
    queueMicrotask(() => {
      setProducts(initial.products);
      setMermas(initial.mermas);
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!isBrowser()) return;
    if (!hydrated) return;
    const next: PersistedState = { products, mermas };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, [hydrated, products, mermas]);

  useEffect(() => {
    if (!isBrowser()) return;
    if (!hydrated) return;
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
  }, [hydrated, products, mermas]);

  const store = useMemo<MermasStore>(() => {
    const addProduct = (input: CreateProductInput) => {
      const trimmed = input.name.trim();
      if (!trimmed) return;
      if (!Number.isFinite(input.pricePerUnit) || input.pricePerUnit <= 0) return;
      const normalized = normalizeName(trimmed);
      const exists = products.some((p) => normalizeName(p.name) === normalized);
      if (exists) return;

      const id = uid('p');
      const product: Product = {
        id,
        name: trimmed,
        unit: input.unit,
        pricePerUnit: Math.round(input.pricePerUnit * 100) / 100,
        createdAt: new Date().toISOString(),
      };
      setProducts((prev) => sortProductsByName([product, ...prev]));
    };

    const updateProduct = (id: string, input: CreateProductInput) => {
      const trimmed = input.name.trim();
      if (!trimmed) return;
      if (!Number.isFinite(input.pricePerUnit) || input.pricePerUnit <= 0) return;
      const normalized = normalizeName(trimmed);
      const exists = products.some((p) => p.id !== id && normalizeName(p.name) === normalized);
      if (exists) return;

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
    };

    const removeProduct = (id: string) => {
      const hasRelatedMermas = mermas.some((m) => m.productId === id);
      if (hasRelatedMermas) {
        return { ok: false, reason: 'No se puede eliminar: tiene mermas registradas.' };
      }
      setProducts((prev) => prev.filter((p) => p.id !== id));
      return { ok: true };
    };

    const addMerma = (input: AddMermaInput) => {
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

      setMermas((prev) => [record, ...prev]);
      return record;
    };

    const updateMerma = (id: string, input: AddMermaInput) => {
      const product = products.find((p) => p.id === input.productId);
      if (!product) return { ok: false, reason: 'Producto no encontrado.' };
      const qty = Number.isFinite(input.quantity) ? input.quantity : 0;
      if (qty <= 0) return { ok: false, reason: 'Cantidad inválida.' };
      const costEur = Math.round(qty * product.pricePerUnit * 100) / 100;

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
      return { ok: true };
    };

    const removeMerma = (id: string) => {
      const exists = mermas.some((m) => m.id === id);
      if (!exists) return { ok: false, reason: 'Registro no encontrado.' };
      setMermas((prev) => prev.filter((m) => m.id !== id));
      return { ok: true };
    };

    const exportData = () => ({ products, mermas });

    const importData = (payload: PersistedState) => {
      if (!Array.isArray(payload.products) || !Array.isArray(payload.mermas)) {
        return { ok: false, reason: 'Formato de backup inválido.' };
      }
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
  }, [products, mermas]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useMermasStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useMermasStore debe usarse dentro de MermasStoreProvider');
  return ctx;
}

