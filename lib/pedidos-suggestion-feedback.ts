/**
 * Feedback ligero en localStorage para priorizar sugerencias operativas
 * (aceptar / ocultar). Sin backend; preparado para sustituir por API más adelante.
 */

const STORAGE_PREFIX = 'chefone_pedidos_op_suggest_fb:v1:';

export type SuggestionFeedbackEntry = {
  adds: number;
  dismisses: number;
};

export type SuggestionFeedbackMap = Record<string, SuggestionFeedbackEntry>;

export function loadSuggestionFeedback(localId: string | null): SuggestionFeedbackMap {
  if (!localId || typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + localId);
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== 'object') return {};
    const out: SuggestionFeedbackMap = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (!k) continue;
      const adds = typeof v === 'object' && v && 'adds' in v ? Number((v as { adds?: unknown }).adds) : 0;
      const dismisses =
        typeof v === 'object' && v && 'dismisses' in v ? Number((v as { dismisses?: unknown }).dismisses) : 0;
      out[k] = {
        adds: Number.isFinite(adds) && adds >= 0 ? adds : 0,
        dismisses: Number.isFinite(dismisses) && dismisses >= 0 ? dismisses : 0,
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function bumpSuggestionFeedback(
  localId: string,
  suggestionId: string,
  kind: 'add' | 'dismiss',
): SuggestionFeedbackMap {
  const prev = loadSuggestionFeedback(localId);
  const cur = prev[suggestionId] ?? { adds: 0, dismisses: 0 };
  const next: SuggestionFeedbackEntry =
    kind === 'add'
      ? { adds: cur.adds + 1, dismisses: cur.dismisses }
      : { adds: cur.adds, dismisses: cur.dismisses + 1 };
  const merged = { ...prev, [suggestionId]: next };
  try {
    window.localStorage.setItem(STORAGE_PREFIX + localId, JSON.stringify(merged));
  } catch {
    /* quota / privado */
  }
  return merged;
}

/** Multiplicador de prioridad: más adds → sube; más dismisses → baja. */
export function suggestionFeedbackMultiplier(entry: SuggestionFeedbackEntry | undefined): number {
  const adds = entry?.adds ?? 0;
  const dismisses = entry?.dismisses ?? 0;
  const raw = (adds + 1.2) / (dismisses + 1.2);
  return Math.min(2.2, Math.max(0.35, raw));
}
