'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { uid } from '@/lib/id';
import { isBrowser, safeJsonParse } from '@/lib/storage';
import type { MermaMotiveKey, MermaRecord, Product, Unit } from '@/lib/types';

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
  addMerma: (input: AddMermaInput) => MermaRecord;
};

const STORAGE_KEY = 'mermas_app_v1';

type PersistedState = {
  products: Product[];
  mermas: MermaRecord[];
};

const DEFAULT_PRODUCTS: Product[] = [
  {
    id: 'carne-smash',
    name: 'Carne Smash',
    unit: 'ud',
    pricePerUnit: 2.4,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'huevos',
    name: 'Huevos',
    unit: 'ud',
    pricePerUnit: 0.25,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'vikingo',
    name: 'Vikingo',
    unit: 'ud',
    pricePerUnit: 3.2,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'pan-brioche',
    name: 'Pan Brioche',
    unit: 'ud',
    pricePerUnit: 0.55,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'patatas',
    name: 'Patatas',
    unit: 'kg',
    pricePerUnit: 1.7,
    createdAt: new Date().toISOString(),
  },
];

const StoreContext = createContext<MermasStore | null>(null);

function loadInitialState(): PersistedState {
  if (!isBrowser()) return { products: DEFAULT_PRODUCTS, mermas: [] };
  const parsed = safeJsonParse<PersistedState>(localStorage.getItem(STORAGE_KEY));
  if (!parsed?.products?.length) return { products: DEFAULT_PRODUCTS, mermas: [] };
  return {
    products: parsed.products,
    mermas: Array.isArray(parsed.mermas) ? parsed.mermas : [],
  };
}

export function MermasStoreProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>(() => loadInitialState().products);
  const [mermas, setMermas] = useState<MermaRecord[]>(() => loadInitialState().mermas);

  useEffect(() => {
    if (!isBrowser()) return;
    const next: PersistedState = { products, mermas };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, [products, mermas]);

  const store = useMemo<MermasStore>(() => {
    const addProduct = (input: CreateProductInput) => {
      const trimmed = input.name.trim();
      if (!trimmed) return;
      if (!Number.isFinite(input.pricePerUnit) || input.pricePerUnit <= 0) return;

      const id = uid('p');
      const product: Product = {
        id,
        name: trimmed,
        unit: input.unit,
        pricePerUnit: Math.round(input.pricePerUnit * 100) / 100,
        createdAt: new Date().toISOString(),
      };
      setProducts((prev) => [product, ...prev]);
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

    return { products, mermas, addProduct, addMerma };
  }, [products, mermas]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useMermasStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useMermasStore debe usarse dentro de MermasStoreProvider');
  return ctx;
}

