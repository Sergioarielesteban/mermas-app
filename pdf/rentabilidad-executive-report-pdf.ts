import jsPDF from 'jspdf';
import {
  card,
  compactNumber,
  drawExecutiveLogo,
  EXEC_PDF,
  fcColor,
  loadExecutiveReportLogo,
  money,
  pct,
  sectionTitle,
  truncate,
} from '@/components/pdf/executive-report-primitives';
import {
  CHEF_ONE_TARGET_FOOD_COST_PCT,
  type ExecutiveProfitabilityReportData,
  type ExecutiveReportRecipeRow,
  type FoodCostDistributionRow,
  type IngredientImpactRow,
} from '@/lib/rentabilidad-executive-report-data';

const PW = 595.28;
const PH = 841.89;
const M = 34;
const CW = PW - M * 2;
const FOOTER_Y = PH - 24;

function generatedDate(date: Date): string {
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fileDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function safeFileName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80) || 'informe-rentabilidad';
}

function drawPageBase(doc: jsPDF, report: ExecutiveProfitabilityReportData, page: number, total?: number): void {
  doc.setFillColor(...EXEC_PDF.white);
  doc.rect(0, 0, PW, PH, 'F');
  drawPageFooter(doc, report, page, total);
}

function drawPageFooter(doc: jsPDF, report: ExecutiveProfitabilityReportData, page: number, total?: number): void {
  doc.setDrawColor(...EXEC_PDF.line);
  doc.setLineWidth(0.35);
  doc.line(M, FOOTER_Y - 10, PW - M, FOOTER_Y - 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(...EXEC_PDF.muted);
  doc.text(`Generado: ${generatedDate(report.generatedAt)}`, M, FOOTER_Y);
  doc.text(total ? `Página ${page}/${total}` : `Página ${page}`, PW - M, FOOTER_Y, { align: 'right' });
}

function drawTopHeader(doc: jsPDF, report: ExecutiveProfitabilityReportData): void {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...EXEC_PDF.muted);
  doc.text(report.localName, PW - M, 28, { align: 'right' });
  doc.text(report.period.label, PW - M, 39, { align: 'right' });
}

function drawKpiCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  label: string,
  value: string,
  tone: [number, number, number],
  note?: string,
): void {
  card(doc, x, y, w, 58);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...EXEC_PDF.muted);
  doc.text(label.toUpperCase(), x + 11, y + 16);
  doc.setFont('times', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...tone);
  doc.text(value, x + 11, y + 38);
  if (note) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(...EXEC_PDF.muted);
    doc.text(note, x + 11, y + 49);
  }
}

function bucketColor(row: FoodCostDistributionRow): [number, number, number] {
  if (row.bucket === 'lt25') return EXEC_PDF.olive;
  if (row.bucket === '25_30') return EXEC_PDF.blue;
  if (row.bucket === '30_35') return EXEC_PDF.amber;
  return EXEC_PDF.danger;
}

async function donutDataUrl(rows: FoodCostDistributionRow[]): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 260;
  canvas.height = 260;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const total = rows.reduce((acc, row) => acc + row.count, 0);
  const cx = 130;
  const cy = 130;
  const r = 78;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 34;
  ctx.lineCap = 'butt';
  let start = -Math.PI / 2;
  if (total === 0) {
    ctx.strokeStyle = '#e5ded4';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    for (const row of rows) {
      const slice = (row.count / total) * Math.PI * 2;
      const color = bucketColor(row);
      ctx.strokeStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
      ctx.beginPath();
      ctx.arc(cx, cy, r, start, start + slice);
      ctx.stroke();
      start += slice;
    }
  }
  ctx.fillStyle = '#120e0a';
  ctx.font = 'bold 30px serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(total), cx, cy + 2);
  ctx.fillStyle = '#746c62';
  ctx.font = '14px sans-serif';
  ctx.fillText('recetas', cx, cy + 24);
  return canvas.toDataURL('image/png');
}

async function lineChartDataUrl(report: ExecutiveProfitabilityReportData): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const points = report.evolution;
  if (!points.length) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 210;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const l = 34;
  const r = 18;
  const t = 18;
  const b = 34;
  const w = canvas.width - l - r;
  const h = canvas.height - t - b;
  const values = points.map((p) => p.foodCostPct).filter((v): v is number => v != null);
  const minV = Math.min(20, CHEF_ONE_TARGET_FOOD_COST_PCT, ...values);
  const maxV = Math.max(45, CHEF_ONE_TARGET_FOOD_COST_PCT, ...values);
  const yFor = (v: number) => t + ((maxV - v) / (maxV - minV)) * h;
  const xFor = (idx: number) => l + (points.length <= 1 ? w / 2 : (idx / (points.length - 1)) * w);

  ctx.strokeStyle = '#e2dcd4';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i += 1) {
    const y = t + (i / 3) * h;
    ctx.beginPath();
    ctx.moveTo(l, y);
    ctx.lineTo(l + w, y);
    ctx.stroke();
  }
  ctx.strokeStyle = '#c4531f';
  ctx.setLineDash([6, 5]);
  const targetY = yFor(CHEF_ONE_TARGET_FOOD_COST_PCT);
  ctx.beginPath();
  ctx.moveTo(l, targetY);
  ctx.lineTo(l + w, targetY);
  ctx.stroke();
  ctx.setLineDash([]);

  const realPoints = points
    .map((p, idx) => (p.foodCostPct == null ? null : { x: xFor(idx), y: yFor(p.foodCostPct) }))
    .filter((p): p is { x: number; y: number } => p != null);
  if (realPoints.length) {
    ctx.strokeStyle = '#4a6b3a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    realPoints.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.fillStyle = '#4a6b3a';
    for (const p of realPoints) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = '#746c62';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  points.forEach((p, idx) => {
    if (idx % Math.ceil(points.length / 6) === 0 || idx === points.length - 1) {
      ctx.fillText(p.label.slice(5), xFor(idx), canvas.height - 10);
    }
  });
  ctx.textAlign = 'left';
  ctx.fillText('Objetivo 30%', l + 4, targetY - 7);
  return canvas.toDataURL('image/png');
}

function drawKpis(doc: jsPDF, report: ExecutiveProfitabilityReportData, y: number): void {
  const gap = 9;
  const w = (CW - gap * 3) / 4;
  drawKpiCard(doc, M, y, w, 'Recetas activas', compactNumber(report.kpis.activeRecipes), EXEC_PDF.ink);
  drawKpiCard(doc, M + (w + gap), y, w, 'Food Cost medio', pct(report.kpis.avgFoodCostPct), fcColor(report.kpis.avgFoodCostPct), `${report.kpis.recipesWithFoodCost} con FC`);
  drawKpiCard(doc, M + (w + gap) * 2, y, w, 'Margen medio', pct(report.kpis.avgMarginPct), fcColor(report.kpis.avgFoodCostPct));
  drawKpiCard(doc, M + (w + gap) * 3, y, w, 'PVP medio', money(report.kpis.avgPvpGrossEur), EXEC_PDF.ink);
}

function drawRecipeList(doc: jsPDF, title: string, rows: ExecutiveReportRecipeRow[], x: number, y: number, w: number): void {
  const showMargin = title.toLowerCase().includes('rentables');
  sectionTitle(doc, title, x, y, w);
  let cy = y + 16;
  rows.slice(0, 10).forEach((row, idx) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...EXEC_PDF.muted);
    doc.text(String(idx + 1).padStart(2, '0'), x, cy);
    doc.setTextColor(...EXEC_PDF.ink);
    doc.text(truncate(doc, row.name, w - 52), x + 18, cy);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(showMargin ? EXEC_PDF.olive : fcColor(row.foodCostPct)));
    doc.text(showMargin ? pct(row.marginPct) : pct(row.foodCostPct), x + w, cy, { align: 'right' });
    cy += 13;
  });
  if (!rows.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...EXEC_PDF.muted);
    doc.text('Sin datos suficientes.', x, cy);
  }
}

function drawFamilyTable(doc: jsPDF, report: ExecutiveProfitabilityReportData, x: number, y: number, w: number): void {
  sectionTitle(doc, 'Rentabilidad por familia', x, y, w);
  let cy = y + 17;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.4);
  doc.setTextColor(...EXEC_PDF.muted);
  doc.text('Familia', x, cy);
  doc.text('Recetas', x + w - 118, cy, { align: 'right' });
  doc.text('FC medio', x + w - 56, cy, { align: 'right' });
  doc.text('Margen', x + w, cy, { align: 'right' });
  cy += 10;
  for (const row of report.families.slice(0, 8)) {
    doc.setDrawColor(...EXEC_PDF.line);
    doc.setLineWidth(0.25);
    doc.line(x, cy - 6, x + w, cy - 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...EXEC_PDF.ink);
    doc.text(truncate(doc, row.family, w - 145), x, cy);
    doc.setTextColor(...EXEC_PDF.muted);
    doc.text(String(row.recipes), x + w - 118, cy, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...fcColor(row.avgFoodCostPct));
    doc.text(pct(row.avgFoodCostPct), x + w - 56, cy, { align: 'right' });
    doc.setTextColor(...EXEC_PDF.ink);
    doc.text(pct(row.avgMarginPct), x + w, cy, { align: 'right' });
    cy += 12;
  }
}

function drawAlertsAndRecommendations(doc: jsPDF, report: ExecutiveProfitabilityReportData, x: number, y: number, w: number): void {
  sectionTitle(doc, 'Alertas Chef One', x, y, w);
  let cy = y + 16;
  report.alerts.slice(0, 4).forEach((alert) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...(alert.count > 0 ? EXEC_PDF.red : EXEC_PDF.olive));
    doc.text(`${alert.count}`, x, cy);
    doc.setTextColor(...EXEC_PDF.ink);
    doc.text(alert.label, x + 18, cy);
    if (alert.impactEur != null) {
      doc.setTextColor(...EXEC_PDF.muted);
      doc.text(money(alert.impactEur), x + w, cy, { align: 'right' });
    }
    cy += 11;
  });

  cy += 6;
  sectionTitle(doc, 'Recomendaciones Chef One', x, cy, w);
  cy += 16;
  report.recommendations.slice(0, 3).forEach((rec) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...EXEC_PDF.ink);
    doc.text(truncate(doc, rec.title, w), x, cy);
    cy += 9;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...EXEC_PDF.muted);
    const lines = doc.splitTextToSize(rec.detail, w) as string[];
    doc.text(lines.slice(0, 2), x, cy);
    cy += Math.min(2, lines.length) * 8 + 4;
  });
}

async function drawPageOne(doc: jsPDF, report: ExecutiveProfitabilityReportData): Promise<void> {
  drawPageBase(doc, report, 1);
  const logo = await loadExecutiveReportLogo();
  drawExecutiveLogo(doc, logo, M, 16, 96);
  drawTopHeader(doc, report);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(...EXEC_PDF.red);
  doc.text('BUSINESS INTELLIGENCE · RENTABILIDAD', M, 78);
  doc.setFont('times', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(...EXEC_PDF.ink);
  doc.text('Informe Ejecutivo de Rentabilidad', M, 106);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...EXEC_PDF.muted);
  doc.text('Resumen global de escandallos y rentabilidad', M, 123);

  drawKpis(doc, report, 146);

  const leftW = 245;
  const rightX = M + leftW + 24;
  const rightW = CW - leftW - 24;

  sectionTitle(doc, 'Distribución Food Cost', M, 240, leftW);
  const donut = await donutDataUrl(report.distribution);
  if (donut) doc.addImage(donut, 'PNG', M + 8, 251, 112, 112);
  let ly = 265;
  report.distribution.forEach((row) => {
    const c = bucketColor(row);
    doc.setFillColor(...c);
    doc.circle(M + 142, ly - 3, 3, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...EXEC_PDF.ink);
    doc.text(row.label, M + 151, ly);
    doc.setFont('helvetica', 'bold');
    doc.text(`${row.count} · ${pct(row.pct)}`, M + leftW, ly, { align: 'right' });
    ly += 17;
  });

  drawFamilyTable(doc, report, rightX, 240, rightW);
  drawRecipeList(doc, 'Top rentables (margen)', report.topProfitable, M, 392, leftW);
  drawRecipeList(doc, 'Top a revisar', report.topReview, rightX, 392, rightW);

  sectionTitle(doc, 'Evolución Food Cost Medio', M, 570, leftW);
  const chart = await lineChartDataUrl(report);
  if (chart) {
    doc.addImage(chart, 'PNG', M, 584, leftW, 82);
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...EXEC_PDF.muted);
    doc.text('Sin datos suficientes para dibujar la evolución.', M, 593);
  }

  drawAlertsAndRecommendations(doc, report, rightX, 570, rightW);
}

function recipeTone(row: ExecutiveReportRecipeRow): [number, number, number] {
  return fcColor(row.foodCostPct);
}

function drawRankingHeader(doc: jsPDF, y: number): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...EXEC_PDF.muted);
  doc.text('Receta', M, y);
  doc.text('Familia', M + 215, y);
  doc.text('Coste', M + 334, y, { align: 'right' });
  doc.text('PVP', M + 399, y, { align: 'right' });
  doc.text('Food Cost', M + 466, y, { align: 'right' });
  doc.text('Margen', M + CW, y, { align: 'right' });
}

function drawRankingPage(doc: jsPDF, report: ExecutiveProfitabilityReportData): void {
  doc.addPage();
  drawPageBase(doc, report, 2);
  sectionTitle(doc, 'Ranking completo de recetas', M, 52, CW);
  drawRankingHeader(doc, 76);
  let y = 92;
  report.ranking.slice(0, 42).forEach((row, idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(...EXEC_PDF.soft);
      doc.rect(M - 4, y - 9, CW + 8, 16, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...EXEC_PDF.ink);
    doc.text(truncate(doc, row.name, 205), M, y);
    doc.setTextColor(...EXEC_PDF.muted);
    doc.text(truncate(doc, row.family, 100), M + 215, y);
    doc.text(money(row.costEur), M + 334, y, { align: 'right' });
    doc.text(money(row.pvpGrossEur), M + 399, y, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...recipeTone(row));
    doc.text(pct(row.foodCostPct), M + 466, y, { align: 'right' });
    doc.setTextColor(...EXEC_PDF.ink);
    doc.text(pct(row.marginPct), M + CW, y, { align: 'right' });
    y += 16;
  });
}

function drawIngredientPage(doc: jsPDF, report: ExecutiveProfitabilityReportData): void {
  doc.addPage();
  drawPageBase(doc, report, 3);
  sectionTitle(doc, 'Impacto de ingredientes', M, 52, CW);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...EXEC_PDF.muted);
  doc.text('Simulación read-only del impacto económico si el PMP del ingrediente sube +5%, +10% o +20%.', M, 68);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text('Ingrediente', M, 95);
  doc.text('PMP actual', M + 230, 95, { align: 'right' });
  doc.text('Recetas', M + 294, 95, { align: 'right' });
  doc.text('+5%', M + 370, 95, { align: 'right' });
  doc.text('+10%', M + 448, 95, { align: 'right' });
  doc.text('+20%', M + CW, 95, { align: 'right' });

  let y = 112;
  const rows = report.ingredientImpact.slice(0, 34);
  rows.forEach((row: IngredientImpactRow, idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(...EXEC_PDF.soft);
      doc.rect(M - 4, y - 9, CW + 8, 16, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...EXEC_PDF.ink);
    doc.text(truncate(doc, row.ingredientName, 205), M, y);
    doc.setTextColor(...EXEC_PDF.muted);
    doc.text(money(row.pmpCurrentEur), M + 230, y, { align: 'right' });
    doc.text(String(row.affectedRecipes), M + 294, y, { align: 'right' });
    doc.text(money(row.impact5Eur), M + 370, y, { align: 'right' });
    doc.text(money(row.impact10Eur), M + 448, y, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...EXEC_PDF.red);
    doc.text(money(row.impact20Eur), M + CW, y, { align: 'right' });
    y += 16;
  });
  if (!rows.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...EXEC_PDF.muted);
    doc.text('Sin ingredientes estratégicos suficientes para calcular impacto.', M, 120);
  }
}

export async function downloadExecutiveProfitabilityReportPdf(
  report: ExecutiveProfitabilityReportData,
): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  await drawPageOne(doc, report);
  drawRankingPage(doc, report);
  drawIngredientPage(doc, report);

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    drawPageFooter(doc, report, p, total);
  }

  const blobUrl = doc.output('bloburl');
  if (typeof window !== 'undefined') {
    const win = window.open(blobUrl, '_blank', 'noopener,noreferrer');
    if (win) return;
  }
  doc.save(`chef-one-informe-rentabilidad-${safeFileName(report.localName)}-${fileDate(report.generatedAt)}.pdf`);
}
