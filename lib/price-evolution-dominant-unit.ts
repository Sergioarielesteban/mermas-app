/**
 * Elige la unidad de comparación dominante para evolución de precios a partir
 * del histórico de recepción (campo `unidad_comparacion` / displayUnit).
 * Regla producto: si ≥80 % de recepciones comparten unidad → solo esa vista;
 * si no, la UI puede ofrecer un conmutador entre las unidades presentes.
 */
export type DominantUnitAnalysis = {
  /** Unidad más frecuente en la ventana */
  primary: string;
  /** Fracción [0,1] de recepciones en `primary` */
  share: number;
  /** Unidades ordenadas por frecuencia (desc) */
  unitsOrdered: string[];
  counts: Record<string, number>;
};

const DOMINANT_THRESHOLD = 0.8;

export function analyzeDominantDisplayUnits(rows: ReadonlyArray<{ displayUnit: string }>): DominantUnitAnalysis {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const u = String(r.displayUnit ?? '').trim() || 'ud';
    counts.set(u, (counts.get(u) ?? 0) + 1);
  }
  const total = rows.length || 1;
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
  const primary = sorted[0]?.[0] ?? 'ud';
  const share = (sorted[0]?.[1] ?? 0) / total;
  const unitsOrdered = sorted.map(([u]) => u);
  return {
    primary,
    share,
    unitsOrdered,
    counts: Object.fromEntries(counts),
  };
}

/** Mezcla real: más de una unidad y ninguna llega al 80 %. */
export function hasMixedComparisonUnits(analysis: DominantUnitAnalysis): boolean {
  if (analysis.unitsOrdered.length < 2) return false;
  return analysis.share < DOMINANT_THRESHOLD;
}

/** Etiqueta corta para precio (€/kg, €/L, €/caja…). */
export function euroPerUnitShortLabel(unit: string): string {
  const u = String(unit || 'ud').trim() || 'ud';
  if (u === 'litro') return '€/L';
  return `€/${u}`;
}
