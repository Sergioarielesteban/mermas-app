import type { CcPreparationUnit } from '@/lib/cocina-central-supabase';

/**
 * Mapea etiquetas de unidad (UI / receta interna / artículo máster) a unidad de elaboración y lotes.
 */
export function mapLabelToCcPreparationUnit(yieldLabel: string): CcPreparationUnit {
  const k = yieldLabel.trim().toLowerCase();
  if (k === 'g') return 'kg';
  if (k.includes('kg')) return 'kg';
  if (k.includes('l') && !k.includes('ml') && k.length <= 2) return 'litros';
  if (k.includes('ml') || (k.length <= 2 && k === 'l')) return 'litros';
  if (k.includes('litro')) return 'litros';
  if (k.includes('ración') || k.includes('racion') || k.includes('raciones')) return 'racion';
  if (k.includes('porción') || k.includes('porcion')) return 'racion';
  if (k === 'ud' || k.includes('unidad') || k.includes('pieza')) return 'unidades';
  if (k.includes('bolsa')) return 'bolsa';
  if (k.includes('bandeja')) return 'unidades';
  return 'unidades';
}
