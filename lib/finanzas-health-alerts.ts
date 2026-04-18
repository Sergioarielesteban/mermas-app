/**
 * Fase 5 — Salud del negocio, alertas financieras y “Qué revisar hoy”.
 * Solo usa datos de `FinanzasEconomicSummary` (+ conteo opcional de albaranes pendiente vía capa finanzas).
 *
 * Umbrales: sustituir en el futuro por `mergeAlertThresholds({ ... })` o fuente remota.
 */

import type { FinanzasEconomicSummary } from '@/lib/finanzas-economic-summary';

/** Umbrales MVP (% salvo donde se indica). */
export const FINANZAS_ALERT_THRESHOLDS_DEFAULT = {
  comprasVentasPct: 40,
  mermasComprasPct: 5,
  costePersonalVentasPct: 35,
  comidaPersonalVentasPct: 3,
  gastosFijosVentasPct: 20,
  /** Margen neto estimado / ventas: por debajo de esto (y ≥ 0) se considera “margen bajo”. */
  margenBajoMaxPct: 10,
} as const;

export type FinanzasAlertThresholds = {
  comprasVentasPct: number;
  mermasComprasPct: number;
  costePersonalVentasPct: number;
  comidaPersonalVentasPct: number;
  gastosFijosVentasPct: number;
  margenBajoMaxPct: number;
};

export function mergeAlertThresholds(partial?: Partial<FinanzasAlertThresholds>): FinanzasAlertThresholds {
  return { ...FINANZAS_ALERT_THRESHOLDS_DEFAULT, ...partial };
}

export type FinanzasBusinessTrend = 'improving' | 'worsening' | 'stable';

export type FinanzasBusinessHealthView = {
  trend: FinanzasBusinessTrend;
  trendLabel: string;
  marginLabel: string;
  marginPct: number | null;
  explanation: string;
  chips: string[];
  trendStyles: { ring: string; bg: string; dot: string; text: string };
};

export type FinanceAlertSeverity = 'alta' | 'media' | 'baja';

export type FinanceAlert = {
  id: string;
  tipo: string;
  severidad: FinanceAlertSeverity;
  titulo: string;
  descripcion: string;
  impacto_estimado: string;
  accion_sugerida: string;
  modulo_destino: string | null;
  generado_en: string;
  /** Orden dentro de “Qué revisar hoy” (menor = antes). */
  orden_revision: number;
  prioridad_revision: 1 | 2 | 3;
};

export type FinanzasReviewTodayItem = {
  prioridad: 1 | 2 | 3;
  titulo: string;
  descripcion: string;
  impacto_estimado: string;
  accion_sugerida: string;
  href: string | null;
  alert_id: string;
};

function pct(n: number, d: number): number {
  if (d <= 0 || !Number.isFinite(n) || !Number.isFinite(d)) return 0;
  return (n / d) * 100;
}

function fmtPctSigned(v: number | null): string {
  if (v == null) return 'N/D';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

function marginPctFromSummary(s: FinanzasEconomicSummary): number | null {
  const v = s.ingresos.ventas_c;
  if (v <= 0) return null;
  return (s.resultados.beneficio_neto_estimado / v) * 100;
}

function marginLabelFromPct(p: number | null): string {
  if (p == null) return 'Sin ventas';
  if (p > 10) return 'Rentable';
  if (p >= 0) return 'Margen bajo';
  return 'En pérdidas';
}

function trendStyles(t: FinanzasBusinessTrend): FinanzasBusinessHealthView['trendStyles'] {
  if (t === 'improving') {
    return {
      ring: 'ring-emerald-200',
      bg: 'bg-emerald-50',
      dot: 'bg-emerald-500',
      text: 'text-emerald-950',
    };
  }
  if (t === 'worsening') {
    return {
      ring: 'ring-red-200',
      bg: 'bg-red-50',
      dot: 'bg-red-500',
      text: 'text-red-950',
    };
  }
  return {
    ring: 'ring-zinc-200',
    bg: 'bg-zinc-50',
    dot: 'bg-zinc-400',
    text: 'text-zinc-900',
  };
}

/**
 * Tendencia (Estable / Mejorando / Empeorando) a partir de deltas del resumen y presión de costes.
 * No modifica magnitudes económicas; solo interpreta `comparativa`.
 */
export function evaluateBusinessHealth(
  s: FinanzasEconomicSummary,
  thresholds: FinanzasAlertThresholds = mergeAlertThresholds(),
): FinanzasBusinessHealthView {
  const marginPct = marginPctFromSummary(s);
  const marginLabel = marginLabelFromPct(marginPct);

  const benD = s.comparativa.beneficio_neto_estimado.delta_pct;
  const resD = s.comparativa.resultado_operativo.delta_pct;
  const compD = s.comparativa.compras_c.delta_pct;
  const merD = s.comparativa.mermas_c.delta_pct;
  const venD = s.comparativa.ventas_c.delta_pct;
  const perD = s.comparativa.coste_personal_c.delta_pct;
  const comD = s.comparativa.comida_personal_c.delta_pct;

  let score = 0;
  if (s.ingresos.ventas_c > 0) {
    if (benD != null) {
      if (benD > 3) score += 1;
      if (benD < -3) score -= 1;
    }
    if (resD != null) {
      if (resD > 3) score += 1;
      if (resD < -5) score -= 1;
    }
    if (compD != null && compD > 10) score -= 1;
    if (merD != null && merD > 8) score -= 1;
    if (perD != null && perD > 10) score -= 1;
    if (comD != null && comD > 10) score -= 1;
    if (venD != null && venD > 5 && (benD ?? 0) >= 0) score += 1;
  }

  let trend: FinanzasBusinessTrend = 'stable';
  if (s.ingresos.ventas_c <= 0) {
    trend = 'stable';
  } else if (score >= 1) {
    trend = 'improving';
  } else if (score <= -1) {
    trend = 'worsening';
  }

  const trendLabel = trend === 'improving' ? 'Mejorando' : trend === 'worsening' ? 'Empeorando' : 'Estable';

  const chips: string[] = [];
  if (compD != null && Math.abs(compD) >= 5) {
    chips.push(`Compras ${fmtPctSigned(compD)} vs periodo anterior`);
  }
  if (merD != null && Math.abs(merD) >= 5) {
    chips.push(`Mermas ${fmtPctSigned(merD)} vs ant.`);
  }
  if (venD != null && Math.abs(venD) >= 5) {
    chips.push(`Ventas ${fmtPctSigned(venD)} vs ant.`);
  }
  if (perD != null && Math.abs(perD) >= 5) {
    chips.push(`Coste personal ${fmtPctSigned(perD)} vs ant.`);
  }
  if (comD != null && Math.abs(comD) >= 5) {
    chips.push(`Comida personal ${fmtPctSigned(comD)} vs ant.`);
  }

  const v = s.ingresos.ventas_c;
  const c = s.costes_operativos.compras_c;
  const comprasVentas = v > 0 ? pct(c, v) : 0;
  const gf = s.gastos_fijos.gastos_fijos_c;
  const gfVentas = v > 0 ? pct(gf, v) : 0;

  let explanation = `${trendLabel}`;
  if (chips.length > 0) {
    explanation += `: ${chips.slice(0, 3).join(' · ')}`;
  } else if (marginPct != null) {
    explanation += `. ${marginLabel}: margen neto estimado ${marginPct.toFixed(1)}% sobre ventas.`;
  } else {
    explanation += '. Sin ventas netas declaradas en el periodo; revisa carga de datos.';
  }

  if (
    v > 0 &&
    comprasVentas <= thresholds.comprasVentasPct &&
    gfVentas <= thresholds.gastosFijosVentasPct &&
    marginPct != null &&
    marginPct > thresholds.margenBajoMaxPct &&
    trend === 'stable' &&
    chips.length === 0
  ) {
    explanation = `Estable: costes principales dentro de umbrales y margen ${marginPct.toFixed(1)}%.`;
  }

  return {
    trend,
    trendLabel,
    marginLabel,
    marginPct,
    explanation,
    chips,
    trendStyles: trendStyles(trend),
  };
}

const REVISION_ORDER: Record<string, number> = {
  beneficio_negativo: 10,
  compras_altas: 20,
  gasto_fijo_elevado: 30,
  mermas_altas: 40,
  coste_personal_alto: 50,
  comida_alta: 60,
  margen_bajo: 70,
  sin_ventas: 80,
  albaranes_pendientes: 90,
};

function revisionPriority(tipo: string): 1 | 2 | 3 {
  if (tipo === 'beneficio_negativo' || tipo === 'compras_altas') return 1;
  if (
    tipo === 'mermas_altas' ||
    tipo === 'coste_personal_alto' ||
    tipo === 'comida_alta' ||
    tipo === 'gasto_fijo_elevado'
  ) {
    return 2;
  }
  return 3;
}

/**
 * Alertas financieras automáticas (runtime). `pendingAlbaranesCount` opcional: 2 consultas HEAD en delivery_notes.
 */
export function generateFinanceAlerts(
  s: FinanzasEconomicSummary,
  options?: {
    pendingAlbaranesCount?: number;
    thresholds?: Partial<FinanzasAlertThresholds>;
    now?: Date;
  },
): FinanceAlert[] {
  const th = mergeAlertThresholds(options?.thresholds);
  const genAt = (options?.now ?? new Date()).toISOString();
  const v = s.ingresos.ventas_c;
  const c = s.costes_operativos.compras_c;
  const m = s.costes_operativos.mermas_c;
  const p = s.costes_operativos.coste_personal_c;
  const meal = s.costes_operativos.comida_personal_c;
  const ben = s.resultados.beneficio_neto_estimado;
  const gf = s.gastos_fijos.gastos_fijos_c;

  const alerts: FinanceAlert[] = [];

  const push = (a: Omit<FinanceAlert, 'generado_en' | 'orden_revision' | 'prioridad_revision'> & { tipo: string }) => {
    const orden_revision = REVISION_ORDER[a.tipo] ?? 100;
    const prioridad_revision = revisionPriority(a.tipo);
    alerts.push({
      ...a,
      generado_en: genAt,
      orden_revision,
      prioridad_revision,
    });
  };

  if (v <= 0) {
    push({
      id: 'fin-sin-ventas',
      tipo: 'sin_ventas',
      severidad: 'media',
      titulo: 'Sin ventas cargadas',
      descripcion: 'No hay ventas netas declaradas para este periodo (tabla de ventas diarias).',
      impacto_estimado: 'No se puede valorar margen ni varios ratios.',
      accion_sugerida: 'Registrar ventas diarias en el módulo económico o revisar fechas del periodo.',
      modulo_destino: null,
    });
  }

  if (v > 0 && c / v > th.comprasVentasPct / 100) {
    const ratio = pct(c, v);
    push({
      id: 'fin-compras-altas',
      tipo: 'compras_altas',
      severidad: ratio > th.comprasVentasPct + 10 ? 'alta' : 'media',
      titulo: 'Compras altas respecto a ventas',
      descripcion: `Compras netas representan ${ratio.toFixed(1)}% de las ventas (umbral ${th.comprasVentasPct}%).`,
      impacto_estimado: `~${ratio.toFixed(0)}% del ingreso se va a compra.`,
      accion_sugerida: 'Revisar precios de compra, escandallos y mermas; comparar con periodo anterior.',
      modulo_destino: '/finanzas/compras',
    });
  }

  if (c > 0 && m / c > th.mermasComprasPct / 100) {
    const ratio = pct(m, c);
    push({
      id: 'fin-mermas-altas',
      tipo: 'mermas_altas',
      severidad: ratio > th.mermasComprasPct * 2 ? 'alta' : 'media',
      titulo: 'Mermas elevadas frente a compras',
      descripcion: `Mermas ${ratio.toFixed(1)}% sobre compras netas (umbral ${th.mermasComprasPct}%).`,
      impacto_estimado: `${s.costes_operativos.mermas_c.toFixed(2)} € de coste de mermas en el periodo.`,
      accion_sugerida: 'Revisar causas y operación en mermas y compras.',
      modulo_destino: '/finanzas/mermas',
    });
  }

  if (v > 0 && p / v > th.costePersonalVentasPct / 100) {
    const ratio = pct(p, v);
    push({
      id: 'fin-personal-alto',
      tipo: 'coste_personal_alto',
      severidad: 'media',
      titulo: 'Coste de personal alto',
      descripcion: `Coste personal ${ratio.toFixed(1)}% de ventas (umbral ${th.costePersonalVentasPct}%).`,
      impacto_estimado: `${ratio.toFixed(0)}% del ingreso a personal.`,
      accion_sugerida: 'Revisar plantilla, horas y cargas de personal del periodo.',
      modulo_destino: null,
    });
  }

  if (v > 0 && meal / v > th.comidaPersonalVentasPct / 100) {
    const ratio = pct(meal, v);
    push({
      id: 'fin-comida-alta',
      tipo: 'comida_alta',
      severidad: 'baja',
      titulo: 'Comida de personal relevante',
      descripcion: `Comida personal ${ratio.toFixed(1)}% de ventas (umbral ${th.comidaPersonalVentasPct}%).`,
      impacto_estimado: `${s.costes_operativos.comida_personal_c.toFixed(2)} € en el periodo.`,
      accion_sugerida: 'Revisar registros y política de comida de personal.',
      modulo_destino: '/comida-personal',
    });
  }

  if (ben < 0) {
    push({
      id: 'fin-beneficio-negativo',
      tipo: 'beneficio_negativo',
      severidad: 'alta',
      titulo: 'Beneficio neto negativo',
      descripcion: 'El beneficio neto estimado del periodo es inferior a cero.',
      impacto_estimado: `${ben.toFixed(2)} €`,
      accion_sugerida: 'Revisar compras, mermas, personal y gastos fijos; priorizar costes operativos.',
      modulo_destino: '/finanzas',
    });
  }

  if (v > 0) {
    const mp = marginPctFromSummary(s);
    if (mp != null && mp >= 0 && mp <= th.margenBajoMaxPct && ben >= 0) {
      push({
        id: 'fin-margen-bajo',
        tipo: 'margen_bajo',
        severidad: 'media',
        titulo: 'Margen neto bajo',
        descripcion: `Margen estimado ${mp.toFixed(1)}% (zona 0–${th.margenBajoMaxPct}% ).`,
        impacto_estimado: `Por debajo del ${th.margenBajoMaxPct}% de referencia “rentable”.`,
        accion_sugerida: 'Afinar precios, costes variables y gastos fijos declarados.',
        modulo_destino: '/finanzas',
      });
    }
  }

  if (v > 0 && gf / v > th.gastosFijosVentasPct / 100) {
    const ratio = pct(gf, v);
    push({
      id: 'fin-gastos-fijos-elevados',
      tipo: 'gasto_fijo_elevado',
      severidad: 'media',
      titulo: 'Gasto fijo elevado vs ventas',
      descripcion: `Gastos fijos ${ratio.toFixed(1)}% de ventas (umbral ${th.gastosFijosVentasPct}%). Nota: recurrentes van en nominal sin prorrateo.`,
      impacto_estimado: `${gf.toFixed(2)} € cargados en el periodo.`,
      accion_sugerida: 'Revisar importes recurrentes y one-off en gastos fijos.',
      modulo_destino: null,
    });
  }

  const pend = options?.pendingAlbaranesCount;
  if (pend != null && pend > 0) {
    push({
      id: 'fin-albaranes-pendientes',
      tipo: 'albaranes_pendientes',
      severidad: 'baja',
      titulo: 'Albaranes sin validar en el periodo',
      descripcion: `${pend} albarán(es) pendientes de validación con fecha de imputación en el rango.`,
      impacto_estimado: 'El gasto validado puede quedar incompleto hasta validar.',
      accion_sugerida: 'Validar o archivar albaranes pendientes.',
      modulo_destino: '/finanzas/albaranes?estado=pendiente',
    });
  }

  return alerts;
}

/**
 * Lista priorizada para el dashboard: P1 primero, luego P2, P3; dentro de cada grupo por `orden_revision`.
 */
export function buildReviewTodayItems(alerts: FinanceAlert[]): FinanzasReviewTodayItem[] {
  const sorted = [...alerts].sort((a, b) => {
    if (a.prioridad_revision !== b.prioridad_revision) {
      return a.prioridad_revision - b.prioridad_revision;
    }
    return a.orden_revision - b.orden_revision;
  });

  return sorted.map((a) => ({
    prioridad: a.prioridad_revision,
    titulo: a.titulo,
    descripcion: a.descripcion,
    impacto_estimado: a.impacto_estimado,
    accion_sugerida: a.accion_sugerida,
    href: a.modulo_destino,
    alert_id: a.id,
  }));
}
