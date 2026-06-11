export type InventoryStockStatus = 'ok' | 'low' | 'critical';

const UNIT_LABEL: Record<string, string> = {
  kg: 'kg',
  l: 'L',
  ud: 'ud',
  bolsa: 'bolsa',
  racion: 'ración',
  caja: 'caja',
  paquete: 'paquete',
  bandeja: 'bandeja',
};

export function labelInventoryUnit(raw: string | null | undefined): string {
  const u = String(raw ?? '').trim().toLowerCase();
  if (!u) return 'ud';
  return UNIT_LABEL[u] ?? u;
}

export function formatStockQuantity(qty: number, unit?: string | null): string {
  const rounded =
    Math.abs(qty - Math.round(qty)) < 0.001
      ? qty.toLocaleString('es-ES', { maximumFractionDigits: 0 })
      : qty.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  const u = labelInventoryUnit(unit);
  return `${rounded} ${u}`;
}

export function resolveStockStatus(
  quantityOnHand: number,
  minStock: number | null | undefined,
): InventoryStockStatus {
  if (minStock == null || !Number.isFinite(minStock) || minStock <= 0) {
    return quantityOnHand <= 0 ? 'critical' : 'ok';
  }
  if (quantityOnHand <= 0) return 'critical';
  if (quantityOnHand <= minStock * 0.5) return 'critical';
  if (quantityOnHand <= minStock) return 'low';
  return 'ok';
}

export const STOCK_STATUS_LABEL: Record<InventoryStockStatus, string> = {
  ok: 'Correcto',
  low: 'Bajo',
  critical: 'Crítico',
};

export const STOCK_STATUS_RING: Record<InventoryStockStatus, string> = {
  ok: 'ring-emerald-200/80',
  low: 'ring-amber-200/90',
  critical: 'ring-red-200/90',
};

export const STOCK_STATUS_BADGE: Record<InventoryStockStatus, string> = {
  ok: 'bg-emerald-50 text-emerald-800 ring-emerald-200/60',
  low: 'bg-amber-50 text-amber-900 ring-amber-200/70',
  critical: 'bg-red-50 text-red-800 ring-red-200/70',
};

export function parseStockDecimal(raw: string): number | null {
  const t = String(raw).trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function formatRelativeShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
