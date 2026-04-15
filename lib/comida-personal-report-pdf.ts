import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { StaffMealRecord, StaffMealService } from '@/lib/comida-personal-supabase';

type DocWithTable = jsPDF & { lastAutoTable?: { finalY?: number } };

const PDF_BRAND: [number, number, number] = [211, 47, 47];
const PDF_ZINC_100: [number, number, number] = [244, 244, 245];
const PDF_ZINC_400: [number, number, number] = [161, 161, 170];
const PDF_ZINC_500: [number, number, number] = [113, 113, 122];
const PDF_ZINC_900: [number, number, number] = [24, 24, 27];
const PDF_WHITE: [number, number, number] = [255, 255, 255];

const SERVICE_ORDER: StaffMealService[] = ['desayuno', 'comida', 'cena', 'snack', 'otro'];

const SERVICE_LABEL: Record<StaffMealService, string> = {
  desayuno: 'Desayuno',
  comida: 'Comida',
  cena: 'Cena',
  snack: 'Snack',
  otro: 'Otro',
};

function pdfFooter(doc: jsPDF, page: number, total: number): void {
  doc.setFontSize(7);
  doc.setTextColor(...PDF_ZINC_400);
  doc.text(
    `Chef-One · ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'medium', timeStyle: 'short' })}`,
    40,
    555,
  );
  const pageW = doc.internal.pageSize.getWidth();
  doc.text(`Página ${page} / ${total}`, pageW - 40, 555, { align: 'right' });
  doc.setTextColor(...PDF_ZINC_900);
}

function parseMonthYm(ym: string): { y: number; m: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isInteger(y) || !Number.isInteger(mo) || mo < 1 || mo > 12) return null;
  return { y, m: mo };
}

function monthBounds(ym: string): { startYmd: string; endYmd: string; daysInMonth: number; labelEs: string } | null {
  const p = parseMonthYm(ym);
  if (!p) return null;
  const start = new Date(p.y, p.m - 1, 1);
  const end = new Date(p.y, p.m, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  const startYmd = `${p.y}-${pad(p.m)}-01`;
  const endYmd = `${p.y}-${pad(p.m)}-${pad(end.getDate())}`;
  const labelEs = start.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  return { startYmd, endYmd, daysInMonth: end.getDate(), labelEs };
}

function formatKeyEs(ymd: string) {
  const [y, mo, d] = ymd.split('-').map(Number);
  if (!y || !mo || !d) return ymd;
  return `${String(d).padStart(2, '0')}/${String(mo).padStart(2, '0')}`;
}

function drawServiceCostBars(
  doc: jsPDF,
  opts: { x: number; y: number; w: number; h: number; items: Array<{ label: string; totalCost: number }> },
): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_ZINC_900);
  doc.text('Coste por servicio (€)', opts.x, opts.y + 11);
  if (opts.items.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_ZINC_500);
    doc.text('Sin datos en el periodo.', opts.x, opts.y + 28);
    doc.setTextColor(...PDF_ZINC_900);
    return;
  }
  const max = Math.max(...opts.items.map((i) => i.totalCost), 0.01);
  const innerTop = opts.y + 22;
  const barH = Math.min(18, (opts.h - 28) / opts.items.length);
  let y = innerTop;
  const wLab = 118;
  for (const it of opts.items) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...PDF_ZINC_500);
    const lines = doc.splitTextToSize(it.label, wLab);
    doc.text(lines, opts.x, y + 8);
    const rowH = Math.max(barH, lines.length * 7 + 2);
    const trackX = opts.x + wLab + 6;
    const trackW = opts.w - wLab - 78;
    doc.setFillColor(...PDF_ZINC_100);
    doc.rect(trackX, y, trackW, rowH, 'F');
    const fillW = Math.max(1.5, (it.totalCost / max) * trackW);
    doc.setFillColor(...PDF_BRAND);
    doc.rect(trackX, y, fillW, rowH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...PDF_ZINC_900);
    doc.text(`${it.totalCost.toFixed(2)} €`, opts.x + opts.w - 4, y + rowH / 2 + 3, { align: 'right' });
    y += rowH + 3;
    doc.setFont('helvetica', 'normal');
    if (y > opts.y + opts.h - 6) break;
  }
}

function drawDailyCostBars(
  doc: jsPDF,
  opts: { x: number; y: number; w: number; h: number; days: Array<{ key: string; cost: number }> },
): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_ZINC_900);
  doc.text('Coste diario en el mes (€)', opts.x, opts.y + 11);
  if (opts.days.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_ZINC_500);
    doc.text('Sin datos.', opts.x, opts.y + 28);
    doc.setTextColor(...PDF_ZINC_900);
    return;
  }
  const max = Math.max(...opts.days.map((d) => d.cost), 0.01);
  const padL = 34;
  const baseY = opts.y + opts.h - 10;
  const chartH = opts.h - 40;
  const innerW = opts.w - padL - 6;
  const gap = 1.2;
  const n = opts.days.length;
  const barW = Math.max(2, Math.min(14, (innerW - gap * (n + 1)) / n));
  let x = opts.x + padL + gap;
  for (const d of opts.days) {
    const bh = (d.cost / max) * chartH;
    doc.setFillColor(...PDF_ZINC_100);
    doc.rect(x, baseY - chartH, barW, chartH, 'F');
    if (bh > 0) {
      doc.setFillColor(...PDF_BRAND);
      doc.rect(x, baseY - bh, barW, bh, 'F');
    }
    if (n <= 31) {
      doc.setFontSize(4.8);
      doc.setTextColor(...PDF_ZINC_400);
      doc.text(String(Number(d.key.slice(-2))), x + barW / 2, baseY + 7, { align: 'center' });
    }
    x += barW + gap;
  }
  if (n > 31) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...PDF_ZINC_500);
    doc.text(`${n} días en el mes`, opts.x + padL, baseY + 10);
  }
  doc.setTextColor(...PDF_ZINC_900);
}

export function downloadStaffMealReportPdf(input: {
  localLabel: string;
  /** Mes del informe YYYY-MM */
  monthYm: string;
  records: StaffMealRecord[];
  generatedByLabel?: string;
}): void {
  const bounds = monthBounds(input.monthYm);
  if (!bounds) {
    throw new Error('Mes del informe inválido. Usa AAAA-MM.');
  }

  const { startYmd, endYmd, daysInMonth, labelEs } = bounds;
  const inMonth = (r: StaffMealRecord) => r.mealDate >= startYmd && r.mealDate <= endYmd;
  const voidedInMonth = input.records.filter((r) => r.voidedAt != null && inMonth(r));
  const active = input.records.filter((r) => r.voidedAt == null && inMonth(r));

  const totalEur = active.reduce((s, r) => s + r.totalCostEur, 0);
  const n = active.length;
  const peopleSum = active.reduce((s, r) => s + r.peopleCount, 0);
  const avgPerReg = n > 0 ? totalEur / n : 0;
  const avgPerPerson = peopleSum > 0 ? totalEur / peopleSum : 0;

  const byServiceCost = new Map<StaffMealService, number>();
  const byServiceRegs = new Map<StaffMealService, number>();
  const byServicePeople = new Map<StaffMealService, number>();
  for (const s of SERVICE_ORDER) {
    byServiceCost.set(s, 0);
    byServiceRegs.set(s, 0);
    byServicePeople.set(s, 0);
  }
  for (const r of active) {
    byServiceCost.set(r.service, (byServiceCost.get(r.service) ?? 0) + r.totalCostEur);
    byServiceRegs.set(r.service, (byServiceRegs.get(r.service) ?? 0) + 1);
    byServicePeople.set(r.service, (byServicePeople.get(r.service) ?? 0) + r.peopleCount);
  }
  let topService: StaffMealService | null = null;
  let topEur = 0;
  for (const s of SERVICE_ORDER) {
    const v = byServiceCost.get(s) ?? 0;
    if (v > topEur) {
      topEur = v;
      topService = s;
    }
  }
  const topPct = totalEur > 0 && topService ? ((byServiceCost.get(topService) ?? 0) / totalEur) * 100 : 0;
  const topLine =
    topService && (byServiceCost.get(topService) ?? 0) > 0
      ? `${SERVICE_LABEL[topService]} (${topPct.toFixed(0)}%)`
      : '—';

  const byDay = new Map<string, number>();
  for (const r of active) {
    byDay.set(r.mealDate, (byDay.get(r.mealDate) ?? 0) + r.totalCostEur);
  }
  const p = parseMonthYm(input.monthYm)!;
  const days: Array<{ key: string; cost: number }> = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const ymd = `${p.y}-${String(p.m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ key: ymd, cost: Math.round((byDay.get(ymd) ?? 0) * 100) / 100 });
  }
  let peakDay: { key: string; cost: number } | null = null;
  for (const d of days) {
    if (!peakDay || d.cost > peakDay.cost) peakDay = d;
  }
  const daysWithCost = days.filter((d) => d.cost > 0).length;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentW = pageW - margin * 2;

  doc.setFillColor(...PDF_BRAND);
  doc.rect(0, 0, pageW, 14, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_WHITE);
  doc.text('CHEF-ONE', margin, 10);
  doc.setFont('helvetica', 'normal');
  doc.text('Comida de personal · Coste interno', pageW - margin, 10, { align: 'right' });
  doc.setTextColor(...PDF_ZINC_900);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Resumen mensual (PDF)', margin, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...PDF_ZINC_500);
  doc.text(`Local: ${input.localLabel}`, margin, 58);
  doc.text(`Periodo: ${labelEs} (${formatKeyEs(startYmd)} – ${formatKeyEs(endYmd)})`, margin, 72);
  if (input.generatedByLabel?.trim()) {
    doc.text(`Generado por: ${input.generatedByLabel.trim()}`, margin, 86);
  }
  doc.setFontSize(9);
  doc.setTextColor(...PDF_ZINC_500);
  doc.text(
    'Informe económico para imputar consumo de personal a coste de personal. Solo registros activos (no anulados). Importes en € IVA excluido según €/persona registrados.',
    margin,
    input.generatedByLabel?.trim() ? 100 : 86,
    { maxWidth: contentW },
  );

  const kpiY = input.generatedByLabel?.trim() ? 118 : 104;
  const gap = 8;
  const nKpi = 6;
  const kpiW = (contentW - (nKpi - 1) * gap) / nKpi;
  const kpiH = 52;
  const peakLabel =
    peakDay && peakDay.cost > 0 ? `${formatKeyEs(peakDay.key)} · ${peakDay.cost.toFixed(2)} €` : '—';
  const kpis: [string, string][] = [
    ['Coste total', `${totalEur.toFixed(2)} €`],
    ['Registros', String(n)],
    ['Personas (Σ)', peopleSum.toLocaleString('es-ES', { maximumFractionDigits: 2 })],
    ['Media / registro', n > 0 ? `${avgPerReg.toFixed(2)} €` : '—'],
    ['Media / persona', peopleSum > 0 ? `${avgPerPerson.toFixed(2)} €` : '—'],
    ['Servicio principal', topLine],
  ];
  for (let i = 0; i < nKpi; i++) {
    const x = margin + i * (kpiW + gap);
    doc.setFillColor(...PDF_ZINC_100);
    doc.roundedRect(x, kpiY, kpiW, kpiH, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(...PDF_ZINC_500);
    doc.text(kpis[i]![0], x + 8, kpiY + 15);
    doc.setFontSize(10);
    doc.setTextColor(...PDF_ZINC_900);
    const valLines = doc.splitTextToSize(kpis[i]![1], kpiW - 14);
    doc.text(valLines, x + 8, kpiY + 34);
  }

  let yAfterKpi = kpiY + kpiH + 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_ZINC_500);
  doc.text(
    `Días con coste > 0: ${daysWithCost} / ${daysInMonth} · Pico diario: ${peakLabel} · Registros anulados en el mes (excluidos): ${voidedInMonth.length}`,
    margin,
    yAfterKpi,
    { maxWidth: contentW },
  );
  yAfterKpi += 18;

  const chartY = yAfterKpi;
  const chartH = 156;
  const chartGap = 14;
  const leftW = contentW * 0.42;
  const rightW = contentW - leftW - chartGap;
  const serviceItems = SERVICE_ORDER.map((s) => ({
    label: SERVICE_LABEL[s],
    totalCost: Math.round((byServiceCost.get(s) ?? 0) * 100) / 100,
  })).filter((x) => x.totalCost > 0);
  drawServiceCostBars(doc, { x: margin, y: chartY, w: leftW, h: chartH, items: serviceItems });
  drawDailyCostBars(doc, { x: margin + leftW + chartGap, y: chartY, w: rightW, h: chartH, days });
  yAfterKpi = chartY + chartH + 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...PDF_ZINC_900);
  doc.text('Agregado por servicio', margin, yAfterKpi);
  const summaryBody = SERVICE_ORDER.map((s) => {
    const cost = byServiceCost.get(s) ?? 0;
    const regs = byServiceRegs.get(s) ?? 0;
    const pers = byServicePeople.get(s) ?? 0;
    const pct = totalEur > 0 ? (cost / totalEur) * 100 : 0;
    return [
      SERVICE_LABEL[s],
      String(regs),
      pers.toLocaleString('es-ES', { maximumFractionDigits: 2 }),
      `${cost.toFixed(2)} €`,
      totalEur > 0 ? `${pct.toFixed(1)} %` : '—',
    ];
  });
  autoTable(doc, {
    startY: yAfterKpi + 6,
    head: [['Servicio', 'Registros', 'Personas (Σ)', 'Total €', '% del coste']],
    body: summaryBody,
    styles: { fontSize: 8, cellPadding: 3, textColor: PDF_ZINC_900 },
    headStyles: { fillColor: PDF_BRAND, textColor: PDF_WHITE },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: margin, right: margin },
    tableWidth: Math.min(520, contentW * 0.62),
  });
  yAfterKpi = (doc as DocWithTable).lastAutoTable?.finalY ?? yAfterKpi + 60;
  yAfterKpi += 12;

  if (yAfterKpi > pageH - 120) {
    doc.addPage();
    yAfterKpi = 36;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...PDF_ZINC_900);
  doc.text('Detalle de registros (más reciente primero)', margin, yAfterKpi);

  const sorted = [...active].sort((a, b) => {
    const da = a.mealDate.localeCompare(b.mealDate);
    if (da !== 0) return da < 0 ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });

  const body =
    sorted.length === 0
      ? [['—', '—', '—', '—', '—', '—', 'Sin registros activos en el mes']]
      : sorted.map((r) => {
          const notes = (r.notes ?? '').trim();
          const notesShort = notes.length > 48 ? `${notes.slice(0, 45)}…` : notes;
          return [
            formatKeyEs(r.mealDate),
            new Date(r.createdAt).toLocaleString('es-ES', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }),
            SERVICE_LABEL[r.service],
            String(r.peopleCount),
            `${r.unitCostEur.toFixed(2)} €`,
            `${r.totalCostEur.toFixed(2)} €`,
            notesShort || '—',
          ];
        });

  autoTable(doc, {
    startY: yAfterKpi + 10,
    head: [['Fecha servicio', 'Alta registro', 'Servicio', 'Pers.', '€/pers.', 'Total €', 'Notas']],
    body,
    styles: { fontSize: 7, cellPadding: 2.5, textColor: PDF_ZINC_900 },
    headStyles: { fillColor: PDF_BRAND, textColor: PDF_WHITE, fontSize: 7.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 6: { cellWidth: 130 } },
    margin: { left: margin, right: margin },
  });

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    pdfFooter(doc, p, totalPages);
  }

  const stamp = input.monthYm.replace(/-/g, '');
  doc.save(`comida-personal-${stamp}.pdf`);
}
