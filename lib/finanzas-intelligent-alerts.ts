/**
 * Fase 9 — Alertas inteligentes solo desde `FinanzasEconomicSummary` (sin RPC/SQL extra).
 */

import type { FinanzasEconomicSummary } from '@/lib/finanzas-economic-summary';

export type AlertPriority = 'P1' | 'P2' | 'P3';

export type AlertItem = {
  id: string;
  priority: AlertPriority;
  title: string;
  description?: string;
  impact_eur?: number;
  impact_pct?: number;
  action: string;
};

const PRIORITY_RANK: Record<AlertPriority, number> = { P1: 1, P2: 2, P3: 3 };

/** Orden estable dentro de la misma prioridad (reglas A1…A7). */
const RULE_ORDER: Record<string, number> = {
  'fin-a7-sin-ventas': 0,
  'fin-a1-perdida-op': 1,
  'fin-a2-beneficio-cae': 2,
  'fin-a3-personal-alto': 3,
  'fin-a4-mermas': 4,
  'fin-a5-compras-altas': 5,
  'fin-a6-gf-suben': 6,
};

/**
 * MVP A1–A7. Orden: P1 → P2 → P3; cortar en UI a 5 ítems.
 */
export function buildFinanzasIntelligentAlerts(s: FinanzasEconomicSummary): AlertItem[] {
  const items: AlertItem[] = [];
  const v = s.ingresos.ventas_c;
  const compras = s.costes_operativos.compras_c;
  const mermas = s.costes_operativos.mermas_c;
  const ro = s.resultados.resultado_operativo;

  if (v <= 0) {
    items.push({
      id: 'fin-a7-sin-ventas',
      priority: 'P1',
      title: 'No hay ventas registradas',
      action: 'Registrar ventas del día',
    });
  }

  if (ro < 0) {
    items.push({
      id: 'fin-a1-perdida-op',
      priority: 'P1',
      title: 'Estás perdiendo dinero',
      description: 'Resultado operativo negativo.',
      impact_eur: ro,
      action: 'Revisar costes operativos',
    });
  }

  const benDelta = s.comparativa.beneficio_neto_estimado.delta_pct;
  if (v > 0 && benDelta != null && benDelta < -10) {
    items.push({
      id: 'fin-a2-beneficio-cae',
      priority: 'P1',
      title: 'Tu beneficio está cayendo',
      impact_pct: benDelta,
      action: 'Revisar ventas y costes',
    });
  }

  const personalVentas = s.ratios.coste_personal_sobre_ventas;
  if (v > 0 && personalVentas != null && personalVentas > 0.35) {
    items.push({
      id: 'fin-a3-personal-alto',
      priority: 'P1',
      title: 'Coste de personal elevado',
      impact_pct: Math.round(personalVentas * 1000) / 10,
      action: 'Revisar turnos o productividad',
    });
  }

  const mermasCompras = s.ratios.mermas_sobre_compras;
  if (compras > 0 && mermasCompras != null && mermasCompras > 0.08) {
    items.push({
      id: 'fin-a4-mermas',
      priority: 'P2',
      title: 'Mermas altas',
      impact_eur: mermas,
      impact_pct: Math.round(mermasCompras * 1000) / 10,
      action: 'Revisar cocina',
    });
  }

  const comprasVentas = s.ratios.compras_sobre_ventas;
  if (v > 0 && comprasVentas != null && comprasVentas > 0.45) {
    items.push({
      id: 'fin-a5-compras-altas',
      priority: 'P2',
      title: 'Coste de materia prima elevado',
      impact_pct: Math.round(comprasVentas * 1000) / 10,
      action: 'Revisar proveedores',
    });
  }

  const gfDelta = s.comparativa.gastos_fijos_c.delta_pct;
  if (gfDelta != null && gfDelta > 15) {
    items.push({
      id: 'fin-a6-gf-suben',
      priority: 'P2',
      title: 'Gastos fijos en aumento',
      impact_pct: gfDelta,
      action: 'Revisar estructura',
    });
  }

  items.sort((a, b) => {
    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pr !== 0) return pr;
    return (RULE_ORDER[a.id] ?? 99) - (RULE_ORDER[b.id] ?? 99);
  });

  return items;
}
