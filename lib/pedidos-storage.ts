import type { Unit } from '@/lib/types';

export type PedidoDraftItem = {
  productId: string;
  productName: string;
  unit: Unit;
  quantity: number;
  pricePerUnit: number;
  lineTotal: number;
};

export type PedidoDraft = {
  id: string;
  supplierName: string;
  notes: string;
  createdAt: string;
  items: PedidoDraftItem[];
  total: number;
};

const PEDIDOS_DRAFTS_KEY = 'mermas_pedidos_drafts_v1';

function isBrowser() {
  return typeof window !== 'undefined';
}

export function getPedidoDrafts(): PedidoDraft[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(PEDIDOS_DRAFTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PedidoDraft[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePedidoDraft(draft: PedidoDraft) {
  if (!isBrowser()) return;
  const current = getPedidoDrafts();
  const next = [draft, ...current];
  window.localStorage.setItem(PEDIDOS_DRAFTS_KEY, JSON.stringify(next));
}

