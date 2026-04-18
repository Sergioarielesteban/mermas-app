import type { FinanzasDashboardData } from '@/lib/finanzas-supabase';

function escCell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Un solo CSV con KPIs, serie diaria, rankings y alertas (UTF-8 BOM). */
export function downloadFinanzasResumenCsv(data: FinanzasDashboardData, preset: string) {
  const lines: string[] = [];
  const row = (a: string, b: string, c: string | number) =>
    `${escCell(a)},${escCell(b)},${escCell(c)}`;

  lines.push('Seccion,Clave,Valor');
  lines.push(row('Meta', 'Preset', preset));
  lines.push(row('Meta', 'Periodo', `${data.periodFrom}..${data.periodTo}`));
  lines.push(row('Meta', 'Comparativa', `${data.prevFrom}..${data.prevTo}`));
  lines.push(row('KPI', 'Gasto validado neto', data.spendValidatedNet));
  lines.push(row('KPI', 'Gasto validado bruto', data.spendValidatedGross));
  lines.push(row('KPI', 'Compromiso pedidos neto', data.ordersCommitmentNet));
  lines.push(row('KPI', 'Desvio pedidos menos albaranes', data.deviationOrdersVsDn));
  lines.push(row('KPI', 'Mermas EUR', data.mermaEur));
  lines.push(row('KPI', 'Mermas pct compra', data.mermaPctOfSpend));
  lines.push(row('KPI', 'Albaranes pendientes', data.pendingCount));
  lines.push(row('KPI', 'Subidas PMP (conteo)', data.priceSpikeCount));
  lines.push(row('KPI', 'Salud', data.health));
  lines.push(row('KPI', 'Incidencias abiertas', data.alertsOpenIncidents));

  lines.push('');
  lines.push('Diario,Fecha,Neto_eur');
  for (const d of data.dailySpend) {
    lines.push(`${escCell('Diario')},${escCell(d.date)},${escCell(d.net)}`);
  }

  lines.push('');
  lines.push('Proveedor,Nombre,Neto_eur,Pct_total,Albaranes,Delta_pct_prev');
  for (const r of data.topSuppliers) {
    lines.push(
      `Proveedor,${escCell(r.supplierName)},${r.net},${r.pctOfTotal},${r.count},${r.deltaVsPrev ?? ''}`,
    );
  }

  lines.push('');
  lines.push('Articulo,Label,Neto_eur,Lineas');
  for (const r of data.topArticles) {
    lines.push(`Articulo,${escCell(r.label)},${r.net},${r.lines}`);
  }

  lines.push('');
  lines.push('Merma,Label,EUR,Pct_compra');
  for (const r of data.topMermas) {
    lines.push(`Merma,${escCell(r.label)},${r.eur},${r.pctOfSpend}`);
  }

  lines.push('');
  lines.push('Precio,Articulo,Proveedor,PMP_ant,PMP_actual,Delta_pct');
  for (const r of data.topPriceIncreases) {
    lines.push(
      `Precio,${escCell(r.label)},${escCell(r.supplierName)},${r.prevAvg},${r.last},${r.deltaPct}`,
    );
  }

  lines.push('');
  lines.push('Revision,Prioridad,Titulo,Impacto,Enlace');
  for (const it of data.reviewItems) {
    lines.push(`Revision,${it.priority},${escCell(it.title)},${escCell(it.impactLabel)},${escCell(it.href)}`);
  }

  lines.push('');
  lines.push('Salud_motivo,Texto');
  data.healthReasons.forEach((t, i) => lines.push(`Motivo_${i + 1},${escCell(t)}`));

  const bom = '\uFEFF';
  const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `finanzas-resumen_${data.periodFrom}_${data.periodTo}.csv`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
