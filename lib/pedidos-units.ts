import type { Unit } from '@/lib/types';

/** Unidades disponibles al definir el producto de proveedor (unidad de pedido al proveedor). */
export const PEDIDO_ORDER_UNITS: readonly { value: Unit; label: string }[] = [
  { value: 'ud', label: 'ud' },
  { value: 'docena', label: 'docena' },
  { value: 'caja', label: 'caja' },
  { value: 'bandeja', label: 'bandeja' },
  { value: 'paquete', label: 'paquete' },
  { value: 'kg', label: 'kg' },
  { value: 'g', label: 'g' },
  { value: 'litro', label: 'litro' },
  { value: 'ml', label: 'ml' },
  { value: 'bolsa', label: 'bolsa' },
  { value: 'racion', label: 'ración' },
] as const;

/** Unidad de uso en receta / coste interno (por pieza): selector al indicar piezas por envase. */
export const PEDIDO_RECIPE_UNITS: readonly { value: Unit; label: string }[] = [
  { value: 'ud', label: 'ud' },
  { value: 'kg', label: 'kg' },
  { value: 'g', label: 'g' },
  { value: 'litro', label: 'litro' },
  { value: 'ml', label: 'ml' },
  { value: 'bolsa', label: 'bolsa' },
  { value: 'racion', label: 'ración' },
  { value: 'caja', label: 'caja' },
  { value: 'paquete', label: 'paquete' },
  { value: 'bandeja', label: 'bandeja' },
  { value: 'docena', label: 'docena' },
];

/** Cantidad del pedido admite decimales (líquidos, peso). */
export function unitAllowsDecimalOrderQuantity(unit: Unit): boolean {
  return unit === 'kg' || unit === 'litro' || unit === 'ml' || unit === 'g';
}
