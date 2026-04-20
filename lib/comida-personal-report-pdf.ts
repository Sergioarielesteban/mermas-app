import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { isStaffMealOwnFood, type StaffMealRecord, type StaffMealService } from '@/lib/comida-personal-supabase';

type DocWithTable = jsPDF & { lastAutoTable?: { finalY?: number } };

const PDF_BRAND: [number, number, number] = [211, 47, 47];
const PDF_ZINC_100: [number, number, number] = [244, 244, 245];
const PDF_ZINC_400: [number, number, number] = [161, 161, 170];
const PDF_ZINC_500: [number, number, number] = [113, 113, 122];
const PDF_ZINC_900: [number, number, number] = [24, 24, 27];
const PDF_WHITE: [number, number, number] = [255, 255, 255];
const PDF_MUTED_BAR: [number, number, number] = [180, 180, 187];

const SERVICE_ORDER: StaffMealService[] = ['desayuno', 'comida', 'cena', 'snack', 'otro'];

const SERVICE_LABEL: Record<StaffMealService, string> = {
  desayuno: 'Desayuno',
  comida: 'Comida',
  cena: 'Cena',
  snack: 'Snack',
  otro: 'Otro',
};

type MonthAggregate = {
  monthYm: string;
  labelEs: string;
  startYmd: string;
  endYmd: string;
  daysInMonth: number;
  voidedInMonth: StaffMealRecord[];
  active: StaffMealRecord[];
  totalEur: number;
  n: number;
  peopleSum: number;
  avgPerReg: number;
  avgPerPerson: number;
  byServiceCost: Map<StaffMealService, number>;
  byServiceRegs: Map<StaffMealService, number>;
  byServicePeople: Map<StaffMealService, number>;
  days: Array<{ key: string; cost: number }>;
  peakDay: { key: string; cost: number } | null;
  daysWithCost: number;
  topLine: string;
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

function previousMonthYm(ym: string): string | null {
  const p = parseMonthYm(ym);
  if (!p) return null;
  if (p.m === 1) return `${p.y - 1}-12`;
  return `${p.y}-${String(p.m - 1).padStart(2, '0')}`;
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

function aggregateMonth(records: StaffMealRecord[], monthYm: string): MonthAggregate | null {
  const bounds = monthBounds(monthYm);
  if (!bounds) return null;
  const { startYmd, endYmd, daysInMonth, labelEs } = bounds;
  const inMonth = (r: StaffMealRecord) => r.mealDate >= startYmd && r.mealDate <= endYmd;
  const voidedInMonth = records.filter((r) => r.voidedAt != null && inMonth(r));
  const active = records.filter((r) => r.voidedAt == null && inMonth(r));

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
  const p = parseMonthYm(monthYm)!;
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

  return {
    monthYm,
    labelEs,
    startYmd,
    endYmd,
    daysInMonth,
    voidedInMonth,
    active,
    totalEur,
    n,
    peopleSum,
    avgPerReg,
    avgPerPerson,
    byServiceCost,
    byServiceRegs,
    byServicePeople,
    days,
    peakDay,
    daysWithCost,
    topLine,
  };
}

function fmtDeltaAbs(prev: number, curr: number, suffix = ''): string {
  const d = curr - prev;
  if (Math.abs(d) < 1e-9) return `0${suffix}`;
  const sign = d > 0 ? '+' : '';
  return `${sign}${d.toLocaleString('es-ES', { maximumFractionDigits: 2 })}${suffix}`;
}

function fmtDeltaPct(prev: number, curr: number): string {
  if (prev === 0 && curr === 0) return '—';
  if (prev === 0) return curr > 0 ? 'Nuevo' : '—';
  const pct = ((curr - prev) / prev) * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)} %`;
}

function drawTwoMonthTotalCompare(
  doc: jsPDF,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    labelPrev: string;
    valuePrev: number;
    labelCurr: string;
    valueCurr: number;
  },
): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_ZINC_900);
  doc.text('Coste total: mes anterior vs mes del informe (€)', opts.x, opts.y + 11);
  const max = Math.max(opts.valuePrev, opts.valueCurr, 0.01);
  const baseY = opts.y + opts.h - 8;
  const chartH = opts.h - 36;
  const colW = (opts.w - 24) / 2;
  const barW = Math.min(56, colW - 20);
  const centers = [opts.x + colW / 2, opts.x + colW + 12 + colW / 2];

  const drawBar = (cx: number, label: string, val: number, color: [number, number, number]) => {
    const bh = (val / max) * chartH;
    doc.setFillColor(...PDF_ZINC_100);
    doc.rect(cx - barW / 2, baseY - chartH, barW, chartH, 'F');
    if (bh > 0) {
      doc.setFillColor(...color);
      doc.rect(cx - barW / 2, baseY - bh, barW, bh, 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_ZINC_900);
    doc.text(`${val.toFixed(2)} €`, cx, baseY - chartH - 6, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...PDF_ZINC_500);
    const lines = doc.splitTextToSize(label, colW - 4);
    doc.text(lines, cx, baseY + 10, { align: 'center' });
  };

  drawBar(centers[0]!, opts.labelPrev, opts.valuePrev, PDF_MUTED_BAR);
  drawBar(centers[1]!, opts.labelCurr, opts.valueCurr, PDF_BRAND);
  doc.setTextColor(...PDF_ZINC_900);
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

function drawServiceMoMCompare(
  doc: jsPDF,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    prev: MonthAggregate;
    curr: MonthAggregate;
  },
): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_ZINC_900);
  doc.text('Coste por servicio: anterior vs informe (€)', opts.x, opts.y + 11);
  const innerTop = opts.y + 22;
  const row0 = innerTop;
  const max = Math.max(
    ...SERVICE_ORDER.map((s) => Math.max(opts.prev.byServiceCost.get(s) ?? 0, opts.curr.byServiceCost.get(s) ?? 0)),
    0.01,
  );
  const wLab = 86;
  const trackW = opts.w - wLab - 112;
  const gap = 5;
  const pairW = (trackW - gap) / 2;
  let y = row0;
  for (const s of SERVICE_ORDER) {
    const a = opts.prev.byServiceCost.get(s) ?? 0;
    const b = opts.curr.byServiceCost.get(s) ?? 0;
    if (a <= 0 && b <= 0) continue;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_ZINC_500);
    doc.text(SERVICE_LABEL[s], opts.x, y + 9);
    const trackX = opts.x + wLab;
    const barH = 10;
    doc.setFillColor(...PDF_ZINC_100);
    doc.rect(trackX, y, pairW, barH, 'F');
    doc.rect(trackX + pairW + gap, y, pairW, barH, 'F');
    const fa = (a / max) * pairW;
    const fb = (b / max) * pairW;
    if (fa > 0) {
      doc.setFillColor(...PDF_MUTED_BAR);
      doc.rect(trackX, y, Math.max(1, fa), barH, 'F');
    }
    if (fb > 0) {
      doc.setFillColor(...PDF_BRAND);
      doc.rect(trackX + pairW + gap, y, Math.max(1, fb), barH, 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...PDF_ZINC_900);
    doc.text(`${a.toFixed(2)}`, trackX + pairW - 2, y + 7, { align: 'right' });
    doc.text(`${b.toFixed(2)}`, trackX + pairW + gap + pairW - 2, y + 7, { align: 'right' });
    y += barH + 8;
    if (y > opts.y + opts.h - 4) break;
  }
  if (y === row0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_ZINC_500);
    doc.text('Sin datos comparables por servicio.', opts.x, innerTop + 14);
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...PDF_ZINC_400);
    doc.text('Izq. = mes anterior · Der. = mes informe', opts.x + wLab, y + 4);
  }
  doc.setTextColor(...PDF_ZINC_900);
}

type WorkerTotalsRow = {
  workerKey: string;
  name: string;
  meals: number;
  units: number;
  totalEur: number;
  ownMealDays: number;
  ownMealRegs: number;
};

function ingredientLabelForReport(r: StaffMealRecord): string {
  const n = r.sourceProductName?.trim();
  if (n) return n;
  return '(sin artículo catalogado)';
}

function formatOwnMealSummaryCell(days: number, regs: number): string {
  if (regs === 0) return '—';
  if (regs === days) {
    return `${days} día${days === 1 ? '' : 's'}`;
  }
  return `${days} día${days === 1 ? '' : 's'} · ${regs} reg.`;
}

function aggregateWorkerTotalsForPdf(active: StaffMealRecord[]): WorkerTotalsRow[] {
  const map = new Map<
    string,
    {
      name: string;
      totalEur: number;
      units: number;
      groupIds: Set<string>;
      loose: number;
      ownMealDates: Set<string>;
      ownMealRegs: number;
    }
  >();
  for (const r of active) {
    const k = r.workerId ?? '__no_worker__';
    const name = r.workerName ?? 'Sin trabajador';
    const cur =
      map.get(k) ??
      {
        name,
        totalEur: 0,
        units: 0,
        groupIds: new Set<string>(),
        loose: 0,
        ownMealDates: new Set<string>(),
        ownMealRegs: 0,
      };
    cur.totalEur += r.totalCostEur;
    cur.units += r.peopleCount;
    if (isStaffMealOwnFood(r)) {
      cur.ownMealRegs += 1;
      cur.ownMealDates.add(r.mealDate);
    }
    if (r.consumptionGroupId) cur.groupIds.add(r.consumptionGroupId);
    else cur.loose += 1;
    map.set(k, cur);
  }
  return Array.from(map.entries())
    .map(([workerKey, v]) => ({
      workerKey,
      name: v.name,
      meals: v.groupIds.size + v.loose,
      units: v.units,
      totalEur: v.totalEur,
      ownMealDays: v.ownMealDates.size,
      ownMealRegs: v.ownMealRegs,
    }))
    .sort((a, b) => b.totalEur - a.totalEur);
}

function top3IngredientsForWorker(active: StaffMealRecord[], workerKey: string): Array<{ ingredient: string; units: number }> {
  const byIng = new Map<string, number>();
  for (const r of active) {
    const k = r.workerId ?? '__no_worker__';
    if (k !== workerKey) continue;
    const ing = ingredientLabelForReport(r);
    byIng.set(ing, (byIng.get(ing) ?? 0) + r.peopleCount);
  }
  return Array.from(byIng.entries())
    .map(([ingredient, units]) => ({ ingredient, units }))
    .sort((a, b) => b.units - a.units || a.ingredient.localeCompare(b.ingredient, 'es'))
    .slice(0, 3);
}

function appendWorkerTotalsTable(
  doc: jsPDF,
  opts: { margin: number; contentW: number; pageH: number; title: string; active: StaffMealRecord[]; startY: number },
): number {
  let y = opts.startY;
  if (y > opts.pageH - 100) {
    doc.addPage();
    y = 36;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...PDF_ZINC_900);
  doc.text(opts.title, opts.margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...PDF_ZINC_500);
  const noteBlock = doc.splitTextToSize(
    '«Trajo su comida»: días distintos del mes en los que consta consumo propio (registro «Comida propia», coste 0). Si hay varios registros el mismo día se indica «días · reg.».',
    opts.contentW,
  );
  doc.text(noteBlock, opts.margin, y + 14);
  const noteLineCount = Array.isArray(noteBlock) ? noteBlock.length : 1;

  const rows = aggregateWorkerTotalsForPdf(opts.active);
  const body =
    rows.length === 0
      ? [['—', '—', '—', '—', '—']]
      : rows.map((r) => [
          r.name,
          String(r.meals),
          r.units.toLocaleString('es-ES', { maximumFractionDigits: 2 }),
          formatOwnMealSummaryCell(r.ownMealDays, r.ownMealRegs),
          `${r.totalEur.toFixed(2)} €`,
        ]);

  const tableStartY = y + 14 + noteLineCount * 7 + 4;

  autoTable(doc, {
    startY: tableStartY,
    head: [['Trabajador', 'Comidas registradas', 'Uds (Σ)', 'Trajo su comida', 'Total €']],
    body,
    styles: { fontSize: 8, cellPadding: 3, textColor: PDF_ZINC_900 },
    headStyles: { fillColor: PDF_BRAND, textColor: PDF_WHITE },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: opts.margin, right: opts.margin },
    tableWidth: Math.min(620, opts.contentW * 0.78),
  });
  return (doc as DocWithTable).lastAutoTable?.finalY ?? y + 40;
}

function formatIngredientTopCell(ingredient: string, units: number, doc: jsPDF, maxW: number): string {
  const u = units.toLocaleString('es-ES', { maximumFractionDigits: 2 });
  const base = `${ingredient} · ${u} uds`;
  const lines = doc.splitTextToSize(base, maxW);
  return Array.isArray(lines) ? lines.join('\n') : base;
}

function appendWorkerTopIngredientsTable(
  doc: jsPDF,
  opts: { margin: number; contentW: number; pageH: number; title: string; active: StaffMealRecord[]; startY: number },
): number {
  let y = opts.startY;
  if (y > opts.pageH - 120) {
    doc.addPage();
    y = 36;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...PDF_ZINC_900);
  doc.text(opts.title, opts.margin, y);

  const rows = aggregateWorkerTotalsForPdf(opts.active);
  const colWIngredient = (opts.contentW - 100) / 3;
  const body =
    rows.length === 0
      ? [['—', '—', '—', '—']]
      : rows.map((r) => {
          const top = top3IngredientsForWorker(opts.active, r.workerKey);
          const cell = (i: number) => {
            const t = top[i];
            return t ? formatIngredientTopCell(t.ingredient, t.units, doc, colWIngredient - 8) : '—';
          };
          return [r.name, cell(0), cell(1), cell(2)];
        });

  autoTable(doc, {
    startY: y + 10,
    head: [['Trabajador', '1.º ingrediente (uds)', '2.º ingrediente (uds)', '3.º ingrediente (uds)']],
    body,
    styles: { fontSize: 7.5, cellPadding: 3, textColor: PDF_ZINC_900, valign: 'top' },
    headStyles: { fillColor: PDF_BRAND, textColor: PDF_WHITE, fontSize: 7.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: opts.margin, right: opts.margin },
    tableWidth: opts.contentW,
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: colWIngredient },
      2: { cellWidth: colWIngredient },
      3: { cellWidth: colWIngredient },
    },
  });
  return (doc as DocWithTable).lastAutoTable?.finalY ?? y + 40;
}

export function downloadStaffMealReportPdf(input: {
  localLabel: string;
  /** Mes del informe YYYY-MM */
  monthYm: string;
  records: StaffMealRecord[];
  generatedByLabel?: string;
}): void {
  const cur = aggregateMonth(input.records, input.monthYm);
  if (!cur) {
    throw new Error('Mes del informe inválido. Usa AAAA-MM.');
  }

  const prevYm = previousMonthYm(input.monthYm);
  const prev = prevYm ? aggregateMonth(input.records, prevYm) : null;

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
  doc.text('Consumo interno', pageW - margin, 10, { align: 'right' });
  doc.setTextColor(...PDF_ZINC_900);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Resumen mensual (PDF)', margin, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...PDF_ZINC_500);
  let metaY = 58;
  doc.text(`Local: ${input.localLabel}`, margin, metaY);
  metaY += 14;
  doc.text(`Periodo: ${cur.labelEs} (${formatKeyEs(cur.startYmd)} – ${formatKeyEs(cur.endYmd)})`, margin, metaY);
  metaY += 14;
  if (input.generatedByLabel?.trim()) {
    doc.text(`Generado por: ${input.generatedByLabel.trim()}`, margin, metaY);
    metaY += 14;
  }

  const kpiY = metaY + 10;
  const gap = 8;
  const nKpi = 6;
  const kpiW = (contentW - (nKpi - 1) * gap) / nKpi;
  const kpiH = 52;
  const peakLabel =
    cur.peakDay && cur.peakDay.cost > 0 ? `${formatKeyEs(cur.peakDay.key)} · ${cur.peakDay.cost.toFixed(2)} €` : '—';
  const kpis: [string, string][] = [
    ['Coste total', `${cur.totalEur.toFixed(2)} €`],
    ['Registros', String(cur.n)],
    ['Personas (Σ)', cur.peopleSum.toLocaleString('es-ES', { maximumFractionDigits: 2 })],
    ['Media / registro', cur.n > 0 ? `${cur.avgPerReg.toFixed(2)} €` : '—'],
    ['Media / persona', cur.peopleSum > 0 ? `${cur.avgPerPerson.toFixed(2)} €` : '—'],
    ['Servicio principal', cur.topLine],
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
    `Días con coste > 0: ${cur.daysWithCost} / ${cur.daysInMonth} · Pico diario: ${peakLabel} · Registros anulados en el mes (excluidos): ${cur.voidedInMonth.length}`,
    margin,
    yAfterKpi,
    { maxWidth: contentW },
  );
  yAfterKpi += 18;

  if (prev) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...PDF_ZINC_900);
    doc.text('Comparativa vs mes anterior', margin, yAfterKpi);
    yAfterKpi += 18;

    const compareBody = [
      [
        'Coste total (€)',
        prev.totalEur.toFixed(2),
        cur.totalEur.toFixed(2),
        fmtDeltaAbs(prev.totalEur, cur.totalEur, ' €'),
        fmtDeltaPct(prev.totalEur, cur.totalEur),
      ],
      [
        'Registros',
        String(prev.n),
        String(cur.n),
        (() => {
          const dr = cur.n - prev.n;
          if (dr === 0) return '0';
          return `${dr > 0 ? '+' : ''}${dr}`;
        })(),
        fmtDeltaPct(prev.n, cur.n),
      ],
      [
        'Personas (Σ)',
        prev.peopleSum.toLocaleString('es-ES', { maximumFractionDigits: 2 }),
        cur.peopleSum.toLocaleString('es-ES', { maximumFractionDigits: 2 }),
        fmtDeltaAbs(prev.peopleSum, cur.peopleSum),
        fmtDeltaPct(prev.peopleSum, cur.peopleSum),
      ],
      [
        'Media € / registro',
        prev.n > 0 ? prev.avgPerReg.toFixed(2) : '—',
        cur.n > 0 ? cur.avgPerReg.toFixed(2) : '—',
        prev.n > 0 && cur.n > 0 ? fmtDeltaAbs(prev.avgPerReg, cur.avgPerReg, ' €') : '—',
        prev.n > 0 && cur.n > 0 ? fmtDeltaPct(prev.avgPerReg, cur.avgPerReg) : '—',
      ],
      [
        'Media € / persona',
        prev.peopleSum > 0 ? prev.avgPerPerson.toFixed(2) : '—',
        cur.peopleSum > 0 ? cur.avgPerPerson.toFixed(2) : '—',
        prev.peopleSum > 0 && cur.peopleSum > 0 ? fmtDeltaAbs(prev.avgPerPerson, cur.avgPerPerson, ' €') : '—',
        prev.peopleSum > 0 && cur.peopleSum > 0 ? fmtDeltaPct(prev.avgPerPerson, cur.avgPerPerson) : '—',
      ],
    ];

    autoTable(doc, {
      startY: yAfterKpi,
      head: [['Concepto', `Mes anterior (${prev.labelEs})`, `Mes informe (${cur.labelEs})`, 'Diferencia', 'Var. %']],
      body: compareBody,
      styles: { fontSize: 8, cellPadding: 3, textColor: PDF_ZINC_900 },
      headStyles: { fillColor: PDF_BRAND, textColor: PDF_WHITE },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin },
      tableWidth: contentW,
    });
    yAfterKpi = (doc as DocWithTable).lastAutoTable?.finalY ?? yAfterKpi + 80;
    yAfterKpi += 10;

    const compareChartH = 118;
    const compareGap = 12;
    const totalW = contentW * 0.38;
    const svcW = contentW - totalW - compareGap;
    drawTwoMonthTotalCompare(doc, {
      x: margin,
      y: yAfterKpi,
      w: totalW,
      h: compareChartH,
      labelPrev: prev.labelEs,
      valuePrev: Math.round(prev.totalEur * 100) / 100,
      labelCurr: cur.labelEs,
      valueCurr: Math.round(cur.totalEur * 100) / 100,
    });
    drawServiceMoMCompare(doc, {
      x: margin + totalW + compareGap,
      y: yAfterKpi,
      w: svcW,
      h: compareChartH,
      prev,
      curr: cur,
    });
    yAfterKpi += compareChartH + 18;
  }

  if (yAfterKpi > pageH - 200) {
    doc.addPage();
    yAfterKpi = 36;
  }

  const chartY = yAfterKpi;
  const chartH = 156;
  const chartGap = 14;
  const leftW = contentW * 0.42;
  const rightW = contentW - leftW - chartGap;
  const serviceItems = SERVICE_ORDER.map((s) => ({
    label: SERVICE_LABEL[s],
    totalCost: Math.round((cur.byServiceCost.get(s) ?? 0) * 100) / 100,
  })).filter((x) => x.totalCost > 0);
  drawServiceCostBars(doc, { x: margin, y: chartY, w: leftW, h: chartH, items: serviceItems });
  drawDailyCostBars(doc, { x: margin + leftW + chartGap, y: chartY, w: rightW, h: chartH, days: cur.days });
  yAfterKpi = chartY + chartH + 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...PDF_ZINC_900);
  doc.text('Agregado por servicio (mes del informe)', margin, yAfterKpi);
  const summaryBody = SERVICE_ORDER.map((s) => {
    const cost = cur.byServiceCost.get(s) ?? 0;
    const regs = cur.byServiceRegs.get(s) ?? 0;
    const pers = cur.byServicePeople.get(s) ?? 0;
    const pct = cur.totalEur > 0 ? (cost / cur.totalEur) * 100 : 0;
    return [
      SERVICE_LABEL[s],
      String(regs),
      pers.toLocaleString('es-ES', { maximumFractionDigits: 2 }),
      `${cost.toFixed(2)} €`,
      cur.totalEur > 0 ? `${pct.toFixed(1)} %` : '—',
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

  yAfterKpi = appendWorkerTotalsTable(doc, {
    margin,
    contentW,
    pageH,
    title: `Totales por trabajador — ${cur.labelEs}`,
    active: cur.active,
    startY: yAfterKpi,
  });
  yAfterKpi += 16;

  yAfterKpi = appendWorkerTopIngredientsTable(doc, {
    margin,
    contentW,
    pageH,
    title: `Top 3 ingredientes consumidos por trabajador — ${cur.labelEs}`,
    active: cur.active,
    startY: yAfterKpi,
  });
  yAfterKpi += 16;

  if (prev) {
    yAfterKpi = appendWorkerTotalsTable(doc, {
      margin,
      contentW,
      pageH,
      title: `Anexo: totales por trabajador — ${prev.labelEs}`,
      active: prev.active,
      startY: yAfterKpi,
    });
    yAfterKpi += 16;
    appendWorkerTopIngredientsTable(doc, {
      margin,
      contentW,
      pageH,
      title: `Anexo: top 3 ingredientes por trabajador — ${prev.labelEs}`,
      active: prev.active,
      startY: yAfterKpi,
    });
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    pdfFooter(doc, p, totalPages);
  }

  const stamp = input.monthYm.replace(/-/g, '');
  doc.save(`comida-personal-${stamp}.pdf`);
}
