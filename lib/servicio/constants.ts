import type { AllergenKey } from '@/lib/servicio/types';

export type ServicioDbCategoria = 'entrante' | 'principal' | 'postre' | 'otros';

export type ServicioPlanEstado = 'pendiente' | 'en_preparacion' | 'listo';

export type ServicioDificultad = 'facil' | 'media' | 'alta';

export type ServicioProduccionOrigen = 'manual' | 'plato' | 'sistema';

export const SERVICIO_ALERGEN_OPTIONS: { key: AllergenKey; label: string }[] = [
  { key: 'gluten', label: 'Gluten' },
  { key: 'lactosa', label: 'Lactosa' },
  { key: 'huevos', label: 'Huevos' },
  { key: 'frutos_secos', label: 'Frutos secos' },
  { key: 'soja', label: 'Soja' },
  { key: 'pescado', label: 'Pescado' },
  { key: 'moluscos', label: 'Moluscos' },
];

export const SERVICIO_CATEGORIA_OPTIONS: { value: ServicioDbCategoria; label: string }[] = [
  { value: 'entrante', label: 'Entrante' },
  { value: 'principal', label: 'Principal' },
  { value: 'postre', label: 'Postre' },
  { value: 'otros', label: 'Otros' },
];

export function isAllergenKey(s: string): s is AllergenKey {
  return SERVICIO_ALERGEN_OPTIONS.some((o) => o.key === s);
}
