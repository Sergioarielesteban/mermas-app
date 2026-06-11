import type { InventoryMovementType, InventoryMovementWithItem } from '@/lib/inventory-operations-supabase';

export type MovementConsultFilter = 'all' | 'in' | 'out' | 'count';

const COUNT_TYPES: InventoryMovementType[] = ['count_adjustment'];

export function filterMovementsForConsult(
  movements: InventoryMovementWithItem[],
  params: { typeFilter: MovementConsultFilter; thisWeekOnly: boolean },
): InventoryMovementWithItem[] {
  let rows = movements;
  if (params.thisWeekOnly) {
    const start = startOfWeekMonday(new Date());
    rows = rows.filter((m) => new Date(m.occurred_at) >= start);
  }
  if (params.typeFilter === 'all') return rows;
  if (params.typeFilter === 'count') {
    return rows.filter((m) => COUNT_TYPES.includes(m.movement_type));
  }
  if (params.typeFilter === 'in') {
    return rows.filter((m) => m.quantity_delta > 0);
  }
  return rows.filter((m) => m.quantity_delta < 0);
}

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - diff);
  return x;
}
