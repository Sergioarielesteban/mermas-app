import type { Unit } from '@/lib/types';

export type PedidoStatus = 'draft' | 'sent' | 'received';

export type PedidoDraftItem = {
  productId: string;
  productName: string;
  unit: Unit;
  quantity: number;
  receivedQuantity: number;
  pricePerUnit: number;
  lineTotal: number;
};

export type PedidoDraft = {
  id: string;
  supplierId: string;
  supplierName: string;
  status: PedidoStatus;
  notes: string;
  createdAt: string;
  sentAt?: string;
  receivedAt?: string;
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
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const value = row as Partial<PedidoDraft>;
        const items = Array.isArray(value.items)
          ? value.items.map((item) => ({
              productId: String(item?.productId ?? ''),
              productName: String(item?.productName ?? ''),
              unit: (item?.unit as Unit) ?? 'ud',
              quantity: Number(item?.quantity ?? 0),
              receivedQuantity: Number(item?.receivedQuantity ?? 0),
              pricePerUnit: Number(item?.pricePerUnit ?? 0),
              lineTotal: Number(item?.lineTotal ?? 0),
            }))
          : [];
        return {
          id: String(value.id ?? ''),
          supplierId: String(value.supplierId ?? ''),
          supplierName: String(value.supplierName ?? ''),
          status: (value.status as PedidoStatus) ?? 'draft',
          notes: String(value.notes ?? ''),
          createdAt: String(value.createdAt ?? ''),
          sentAt: value.sentAt ? String(value.sentAt) : undefined,
          receivedAt: value.receivedAt ? String(value.receivedAt) : undefined,
          items,
          total: Number(value.total ?? 0),
        } as PedidoDraft;
      })
      .filter((row): row is PedidoDraft => Boolean(row?.id));
  } catch {
    return [];
  }
}

function saveAllPedidoDrafts(next: PedidoDraft[]) {
  if (!isBrowser()) return;
  window.localStorage.setItem(PEDIDOS_DRAFTS_KEY, JSON.stringify(next));
}

export function savePedidoDraft(draft: PedidoDraft) {
  if (!isBrowser()) return;
  const current = getPedidoDrafts();
  const index = current.findIndex((row) => row.id === draft.id);
  if (index >= 0) {
    current[index] = draft;
    saveAllPedidoDrafts(current);
    return;
  }
  saveAllPedidoDrafts([draft, ...current]);
}

export function getPedidoDraftById(id: string) {
  return getPedidoDrafts().find((row) => row.id === id) ?? null;
}

export function deletePedidoDraft(id: string) {
  const next = getPedidoDrafts().filter((row) => row.id !== id);
  saveAllPedidoDrafts(next);
}

export function setPedidoStatus(id: string, status: PedidoStatus) {
  const now = new Date().toISOString();
  const next: PedidoDraft[] = getPedidoDrafts().map((row) => {
    if (row.id !== id) return row;
    if (status === 'sent') return { ...row, status: 'sent', sentAt: row.sentAt ?? now, receivedAt: undefined };
    if (status === 'received') return { ...row, status: 'received', receivedAt: now, sentAt: row.sentAt ?? now };
    return { ...row, status: 'draft', sentAt: undefined, receivedAt: undefined };
  });
  saveAllPedidoDrafts(next);
}

export function updatePedidoLineReceived(id: string, productId: string, quantity: number) {
  const next: PedidoDraft[] = getPedidoDrafts().map((row) => {
    if (row.id !== id) return row;
    const items = row.items.map((item) => {
      if (item.productId !== productId) return item;
      const clamped = Math.max(0, Math.round(quantity * 100) / 100);
      return { ...item, receivedQuantity: clamped };
    });
    const allReceived = items.length > 0 && items.every((item) => item.receivedQuantity >= item.quantity && item.quantity > 0);
    return {
      ...row,
      items,
      status: allReceived ? 'received' : row.status === 'draft' ? 'draft' : 'sent',
      receivedAt: allReceived ? row.receivedAt ?? new Date().toISOString() : undefined,
    };
  });
  saveAllPedidoDrafts(next);
}

