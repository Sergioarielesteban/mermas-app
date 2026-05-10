/**
 * Textos UI para madurez de insights (patrones temporales).
 * Separado del motor numérico para no mezclar copy con stats.
 */

import type { InsightMaturityLevel } from '@/lib/pedidos-temporal-patterns';

/** Tooltip discreto (title / aria) — niveles 1–6 */
export const INSIGHT_MATURITY_TOOLTIP = [
  'Nivel 1: productos frecuentes en tus pedidos.',
  'Nivel 2: pedido sugerido según hábitos.',
  'Nivel 3: patrones temporales y tendencias recientes.',
  'Nivel 4: cobertura estimada más fina con tu ciclo de entrega.',
  'Nivel 5: predicción contextual (próx.: clima, festivos…).',
  'Nivel 6: automatización inteligente con tu supervisión.',
].join('\n');

export function maturityProgressCaption(level: InsightMaturityLevel): string {
  switch (level) {
    case 1:
      return 'Estamos identificando qué compras sueles repetir.';
    case 2:
      return 'Ya podemos sugerir cantidades habituales.';
    case 3:
      return 'Estamos detectando tus patrones semanales y tendencias recientes.';
    case 4:
      return 'Cobertura estimada más alineada con tus entregas.';
    case 5:
      return 'Pronto podremos enriquecer con contexto local (sin sustituir tu criterio).';
    case 6:
      return 'Preparado para automatizaciones seguras bajo tu control.';
    default:
      return 'Chef One sigue aprendiendo de tu operativa.';
  }
}

/** Línea fija bajo la descripción del nivel (stepper). */
export const MATURITY_FOOTER_HINT =
  'Cuanto más uses Chef One, mejores serán las sugerencias.';
