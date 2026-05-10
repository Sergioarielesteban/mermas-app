/**
 * Fachada para insights operativos: patrones temporales hoy; mañana + contexto externo.
 * Evita importar múltiples motores desde la UI.
 */

export {
  computeTemporalPatterns,
  type TemporalInsight,
  type TemporalInsightKind,
  type TemporalPatternsResult,
  type InsightMaturityLevel,
} from '@/lib/pedidos-temporal-patterns';

export {
  emptyExternalContext,
  fetchExternalContextBundle,
  type ExternalContextBundle,
} from '@/lib/pedidos-external-context-engine';
