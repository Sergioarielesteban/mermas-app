import type { GlutenFreeOption, RecipeAllergenRow } from '@/lib/appcc-allergens-supabase';

/** Estados mostrados en matriz (incl. ausencia de alérgeno). */
export type MatrizPresenceKind = 'contains' | 'may_contain' | 'traces' | 'none';

export const MATRIZ_PRESENCE_LABEL: Record<MatrizPresenceKind, string> = {
  contains: 'CONTIENE',
  may_contain: 'PUEDE CONTENER',
  traces: 'TRAZAS',
  none: 'NO CONTIENE',
};

export const GLUTEN_OPTION_SHORT: Record<GlutenFreeOption, string> = {
  yes: 'SÍ',
  no: 'NO',
  ask: 'CONSULTAR',
};

export function effectiveGlutenOption(o: GlutenFreeOption | null | undefined): GlutenFreeOption {
  return o ?? 'ask';
}

export function resolveMatrizPresenceForAllergen(
  byAllergen: Map<string, RecipeAllergenRow | undefined>,
  allergenId: string,
): MatrizPresenceKind {
  const row = byAllergen.get(allergenId);
  if (!row || row.status === 'excluded') return 'none';
  return row.presence_type as MatrizPresenceKind;
}

export function matrizPresenceChipClass(kind: MatrizPresenceKind): string {
  switch (kind) {
    case 'contains':
      return 'bg-red-100 text-red-950 border-red-300 ring-red-200/60';
    case 'may_contain':
      return 'bg-orange-100 text-orange-950 border-orange-300 ring-orange-200/60';
    case 'traces':
      return 'bg-amber-100 text-amber-950 border-amber-300 ring-amber-200/60';
    default:
      return 'bg-emerald-50 text-emerald-900 border-emerald-200 ring-emerald-100/80';
  }
}

export function glutenOptionBadgeClass(opt: GlutenFreeOption): string {
  switch (opt) {
    case 'yes':
      return 'bg-emerald-100 text-emerald-950 border-emerald-300 ring-emerald-200/70';
    case 'no':
      return 'bg-red-100 text-red-950 border-red-300 ring-red-200/70';
    default:
      return 'bg-amber-100 text-amber-950 border-amber-300 ring-amber-200/70';
  }
}

export function showGlutenOperationalBanner(opt: GlutenFreeOption): boolean {
  return opt === 'yes' || opt === 'ask';
}

/** Para tarjeta compacta: solo riesgo / presencia distinta de ausencia. */
export function isRelevantMatrizPresence(kind: MatrizPresenceKind): boolean {
  return kind !== 'none';
}
